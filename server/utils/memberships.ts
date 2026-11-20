import { type MembershipAction, SQL_MAY, allowedActions, blockedByStewardshipOffer, parseRole } from './authority'
import type { Db, Queryable } from './db'
import { SQL_PENDING } from './invitations'
import { type Role, isOrbitId, lockStanding, standingOf } from './workspaces'

/**
 * Changing someone's place in a workspace: promoting a Member to Steward, demoting a Steward to
 * Member, and removing someone. Who may do which is allowedActions (server/utils/authority.ts):
 * the owner promotes, demotes and removes; a steward removes Members; nobody acts on themselves
 * or on the owner. Ownership itself never changes here.
 *
 * Every operation runs in one transaction, in the same order:
 *   1. lock the actor's standing (their membership and the workspace, FOR SHARE), so a change to
 *      their role, or to who owns the workspace, waits for this action, or is seen by it;
 *   2. read the target and decide with allowedActions ('forbidden' if not allowed);
 *   3. write with the same rule inside the statement, conditional on the target's current role.
 * If the write finds nothing to change, the target changed in between ('role_changed'), or left
 * ('not_found').
 */

export type ChangeMemberResult =
  | { ok: true; membershipId: string; role: Role }
  | { ok: false; reason: 'invalid_role' | 'not_found' | 'forbidden' }
  | { ok: false; reason: 'role_changed'; role: Role }

/**
 * Gives a membership the role `roleInput` ('member' or 'admin', exactly): promotion or demotion,
 * by the owner only. Asking for the role someone already has changes nothing and succeeds, for
 * whoever could have changed it; anyone else is still 'forbidden'.
 */
export async function setMemberRole(
  db: Db, actorId: string, workspaceId: string, membershipId: string, roleInput: unknown,
): Promise<ChangeMemberResult> {
  const role = parseRole(roleInput)
  if (!role) return { ok: false, reason: 'invalid_role' }
  if (!isOrbitId(membershipId)) return { ok: false, reason: 'not_found' }

  return db.begin(async (tx): Promise<ChangeMemberResult> => {
    const actor = await lockStanding(tx, actorId, workspaceId)
    if (!actor) return { ok: false, reason: 'not_found' } // outsiders learn nothing
    const target = await standingOf(tx, workspaceId, membershipId)
    if (!target) return { ok: false, reason: 'not_found' }

    const allowed = allowedActions(actor, target)
    const action: MembershipAction = role === 'admin' ? 'promote' : 'demote'
    if (target.role === role) {
      return allowed.includes('promote') || allowed.includes('demote')
        ? { ok: true, membershipId, role }
        : { ok: false, reason: 'forbidden' }
    }
    if (!allowed.includes(action)) return { ok: false, reason: 'forbidden' }

    const [changed] = await tx<{ role: Role }[]>`
      UPDATE orbit.memberships t SET role = ${role}
      FROM orbit.memberships m JOIN orbit.workspaces w ON w.id = m.workspace_id
      WHERE t.id = ${membershipId} AND t.workspace_id = ${workspaceId}
        AND m.workspace_id = t.workspace_id AND m.user_id = ${actorId} AND ${tx.unsafe(SQL_MAY[action])}
      RETURNING t.role
    `
    if (changed) return { ok: true, membershipId, role: changed.role }
    return changedMeanwhile(tx, workspaceId, membershipId)
  })
}

export type RemoveMemberResult =
  | { ok: true; revokedInvitations: number }
  | { ok: false; reason: 'not_found' | 'forbidden' | 'stewardship_offered' }
  | { ok: false; reason: 'role_changed'; role: Role }

/** Thrown inside the transaction to roll it back, invitation revocations included. */
class NotRemoved extends Error {}

