import { parseEmail } from './accounts'
import type { Db } from './db'
import { CAN_MANAGE, getWorkspace, isOrbitId } from './workspaces'

/**
 * Invitations: an offer to join a workspace, made to one email address (migration 006).
 * An invitation is not membership. Only the person it is addressed to, signed in with that
 * address, can accept it, and accepting is what makes them a member: as Member, never more.
 * The database stores facts (created, expires, accepted, declined, revoked); status is derived.
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
  status: InvitationStatus
  /** What the inviter asked to be called; null if they haven't said. */
  invitedBy: string | null
  createdAt: string
  expiresAt: string
  /** When it was accepted, declined or revoked; null while pending, and for one that simply expired. */
  closedAt: string | null
}

/** An invitation as its recipient sees it: who is asking, and to what. Never the inviter's email. */
export interface ReceivedInvitation {
  id: string
  workspace: { id: string; name: string; description: string | null }
  /** What the inviter asked to be called; null if they haven't said. */
  invitedBy: string | null
  expiresAt: string
}

/**
 * One invitation, as its recipient sees it when they open its link, whatever has become of it:
 * pending, or honestly expired, declined, revoked or already accepted.
 */
export type RecipientInvitation = ReceivedInvitation & { status: InvitationStatus; closedAt: string | null }

// Over an invitation `i`. No closing fact yet; and pending = open and not yet expired.
const OPEN = `(i.accepted_at IS NULL AND i.declined_at IS NULL AND i.revoked_at IS NULL)`
const PENDING = `(${OPEN} AND i.expires_at > now())`
const STATUS = `CASE
  WHEN i.revoked_at IS NOT NULL THEN 'revoked'
  WHEN i.accepted_at IS NOT NULL THEN 'accepted'
  WHEN i.declined_at IS NOT NULL THEN 'declined'
  WHEN i.expires_at <= now() THEN 'expired'
  ELSE 'pending' END`
const CLOSED_AT = `COALESCE(i.accepted_at, i.declined_at, i.revoked_at)`
// The managers' view (Invitation), over an invitation `i` joined to its `inviter`.
const MANAGED = `i.id, i.workspace_id AS "workspaceId", i.email, ${STATUS} AS status, inviter.display_name AS "invitedBy",
  i.created_at AS "createdAt", i.expires_at AS "expiresAt", ${CLOSED_AT} AS "closedAt"`

type Row = Omit<Invitation, 'createdAt' | 'expiresAt' | 'closedAt'> & { createdAt: Date; expiresAt: Date; closedAt: Date | null }
const toInvitation = ({ createdAt, expiresAt, closedAt, ...rest }: Row): Invitation =>
  ({ ...rest, createdAt: createdAt.toISOString(), expiresAt: expiresAt.toISOString(), closedAt: closedAt?.toISOString() ?? null })

export type CreateInvitationResult =
  | { ok: true; invitation: Invitation }
  | { ok: false; reason: 'invalid_email' | 'not_found' | 'forbidden' | 'already_invited' }

/**
 * The owner or a steward invites an address to their workspace, for 14 days (the database sets
 * the dates). Whether the address belongs to anyone in Orbit, or to someone already here, is
 * never looked up: an invitation is addressed to an email, and is resolved only when its
 * recipient signs in and answers. While one is pending for that workspace and address, another
 * can't be made ('already_invited'); after it has expired, been declined or revoked, a new one
 * can. As in updateWorkspace, authority is checked first and again inside the INSERT.
 */
export async function createInvitation(
  db: Db, inviterId: string, workspaceId: string, emailInput: unknown,
): Promise<CreateInvitationResult> {
  const email = parseEmail(emailInput)
  if (!email) return { ok: false, reason: 'invalid_email' }
  const workspace = await getWorkspace(db, inviterId, workspaceId)
  if (!workspace) return { ok: false, reason: 'not_found' } // non-members learn nothing
  if (!workspace.canManage) return { ok: false, reason: 'forbidden' }

  try {
    const [row] = await db<Row[]>`
      WITH i AS (
        INSERT INTO orbit.invitations (workspace_id, email, invited_by)
        SELECT w.id, ${email}, m.user_id
        FROM orbit.memberships m JOIN orbit.workspaces w ON w.id = m.workspace_id
        WHERE w.id = ${workspaceId} AND m.user_id = ${inviterId} AND ${db.unsafe(CAN_MANAGE)}
        RETURNING *
      )
      SELECT ${db.unsafe(MANAGED)} FROM i JOIN orbit.users inviter ON inviter.id = i.invited_by
    `
    return row ? { ok: true, invitation: toInvitation(row) } : { ok: false, reason: 'forbidden' }
  } catch (error) {
    // invitations_one_open_per_address: one is already pending for this workspace and address.
    if ((error as { code?: string }).code === '23P01') return { ok: false, reason: 'already_invited' }
    throw error
  }
}

export type RevokeInvitationResult =
  | { ok: true; invitation: Invitation }
  | { ok: false; reason: 'not_found' | 'forbidden' }
  | { ok: false; reason: 'not_pending'; status: InvitationStatus }

/**
 * The owner or a steward withdraws a pending invitation (any of them, not only its inviter:
 * invitations are the workspace's). It stays as history. Outsiders get 'not_found', whether or
 * not it exists; an invitation that has already expired or been answered is 'not_pending'.
 */
