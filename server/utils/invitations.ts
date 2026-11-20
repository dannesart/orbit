import { parseEmail } from './accounts'
import { SQL_MAY, SQL_OFFER_STANDS, mayInvite, mayRevoke, parseRole } from './authority'
import type { Db, Queryable } from './db'
import { CAN_MANAGE, type Role, getWorkspace, isOrbitId, lockStanding } from './workspaces'

/**
 * Invitations: an offer to join a workspace, made to one email address, as a Member or as a
 * Steward (role 'admin'; migrations 006 and 007). An invitation is not membership. Only the
 * person it is addressed to, signed in with that address, can accept it, and accepting is what
 * makes them a member, in the offered role. Who may offer, withdraw or accept what is decided in
 * server/utils/authority.ts. The database stores facts; status is derived.
 */
export type InvitationStatus = 'pending' | 'accepted' | 'declined' | 'revoked' | 'expired'

/**
 * An invitation as the workspace's owner and stewards see it: the only view that includes the
 * address it was made to. Never anyone's account id or the inviter's email.
 */
export interface Invitation {
  id: string
  workspaceId: string
  /** The address it was made to, normalised like sign-in addresses. Shown only to those who manage the workspace. */
  email: string
  /** What it offers: 'member', or 'admin' (Steward). Fixed once made. */
  role: Role
  status: InvitationStatus
  /**
   * Whether it can be accepted now, as offered. Its status is history; this is the present: a
   * pending Steward invitation stops being acceptable once its inviter no longer owns the workspace.
   */
  acceptable: boolean
  /** What the inviter asked to be called; null if they haven't said. */
  invitedBy: string | null
  createdAt: string
  expiresAt: string
  /** When it was accepted, declined or revoked; null while pending, and for one that simply expired. */
  closedAt: string | null
}

/** An invitation as its recipient sees it: who is asking, to what, and as what. Never the inviter's email. */
export interface ReceivedInvitation {
  id: string
  workspace: { id: string; name: string; description: string | null }
  role: Role
  /** What the inviter asked to be called; null if they haven't said. */
  invitedBy: string | null
  expiresAt: string
}

/**
 * One invitation, as its recipient sees it when they open its link, whatever has become of it:
 * pending, or honestly expired, declined, revoked or already accepted, and whether it can still
 * be accepted as offered.
 */
export type RecipientInvitation = ReceivedInvitation & { status: InvitationStatus; acceptable: boolean; closedAt: string | null }

/** What anyone holding an invitation's link may see, signed in or not: nothing more. */
export interface InvitationPreview {
  workspaceName: string
  role: Role
}

// Over an invitation `i`. No closing fact yet; and pending = open and not yet expired.
const OPEN = `(i.accepted_at IS NULL AND i.declined_at IS NULL AND i.revoked_at IS NULL)`
export const SQL_PENDING = `(${OPEN} AND i.expires_at > now())`
const PENDING = SQL_PENDING
// Acceptable: pending, and its offer still stands (over `i` and its workspace `w`).
const ACCEPTABLE = `(${PENDING} AND ${SQL_OFFER_STANDS})`
const STATUS = `CASE
  WHEN i.revoked_at IS NOT NULL THEN 'revoked'
  WHEN i.accepted_at IS NOT NULL THEN 'accepted'
  WHEN i.declined_at IS NOT NULL THEN 'declined'
  WHEN i.expires_at <= now() THEN 'expired'
  ELSE 'pending' END`
const CLOSED_AT = `COALESCE(i.accepted_at, i.declined_at, i.revoked_at)`
// The managers' view (Invitation), over an invitation `i`, its workspace `w` and its `inviter`.
const MANAGED = `i.id, i.workspace_id AS "workspaceId", i.email, i.role, ${STATUS} AS status, ${ACCEPTABLE} AS acceptable,
  inviter.display_name AS "invitedBy", i.created_at AS "createdAt", i.expires_at AS "expiresAt", ${CLOSED_AT} AS "closedAt"`

