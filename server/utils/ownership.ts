import { SQL_MAY, type Standing, mayTransferOwnership } from './authority'
import type { Db, Queryable } from './db'
import { SQL_PENDING } from './invitations'
import { type Role, isOrbitId, standingOf } from './workspaces'

/**
 * Ownership transfers. Belonging remains.
 *
 * The owner hands ownership of a workspace to someone who already belongs to it, a Member or a
 * Steward. It takes effect at once, with no offer to accept:
 *   - the recipient becomes the owner, with the owner's full authority from that moment. Their
 *     membership row (its id and its stored role) is not touched: ownership is owner_id, and
 *     authority follows it whatever the role;
 *   - the former owner stays, as a Steward (role 'admin'), with a Steward's authority only. The new
 *     owner may later make them a Member or remove them, like anyone else;
 *   - the former owner's pending Steward invitations are withdrawn (revoked by them, while they
 *     are still the owner). Stewardship is granted only by the current owner: such an offer could
 *     no longer be accepted anyway (SQL_OFFER_STANDS, migration 007), and left open it would block
 *     the new owner from inviting that address again. Member invitations stay valid, whoever made
 *     them; closed and expired invitations are history and are never touched.
 *
 * One transaction, in this order (the order is what keeps it deadlock-free; verified against real
 * concurrent PostgreSQL sessions in test/concurrency):
 *   1. Lock the actor's membership, then the workspace row, FOR NO KEY UPDATE: the same rows, in
 *      the same order, as lockStanding takes them FOR SHARE in every other authority-bearing
 *      write. Holding the workspace row this way makes the transfer wait for, and then exclude,
 *      everything that relies on who owns the workspace or on anyone's role here: membership
 *      changes, invitations being made, withdrawn or accepted, and other transfers. Locking the
 *      actor's row strongly from the start means step 5 never has to upgrade a shared lock.
 *   2. Read the recipient's membership (no lock of its own: nothing can change it without the
 *      workspace row). The recipient's row is never written, so a recipient who is acting as a
 *      Steward meanwhile (holding their own row FOR SHARE) never conflicts with the transfer.
 *   3. Decide with mayTransferOwnership.
 *   4. Withdraw the former owner's pending Steward invitations.
 *   5. Move owner_id; then make the former owner a Steward.
 * Each write carries the same rule (SQL_MAY.transfer) inside the statement, so the database
 * privilege to change owner_id (migration 008) is only ever used by the current owner. At commit,
 * the deferred workspaces_owner_is_member key checks that the new owner is a member. Any failure
 * rolls back everything: ownership, roles and invitations stay exactly as they were.
 */

export type TransferOwnershipResult =
  | { ok: true; revokedInvitations: number }
  | { ok: false; reason: 'not_found' | 'forbidden' }

/** Thrown inside the transaction to roll it back when a write found nothing to change. */
class NotTransferred extends Error {}

/**
 * Hands ownership of `workspaceId` to the member whose membership id is `membershipId`.
 * 'not_found': outsiders (who learn nothing), and memberships that aren't in this workspace or no
 * longer exist. 'forbidden': anyone who isn't the owner (including a former owner acting from a
 * page that predates the transfer), and the owner naming themselves.
 */
export async function transferOwnership(db: Db, actorId: string, workspaceId: string, membershipId: string): Promise<TransferOwnershipResult> {
  if (!isOrbitId(workspaceId) || !isOrbitId(membershipId)) return { ok: false, reason: 'not_found' }
  try {
    return await db.begin(async (tx): Promise<TransferOwnershipResult> => {
      // 1. The actor's membership, then the workspace: lockStanding's rows and order, held exclusively.
      const [row] = await tx<{ role: Role; owner: boolean }[]>`
        SELECT m.role, (w.owner_id = m.user_id) AS owner
        FROM orbit.memberships m JOIN orbit.workspaces w ON w.id = m.workspace_id
        WHERE m.user_id = ${actorId} AND w.id = ${workspaceId}
        FOR NO KEY UPDATE
      `
      if (!row) return { ok: false, reason: 'not_found' } // outsiders learn nothing
      const actor: Standing = { userId: actorId, ...row }
      // 2. The recipient, in this workspace only.
      const target = await standingOf(tx, workspaceId, membershipId)
      if (!target) return { ok: false, reason: 'not_found' }
      // 3. Only the owner, and only to someone else.
      if (!mayTransferOwnership(actor, target)) return { ok: false, reason: 'forbidden' }

      // 4. The former owner's pending Steward invitations, withdrawn by them while still the owner.
      const revoked = await tx`
        UPDATE orbit.invitations i SET revoked_at = now(), revoked_by = m.user_id
        FROM orbit.memberships m JOIN orbit.workspaces w ON w.id = m.workspace_id, orbit.memberships t
        WHERE w.id = ${workspaceId} AND m.user_id = ${actorId}
          AND t.id = ${membershipId} AND t.workspace_id = w.id AND ${tx.unsafe(SQL_MAY.transfer)}
          AND i.workspace_id = w.id AND i.role = 'admin' AND i.invited_by = m.user_id AND ${tx.unsafe(SQL_PENDING)}
          AND ${tx.unsafe(SQL_MAY.revoke)}
        RETURNING i.id
      `
      // 5. Ownership moves, only from the current owner to the named member.
      const moved = await tx`
        UPDATE orbit.workspaces w SET owner_id = t.user_id
        FROM orbit.memberships m, orbit.memberships t
        WHERE w.id = ${workspaceId} AND m.workspace_id = w.id AND m.user_id = ${actorId}
          AND t.id = ${membershipId} AND t.workspace_id = w.id AND ${tx.unsafe(SQL_MAY.transfer)}
        RETURNING w.id
      `
      if (moved.length === 0) throw new NotTransferred()
      // Then the former owner, who no longer owns it, is a Steward (whatever their role was).
      const former = await tx`
        UPDATE orbit.memberships m SET role = 'admin'
        FROM orbit.workspaces w
        WHERE m.user_id = ${actorId} AND m.workspace_id = ${workspaceId} AND w.id = m.workspace_id
          AND w.owner_id <> m.user_id
        RETURNING m.id
      `
      if (former.length === 0) throw new NotTransferred()
      return { ok: true, revokedInvitations: revoked.length }
    })
  } catch (error) {
    if (!(error instanceof NotTransferred)) throw error
    // Unreachable while the locks above hold; answered truthfully all the same, from what is now.
    return await refusal(db, actorId, workspaceId, membershipId)
  }
}

async function refusal(db: Queryable, actorId: string, workspaceId: string, membershipId: string): Promise<TransferOwnershipResult> {
  const [actor] = await db`SELECT 1 FROM orbit.memberships WHERE user_id = ${actorId} AND workspace_id = ${workspaceId}`
  if (!actor || !(await standingOf(db, workspaceId, membershipId))) return { ok: false, reason: 'not_found' }
  return { ok: false, reason: 'forbidden' }
}