export async function revokeInvitation(db: Db, userId: string, invitationId: string): Promise<RevokeInvitationResult> {
  if (!isOrbitId(invitationId)) return { ok: false, reason: 'not_found' }
  const [current] = await db<{ status: InvitationStatus; canManage: boolean }[]>`
    SELECT ${db.unsafe(STATUS)} AS status, ${db.unsafe(CAN_MANAGE)} AS "canManage"
    FROM orbit.invitations i
      JOIN orbit.memberships m ON m.workspace_id = i.workspace_id AND m.user_id = ${userId}
      JOIN orbit.workspaces w ON w.id = i.workspace_id
    WHERE i.id = ${invitationId}
  `
  if (!current) return { ok: false, reason: 'not_found' }
  if (!current.canManage) return { ok: false, reason: 'forbidden' }

  const [row] = await db<Row[]>`
    WITH i AS (
      UPDATE orbit.invitations i SET revoked_at = now(), revoked_by = m.user_id
      FROM orbit.memberships m JOIN orbit.workspaces w ON w.id = m.workspace_id
      WHERE i.id = ${invitationId} AND ${db.unsafe(PENDING)}
        AND m.workspace_id = i.workspace_id AND m.user_id = ${userId} AND ${db.unsafe(CAN_MANAGE)}
      RETURNING i.*
    )
    SELECT ${db.unsafe(MANAGED)} FROM i JOIN orbit.users inviter ON inviter.id = i.invited_by
  `
  if (row) return { ok: true, invitation: toInvitation(row) }
  return { ok: false, reason: 'not_pending', status: await statusOf(db, invitationId) }
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
 * Pending invitations addressed to this account's verified email address, newest first. The
 * address comes from the account itself (as proven at sign-in), never from the caller.
 */
export async function findInvitationsFor(db: Db, userId: string): Promise<ReceivedInvitation[]> {
  const rows = await db<{ id: string; workspaceId: string; name: string; description: string | null; invitedBy: string | null; expiresAt: Date }[]>`
    SELECT i.id, w.id AS "workspaceId", w.name, w.description, inviter.display_name AS "invitedBy", i.expires_at AS "expiresAt"
    FROM orbit.users u
      JOIN orbit.invitations i ON i.email = lower(u.email)
      JOIN orbit.workspaces w ON w.id = i.workspace_id
      JOIN orbit.users inviter ON inviter.id = i.invited_by
    WHERE u.id = ${userId} AND ${db.unsafe(PENDING)}
    ORDER BY i.created_at DESC
  `
  return rows.map((r) => ({
    id: r.id,
    workspace: { id: r.workspaceId, name: r.name, description: r.description },
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
    id: string; workspaceId: string; name: string; description: string | null; invitedBy: string | null
    status: InvitationStatus; expiresAt: Date; closedAt: Date | null
  }[]>`
    SELECT i.id, w.id AS "workspaceId", w.name, w.description, inviter.display_name AS "invitedBy",
      ${db.unsafe(STATUS)} AS status, i.expires_at AS "expiresAt", ${db.unsafe(CLOSED_AT)} AS "closedAt"
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
    invitedBy: row.invitedBy,
    expiresAt: row.expiresAt.toISOString(),
    status: row.status,
    closedAt: row.closedAt?.toISOString() ?? null,
  }
}

export type AnswerResult<T> =
  | ({ ok: true } & T)
  | { ok: false; reason: 'not_found' }
  | { ok: false; reason: 'not_pending'; status: InvitationStatus }

/**
 * The recipient accepts: in one transaction, the invitation records who accepted, and they
 * become a Member. This is the only way, besides creating a workspace, that anyone joins one.
 * Someone who already belongs keeps their place and role exactly as it is (joined: false).
 * Only a pending invitation addressed to this account's address can be accepted. Anything else,
 * including an invitation that exists but is someone else's, is 'not_found'. The database also
 * refuses to record an acceptance after expiry, or without the membership, at commit.
 */
export async function acceptInvitation(
  db: Db, userId: string, invitationId: string,
): Promise<AnswerResult<{ workspaceId: string; joined: boolean }>> {
  if (!isOrbitId(invitationId)) return { ok: false, reason: 'not_found' }
  const accepted = await db.begin(async (tx) => {
    const [invitation] = await tx<{ workspaceId: string }[]>`
      UPDATE orbit.invitations i SET accepted_at = now(), accepted_by = u.id
      FROM orbit.users u
      WHERE i.id = ${invitationId} AND u.id = ${userId} AND i.email = lower(u.email) AND ${tx.unsafe(PENDING)}
      RETURNING i.workspace_id AS "workspaceId"
    `
    if (!invitation) return null
    const joined = await tx`
      INSERT INTO orbit.memberships (user_id, workspace_id, role) VALUES (${userId}, ${invitation.workspaceId}, 'member')
      ON CONFLICT (user_id, workspace_id) DO NOTHING
      RETURNING 1
    `
    return { workspaceId: invitation.workspaceId, joined: joined.length === 1 }
  })
  return accepted ? { ok: true, ...accepted } : notAnswered(db, userId, invitationId)
}

/** The recipient declines. Nothing else changes; the invitation stays as history. */
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
  const [mine] = await db<{ status: InvitationStatus }[]>`
    SELECT ${db.unsafe(STATUS)} AS status
    FROM orbit.invitations i JOIN orbit.users u ON i.email = lower(u.email)
    WHERE i.id = ${invitationId} AND u.id = ${userId}
  `
  return mine ? { ok: false, reason: 'not_pending', status: mine.status } : { ok: false, reason: 'not_found' }
}

async function statusOf(db: Db, invitationId: string): Promise<InvitationStatus> {
  const [row] = await db<{ status: InvitationStatus }[]>`SELECT ${db.unsafe(STATUS)} AS status FROM orbit.invitations i WHERE i.id = ${invitationId}`
  return row!.status
}