type Row = Omit<Invitation, 'createdAt' | 'expiresAt' | 'closedAt'> & { createdAt: Date; expiresAt: Date; closedAt: Date | null }
const toInvitation = ({ createdAt, expiresAt, closedAt, ...rest }: Row): Invitation =>
  ({ ...rest, createdAt: createdAt.toISOString(), expiresAt: expiresAt.toISOString(), closedAt: closedAt?.toISOString() ?? null })

const isExclusionViolation = (error: unknown) => (error as { code?: string }).code === '23P01'

export type CreateInvitationResult =
  | { ok: true; invitation: Invitation }
  | { ok: false; reason: 'invalid_email' | 'invalid_role' | 'not_found' | 'forbidden' | 'already_invited' }

/**
 * Invites an address to a workspace as a Member (the default) or a Steward, for 14 days (the
 * database sets the dates). The owner may offer either; a steward, Member only; members nothing
 * ('forbidden'); outsiders learn nothing ('not_found'). The role must be exactly 'member' or
 * 'admin' ('invalid_role'): there is no owner role to offer. Whether the address belongs to
 * anyone is never looked up. While one is pending for that workspace and address, another can't
 * be made ('already_invited'). Authority is checked under lock and again inside the INSERT.
 */
export async function createInvitation(
  db: Db, inviterId: string, workspaceId: string, emailInput: unknown, roleInput: unknown = 'member',
): Promise<CreateInvitationResult> {
  const email = parseEmail(emailInput)
  if (!email) return { ok: false, reason: 'invalid_email' }
  const role = parseRole(roleInput)
  if (!role) return { ok: false, reason: 'invalid_role' }

  try {
    return await db.begin(async (tx): Promise<CreateInvitationResult> => {
      const inviter = await lockStanding(tx, inviterId, workspaceId)
      if (!inviter) return { ok: false, reason: 'not_found' } // non-members learn nothing
      if (!mayInvite(inviter, role)) return { ok: false, reason: 'forbidden' }

      const [row] = await tx<Row[]>`
        WITH i AS (
          INSERT INTO orbit.invitations (workspace_id, email, invited_by, role)
          SELECT w.id, ${email}, m.user_id, ${role}
          FROM orbit.memberships m JOIN orbit.workspaces w ON w.id = m.workspace_id
          WHERE w.id = ${workspaceId} AND m.user_id = ${inviterId} AND ${tx.unsafe(SQL_MAY.invite(role))}
          RETURNING *
        )
        SELECT ${tx.unsafe(MANAGED)}
        FROM i JOIN orbit.workspaces w ON w.id = i.workspace_id JOIN orbit.users inviter ON inviter.id = i.invited_by
      `
      return row ? { ok: true, invitation: toInvitation(row) } : { ok: false, reason: 'forbidden' }
    })
  } catch (error) {
    // invitations_one_open_per_address: one is already pending for this workspace and address.
    if (isExclusionViolation(error)) return { ok: false, reason: 'already_invited' }
    throw error
  }
}

export type RevokeInvitationResult =
  | { ok: true; invitation: Invitation }
  | { ok: false; reason: 'not_found' | 'forbidden' }
  | { ok: false; reason: 'not_pending'; status: InvitationStatus }

/**
 * Withdraws a pending invitation. The owner may withdraw any; a steward, Member invitations
 * only (whoever made them: invitations are the workspace's). It stays as history. Outsiders get
 * 'not_found', whether or not it exists; one already expired or answered is 'not_pending'.
 */
