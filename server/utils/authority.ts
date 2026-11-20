import type { Role } from './workspaces'

/**
 * Who may do what in a workspace: Orbit's whole authority model, in one place.
 *
 *   Owners grant stewardship. Stewards invite membership. Members belong and participate.
 *
 * Ownership is workspaces.owner_id, never a role. Only a transfer moves it (mayTransferOwnership,
 * server/utils/ownership.ts); nothing creates a second owner or leaves a workspace without one.
 * Roles are 'admin' (Steward in the product) and 'member'.
 *
 * Each rule exists twice, deliberately side by side: as a function, for deciding and explaining
 * an answer before writing, and as SQL, checked again inside the very statement that writes, so
 * a decision and its write can never drift apart. Tests check that both always agree.
 */

/** Someone's standing in one workspace. */
export interface Standing {
  userId: string
  role: Role
  owner: boolean
  /**
   * They hold a pending Steward invitation from the workspace's current owner: the owner has
   * offered them stewardship and it can still be accepted. (Known for a target; see standingOf.)
   */
  stewardshipOffered?: boolean
}

export type MembershipAction = 'promote' | 'demote' | 'remove'

/**
 * What `actor` may do to `target`'s membership. Nobody acts on themselves or on the owner.
 * The owner promotes Members, demotes Stewards and removes either; a Steward removes Members,
 * except a Member the owner has offered stewardship to, whose place is the owner's decision
 * while that offer stands. Members manage nobody.
 */
export function allowedActions(actor: Standing, target: Standing): MembershipAction[] {
  if (target.owner || target.userId === actor.userId) return []
  if (actor.owner) return target.role === 'member' ? ['promote', 'remove'] : ['demote', 'remove']
  if (actor.role === 'admin' && target.role === 'member' && !target.stewardshipOffered) return ['remove']
  return []
}

/**
 * Whether the only thing keeping `actor` from removing `target` is the owner's standing offer of
 * stewardship to them ('stewardship_offered', rather than a plain 'forbidden').
 */
export function blockedByStewardshipOffer(actor: Standing, target: Standing): boolean {
  return !!target.stewardshipOffered && !allowedActions(actor, target).includes('remove')
    && allowedActions(actor, { ...target, stewardshipOffered: false }).includes('remove')
}

/**
 * Whether `actor` may hand ownership to `target`: only the owner, and only to someone else who
 * belongs here (Member or Steward alike). Kept apart from allowedActions on purpose, so the
 * `actions` vocabulary that browsers already interpret never gains a value they don't know.
 */
export function mayTransferOwnership(actor: Standing, target: Standing): boolean {
  return actor.owner && !target.owner && target.userId !== actor.userId
}

/** Which roles `actor` may offer by invitation: the owner offers either; a Steward, Member only. */
export function mayInvite(actor: Standing, role: Role): boolean {
  return role === 'admin' ? actor.owner : actor.owner || actor.role === 'admin'
}

/** The roles `actor` may offer by invitation, in order: none for a member. */
export function offerableRoles(actor: Standing): Role[] {
  return (['member', 'admin'] as const).filter((role) => mayInvite(actor, role))
}

/** Whether `actor` may withdraw an invitation offering `role`. */
export function mayRevoke(actor: Standing, role: Role): boolean {
  return mayInvite(actor, role) // whoever may offer a role may withdraw such an offer
}

/**
 * A role, for an invitation to offer or a membership to have: exactly 'member' or 'admin', as
 * written. Nothing is mapped or guessed, and 'owner' is never one: ownership isn't a role.
 */
export function parseRole(input: unknown): Role | null {
  return input === 'member' || input === 'admin' ? input : null
}

// --- The same rules in SQL. Aliases: m = the actor's membership, w = its workspace,
// t = the target membership, i = an invitation. ---

const IS_OWNER = `(w.owner_id = m.user_id)`
const NOT_SELF_OR_OWNER = `(t.user_id <> w.owner_id AND t.user_id <> m.user_id)`

/**
 * Standing.stewardshipOffered, over target `t` in workspace `w`: a pending Steward invitation to
 * t's address, from w's current owner (so still acceptable; one from a former owner doesn't count).
 */
export const SQL_STEWARDSHIP_OFFERED = `EXISTS (
  SELECT 1 FROM orbit.invitations offer, orbit.users offered
  WHERE offered.id = t.user_id AND offer.workspace_id = t.workspace_id AND offer.email = lower(offered.email)
    AND offer.role = 'admin' AND offer.invited_by = w.owner_id
    AND offer.accepted_at IS NULL AND offer.declined_at IS NULL AND offer.revoked_at IS NULL AND offer.expires_at > now())`

export const SQL_MAY = {
  promote: `(${IS_OWNER} AND t.role = 'member' AND ${NOT_SELF_OR_OWNER})`,
  demote: `(${IS_OWNER} AND t.role = 'admin' AND ${NOT_SELF_OR_OWNER})`,
  remove: `(${NOT_SELF_OR_OWNER} AND (${IS_OWNER} OR (m.role = 'admin' AND t.role = 'member' AND NOT ${SQL_STEWARDSHIP_OFFERED})))`,
  /** Offering `role` by invitation. */
  invite: (role: Role) => (role === 'admin' ? IS_OWNER : `(m.role = 'admin' OR ${IS_OWNER})`),
  /** Withdrawing invitation `i`. */
  revoke: `(${IS_OWNER} OR (m.role = 'admin' AND i.role = 'member'))`,
  /** Handing ownership of `w` to the member `t` (mayTransferOwnership). */
  transfer: `(${IS_OWNER} AND ${NOT_SELF_OR_OWNER})`,
} as const

/**
 * Whether invitation `i` (in workspace `w`) can still be accepted as offered, beyond being
 * pending: a Steward invitation only while its inviter is the owner. Migration 007 checks the
 * same at commit. A Member invitation stays valid whatever became of its inviter.
 */
export const SQL_OFFER_STANDS = `(i.role = 'member' OR w.owner_id = i.invited_by)`