/**
 * Removes someone from a workspace: the owner removes Members and Stewards; a steward removes
 * Members. In the same transaction, their pending invitations to this workspace are withdrawn
 * (revoked by the remover), so an earlier offer can't bring them back.
 *
 * Owners grant stewardship: while the owner has a standing offer of stewardship to a Member, a
 * steward can't remove them ('stewardship_offered'), and so can never close that offer either.
 * The owner can, and their removal withdraws it with everything else. Only invitations the
 * remover may withdraw are ever withdrawn (SQL_MAY.revoke): a steward never closes a Steward
 * invitation, not even one whose inviter is no longer the owner (which doesn't block removal).
 *
 * The order matters, and is verified against real concurrent PostgreSQL sessions
 * (test/concurrency): invitations are revoked BEFORE the membership is deleted. An acceptance
 * that is in flight holds its invitation's row, so removal waits for it and then removes the
 * person; one that comes later waits for removal and finds its invitation revoked. In the
 * opposite order, a waiting acceptance would re-create the membership just removed.
 * Both statements carry the same removal rule; if the delete then finds nothing to remove, the
 * whole transaction, revocations included, is rolled back.
 */
export async function removeMember(db: Db, actorId: string, workspaceId: string, membershipId: string): Promise<RemoveMemberResult> {
  if (!isOrbitId(membershipId)) return { ok: false, reason: 'not_found' }
  try {
    return await db.begin(async (tx): Promise<RemoveMemberResult> => {
      const actor = await lockStanding(tx, actorId, workspaceId)
      if (!actor) return { ok: false, reason: 'not_found' } // outsiders learn nothing
      const target = await standingOf(tx, workspaceId, membershipId)
      if (!target) return { ok: false, reason: 'not_found' }
      if (blockedByStewardshipOffer(actor, target)) return { ok: false, reason: 'stewardship_offered' }
      if (!allowedActions(actor, target).includes('remove')) return { ok: false, reason: 'forbidden' }

      // 1. Their pending invitations here (those the remover may withdraw), first.
      const revoked = await tx`
        UPDATE orbit.invitations i SET revoked_at = now(), revoked_by = m.user_id
        FROM orbit.memberships t JOIN orbit.users u ON u.id = t.user_id,
          orbit.memberships m JOIN orbit.workspaces w ON w.id = m.workspace_id
        WHERE t.id = ${membershipId} AND t.workspace_id = ${workspaceId}
          AND m.workspace_id = t.workspace_id AND m.user_id = ${actorId}
          AND i.workspace_id = t.workspace_id AND i.email = lower(u.email) AND ${tx.unsafe(SQL_PENDING)}
          AND ${tx.unsafe(SQL_MAY.remove)} AND ${tx.unsafe(SQL_MAY.revoke)}
        RETURNING i.id
      `
      // 2. Then the membership itself.
      const removed = await tx`
        DELETE FROM orbit.memberships t
        USING orbit.memberships m JOIN orbit.workspaces w ON w.id = m.workspace_id
        WHERE t.id = ${membershipId} AND t.workspace_id = ${workspaceId}
          AND m.workspace_id = t.workspace_id AND m.user_id = ${actorId} AND ${tx.unsafe(SQL_MAY.remove)}
        RETURNING t.user_id
      `
      if (removed.length === 0) throw new NotRemoved()
      return { ok: true, revokedInvitations: revoked.length }
    })
  } catch (error) {
    if (!(error instanceof NotRemoved)) throw error
    // Allowed when checked, refused by the writes: the target changed, or (for a steward) the
    // owner offered them stewardship in between.
    const now = await standingOf(db, workspaceId, membershipId)
    if (now?.role === 'member' && now.stewardshipOffered) return { ok: false, reason: 'stewardship_offered' }
    return changedMeanwhile(db, workspaceId, membershipId)
  }
}

async function changedMeanwhile(db: Queryable, workspaceId: string, membershipId: string) {
  const now = await standingOf(db, workspaceId, membershipId)
  return now ? { ok: false as const, reason: 'role_changed' as const, role: now.role } : { ok: false as const, reason: 'not_found' as const }
}