export async function revokeInvitation(db: Db, userId: string, invitationId: string): Promise<RevokeInvitationResult> {
  if (!isOrbitId(invitationId)) return { ok: false, reason: 'not_found' }
  const [found] = await db<{ workspaceId: string }[]>`SELECT workspace_id AS "workspaceId" FROM orbit.invitations WHERE id = ${invitationId}`
  if (!found) return { ok: false, reason: 'not_found' }

  return db.begin(async (tx): Promise<RevokeInvitationResult> => {
    const actor = await lockStanding(tx, userId, found.workspaceId)
    if (!actor) return { ok: false, reason: 'not_found' } // the same answer as for no invitation at all
    const [current] = await tx<{ role: Role; status: InvitationStatus }[]>`
      SELECT i.role, ${tx.unsafe(STATUS)} AS status FROM orbit.invitations i WHERE i.id = ${invitationId}`
    if (!mayRevoke(actor, current!.role)) return { ok: false, reason: 'forbidden' }

    const [row] = await tx<Row[]>`
      WITH i AS (
        UPDATE orbit.invitations i SET revoked_at = now(), revoked_by = m.user_id
        FROM orbit.memberships m JOIN orbit.workspaces w ON w.id = m.workspace_id
        WHERE i.id = ${invitationId} AND ${tx.unsafe(PENDING)}
          AND m.workspace_id = i.workspace_id AND m.user_id = ${userId} AND ${tx.unsafe(SQL_MAY.revoke)}
        RETURNING i.*
      )
      SELECT ${tx.unsafe(MANAGED)}
      FROM i JOIN orbit.workspaces w ON w.id = i.workspace_id JOIN orbit.users inviter ON inviter.id = i.invited_by
    `
    if (row) return { ok: true, invitation: toInvitation(row) }
    return { ok: false, reason: 'not_pending', status: await statusOf(tx, invitationId) }
  })
}

export type ListInvitationsResult =
  | { ok: true; invitations: Invitation[] }
  | { ok: false; reason: 'not_found' | 'forbidden' }

/**
 * A workspace's invitations, newest first, whatever became of them, for its owner and stewards
 * only: members get 'forbidden', outsiders 'not_found'. As elsewhere, authority is checked first
 * and again inside the query, so a list is never read without it.
 */
export async function listWorkspaceInvitations(db: Db, userId: string, workspaceId: string): Promise<ListInvitationsResult> {
  const workspace = await getWorkspace(db, userId, workspaceId)
  if (!workspace) return { ok: false, reason: 'not_found' } // non-members learn nothing
  if (!workspace.canManage) return { ok: false, reason: 'forbidden' }

  const rows = await db<Row[]>`
    SELECT ${db.unsafe(MANAGED)}
    FROM orbit.invitations i
      JOIN orbit.users inviter ON inviter.id = i.invited_by
      JOIN orbit.workspaces w ON w.id = i.workspace_id
      JOIN orbit.memberships m ON m.workspace_id = w.id AND m.user_id = ${userId}
    WHERE w.id = ${workspaceId} AND ${db.unsafe(CAN_MANAGE)}
    ORDER BY i.created_at DESC, i.id
  `
  return { ok: true, invitations: rows.map(toInvitation) }
}

/**
 * Invitations this account can accept now, addressed to its verified email address, newest
 * first. The address comes from the account itself (as proven at sign-in), never from the
 * caller. One whose offer no longer stands isn't offered (its link still tells the recipient).
 */
export async function findInvitationsFor(db: Db, userId: string): Promise<ReceivedInvitation[]> {
  const rows = await db<{ id: string; workspaceId: string; name: string; description: string | null; role: Role; invitedBy: string | null; expiresAt: Date }[]>`
    SELECT i.id, w.id AS "workspaceId", w.name, w.description, i.role, inviter.display_name AS "invitedBy", i.expires_at AS "expiresAt"
    FROM orbit.users u
      JOIN orbit.invitations i ON i.email = lower(u.email)
      JOIN orbit.workspaces w ON w.id = i.workspace_id
      JOIN orbit.users inviter ON inviter.id = i.invited_by
    WHERE u.id = ${userId} AND ${db.unsafe(ACCEPTABLE)}
    ORDER BY i.created_at DESC
  `
  return rows.map((r) => ({
    id: r.id,
    workspace: { id: r.workspaceId, name: r.name, description: r.description },
    role: r.role,
    invitedBy: r.invitedBy,
    expiresAt: r.expiresAt.toISOString(),
  }))
}

/**
 * One invitation, for its recipient opening its link: matched, like answering, by this account's
 * verified address, never by anything the caller says. Its status is told as it is, so an
 * expired or answered invitation is never presented as pending. Someone else's invitation, a
 * nonexistent one, and an id Orbit could never have issued are all null: indistinguishable.
 * Reading never answers it or changes anything.
 */
export async function getInvitationFor(db: Db, userId: string, invitationId: string): Promise<RecipientInvitation | null> {
  if (!isOrbitId(invitationId)) return null
  const [row] = await db<{
    id: string; workspaceId: string; name: string; description: string | null; role: Role; invitedBy: string | null
    status: InvitationStatus; acceptable: boolean; expiresAt: Date; closedAt: Date | null
  }[]>`
    SELECT i.id, w.id AS "workspaceId", w.name, w.description, i.role, inviter.display_name AS "invitedBy",
      ${db.unsafe(STATUS)} AS status, ${db.unsafe(ACCEPTABLE)} AS acceptable, i.expires_at AS "expiresAt", ${db.unsafe(CLOSED_AT)} AS "closedAt"
    FROM orbit.users u
      JOIN orbit.invitations i ON i.email = lower(u.email)
      JOIN orbit.workspaces w ON w.id = i.workspace_id
      JOIN orbit.users inviter ON inviter.id = i.invited_by
    WHERE u.id = ${userId} AND i.id = ${invitationId}
  `
  if (!row) return null
  return {
    id: row.id,
    workspace: { id: row.workspaceId, name: row.name, description: row.description },
    role: row.role,
    invitedBy: row.invitedBy,
    expiresAt: row.expiresAt.toISOString(),
    status: row.status,
    acceptable: row.acceptable,
    closedAt: row.closedAt?.toISOString() ?? null,
  }
}

/**
 * The public preview of an invitation's link, for anyone holding it, signed in or not: the
 * workspace's name and the role offered, and only while it can be accepted. Anything else (an
 * unknown or malformed id, or an invitation expired, answered, withdrawn or no longer standing)
 * is null, all alike. Never the recipient, the inviter, members, the purpose or any id.
 */
export async function getInvitationPreview(db: Db, invitationId: string): Promise<InvitationPreview | null> {
  if (!isOrbitId(invitationId)) return null
  const [row] = await db<InvitationPreview[]>`
    SELECT w.name AS "workspaceName", i.role
    FROM orbit.invitations i JOIN orbit.workspaces w ON w.id = i.workspace_id
    WHERE i.id = ${invitationId} AND ${db.unsafe(ACCEPTABLE)}
  `
  return row ?? null
}

export type AnswerResult<T> =
  | ({ ok: true } & T)
  | { ok: false; reason: 'not_found' | 'no_longer_valid' }
  | { ok: false; reason: 'not_pending'; status: InvitationStatus }

/**
 * The recipient accepts: in one transaction, the invitation records who accepted, and they hold
 * the offered role. This is the only way, besides creating a workspace, that anyone joins one.
 *   - A newcomer joins in the offered role (joined: true).
 *   - Someone already here keeps their place (joined: false). A Steward invitation makes a
 *     Member a steward; nothing ever lowers a role, so a steward or the owner stays as they are.
 *   - A Steward invitation is accepted only while its inviter owns the workspace; otherwise it
 *     is 'no_longer_valid' and stays pending as it was: never quietly accepted as Member.
 * Only an invitation addressed to this account's address can be accepted; anyone else's is
 * 'not_found'. The workspace row is locked first (FOR SHARE), so who owns it can't change while
 * this decides; the database checks recipient, membership, role and inviter again at commit.
 */
export async function acceptInvitation(
  db: Db, userId: string, invitationId: string,
): Promise<AnswerResult<{ workspaceId: string; joined: boolean; role: Role }>> {
  if (!isOrbitId(invitationId)) return { ok: false, reason: 'not_found' }
  const accepted = await db.begin(async (tx) => {
    await tx`
      SELECT 1 FROM orbit.workspaces w JOIN orbit.invitations i ON i.workspace_id = w.id
      WHERE i.id = ${invitationId} FOR SHARE OF w`
    const [invitation] = await tx<{ workspaceId: string; role: Role }[]>`
      UPDATE orbit.invitations i SET accepted_at = now(), accepted_by = u.id
      FROM orbit.users u, orbit.workspaces w
      WHERE i.id = ${invitationId} AND u.id = ${userId} AND i.email = lower(u.email)
        AND w.id = i.workspace_id AND ${tx.unsafe(ACCEPTABLE)}
      RETURNING i.workspace_id AS "workspaceId", i.role
    `
    if (!invitation) return null
    // Upgrade-only: a Steward invitation raises a Member; nothing lowers anyone.
    const [membership] = await tx<{ joined: boolean; role: Role }[]>`
      INSERT INTO orbit.memberships AS m (user_id, workspace_id, role)
      VALUES (${userId}, ${invitation.workspaceId}, ${invitation.role})
      ON CONFLICT (user_id, workspace_id) DO UPDATE SET role = 'admin'
        WHERE excluded.role = 'admin' AND m.role = 'member'
      RETURNING (xmax = 0) AS joined, m.role
    `
    const role = membership?.role ?? (await tx<{ role: Role }[]>`
      SELECT role FROM orbit.memberships WHERE user_id = ${userId} AND workspace_id = ${invitation.workspaceId}`)[0]!.role
    return { workspaceId: invitation.workspaceId, joined: membership?.joined ?? false, role }
  })
  return accepted ? { ok: true, ...accepted } : notAnswered(db, userId, invitationId)
}

/**
 * The recipient declines. Nothing else changes; the invitation stays as history. A pending
 * invitation can be declined even when its offer no longer stands, so its recipient can close it.
 */
export async function declineInvitation(db: Db, userId: string, invitationId: string): Promise<AnswerResult<object>> {
  if (!isOrbitId(invitationId)) return { ok: false, reason: 'not_found' }
  const [declined] = await db`
    UPDATE orbit.invitations i SET declined_at = now()
    FROM orbit.users u
    WHERE i.id = ${invitationId} AND u.id = ${userId} AND i.email = lower(u.email) AND ${db.unsafe(PENDING)}
    RETURNING i.id
  `
  return declined ? { ok: true } : notAnswered(db, userId, invitationId)
}

/** Why an answer didn't apply: not theirs (or nonexistent) is indistinguishable from not found. */
async function notAnswered(db: Db, userId: string, invitationId: string): Promise<AnswerResult<never>> {
  const [mine] = await db<{ status: InvitationStatus; stands: boolean }[]>`
    SELECT ${db.unsafe(STATUS)} AS status, ${db.unsafe(SQL_OFFER_STANDS)} AS stands
    FROM orbit.invitations i JOIN orbit.users u ON i.email = lower(u.email) JOIN orbit.workspaces w ON w.id = i.workspace_id
    WHERE i.id = ${invitationId} AND u.id = ${userId}
  `
  if (!mine) return { ok: false, reason: 'not_found' }
  if (mine.status === 'pending' && !mine.stands) return { ok: false, reason: 'no_longer_valid' }
  return { ok: false, reason: 'not_pending', status: mine.status }
}

async function statusOf(db: Queryable, invitationId: string): Promise<InvitationStatus> {
  const [row] = await db<{ status: InvitationStatus }[]>`SELECT ${db.unsafe(STATUS)} AS status FROM orbit.invitations i WHERE i.id = ${invitationId}`
  return row!.status
}
