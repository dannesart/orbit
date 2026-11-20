import { type MembershipAction, SQL_STEWARDSHIP_OFFERED, type Standing, allowedActions, mayTransferOwnership, offerableRoles } from './authority'
import type { Db, Queryable } from './db'

export type Role = 'admin' | 'member'

export interface WorkspaceView {
  id: string
  name: string
  /** "What's this place for?": an optional thought, null when nobody has given one. */
  description: string | null
  role: Role
  /**
   * May look after the workspace (settings, purpose): its owner, or a steward (admin).
   * Ownership carries this authority on its own, whatever the owner's membership role.
   */
  canManage: boolean
  createdAt: string
}

export type WorkspaceDetail = WorkspaceView & {
  members: Member[]
  /** The roles the asking person may offer by invitation (offerableRoles): none for a member. */
  invitationRoles: Role[]
}

export const WORKSPACE_NAME_MAX = 64
export const DESCRIPTION_MAX = 280

/** Trims and collapses whitespace. Returns an error message when the name is unusable. */
export function parseWorkspaceName(input: unknown): { name: string } | { error: string } {
  const name = typeof input === 'string' ? input.trim().replace(/\s+/g, ' ') : ''
  if (!name) return { error: 'Give your workspace a name.' }
  if (name.length > WORKSPACE_NAME_MAX) return { error: `Keep it under ${WORKSPACE_NAME_MAX} characters.` }
  return { name }
}

/**
 * A purpose is one short thought on one line. Trimmed, whitespace collapsed. `null` or an
 * empty string deliberately clears it; anything that isn't text is rejected.
 */
export function parseDescription(input: unknown): { description: string | null } | { error: string } {
  if (input === null) return { description: null }
  if (typeof input !== 'string') return { error: 'That doesn’t look like text.' }
  const description = input.normalize('NFC').trim().replace(/\s+/g, ' ')
  if (!description) return { description: null }
  if ([...description].length > DESCRIPTION_MAX) return { error: `Keep it under ${DESCRIPTION_MAX} characters.` }
  if (/\p{Cc}/u.test(description)) return { error: 'That has characters we can’t use.' }
  return { description }
}

type Row = Omit<WorkspaceView, 'createdAt'> & { createdAt: Date }
const toView = ({ createdAt, ...rest }: Row): WorkspaceView => ({ ...rest, createdAt: createdAt.toISOString() })

/**
 * Creates a workspace with its creator as owner and steward (admin), atomically. The
 * database checks at commit that the owner is a member, so both rows land or neither does.
 */
export async function createWorkspace(db: Db, userId: string, name: string): Promise<WorkspaceView> {
  return db.begin(async (tx) => {
    const [workspace] = await tx<{ id: string; createdAt: Date }[]>`
      INSERT INTO orbit.workspaces (name, created_by, owner_id) VALUES (${name}, ${userId}, ${userId})
      RETURNING id, created_at AS "createdAt"
    `
    await tx`
      INSERT INTO orbit.memberships (user_id, workspace_id, role, created_at)
      VALUES (${userId}, ${workspace!.id}, 'admin', ${workspace!.createdAt})
    `
    return toView({ id: workspace!.id, name, description: null, role: 'admin', canManage: true, createdAt: workspace!.createdAt })
  })
}

// Who may manage a workspace, as SQL over a membership `m` joined to its workspace `w`: a
// steward, or the owner. Ownership is read only from owner_id, never from created_by.
// Shared by every rule about looking after a workspace (settings, purpose, invitations).
export const CAN_MANAGE = `(m.role = 'admin' OR w.owner_id = m.user_id)`

/** Workspaces the user belongs to, most recently created first. */
export async function listWorkspaces(db: Db, userId: string): Promise<WorkspaceView[]> {
  const rows = await db<Row[]>`
    SELECT w.id, w.name, w.description, m.role, ${db.unsafe(CAN_MANAGE)} AS "canManage", w.created_at AS "createdAt"
    FROM orbit.memberships m JOIN orbit.workspaces w ON w.id = m.workspace_id
    WHERE m.user_id = ${userId}
    ORDER BY w.created_at DESC
  `
  return rows.map(toView)
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** Whether a string could be an id Orbit issued (workspaces, invitations, memberships), checked before querying. */
export const isOrbitId = (id: string) => UUID.test(id)

/**
 * The acting person's standing in a workspace, locked (FOR SHARE) until the end of the calling
 * transaction: their membership row, then the workspace row, in that order (PostgreSQL locks the
 * rows of this join in that order; an ownership transfer locks the same rows the same way, see
 * server/utils/ownership.ts). Anything that changes their role, or
 * who owns the workspace, waits until the action that relied on it has committed, and an action
 * that starts after such a change sees it. Null if they aren't a member (outsiders learn nothing).
 */
export async function lockStanding(tx: Queryable, userId: string, workspaceId: string): Promise<Standing | null> {
  if (!isOrbitId(workspaceId)) return null
  const [row] = await tx<{ role: Role; owner: boolean }[]>`
    SELECT m.role, (w.owner_id = m.user_id) AS owner
    FROM orbit.memberships m JOIN orbit.workspaces w ON w.id = m.workspace_id
    WHERE m.user_id = ${userId} AND w.id = ${workspaceId}
    FOR SHARE
  `
  return row ? { userId, ...row } : null
}

/**
 * A membership's standing, found by its own id within one workspace only (not locked), including
 * whether the owner has a standing offer of stewardship to them.
 */
export async function standingOf(db: Queryable, workspaceId: string, membershipId: string): Promise<Standing | null> {
  if (!isOrbitId(membershipId) || !isOrbitId(workspaceId)) return null
  const [row] = await db<Standing[]>`
    SELECT t.user_id AS "userId", t.role, (w.owner_id = t.user_id) AS owner,
      ${db.unsafe(SQL_STEWARDSHIP_OFFERED)} AS "stewardshipOffered"
    FROM orbit.memberships t JOIN orbit.workspaces w ON w.id = t.workspace_id
    WHERE t.id = ${membershipId} AND t.workspace_id = ${workspaceId}
  `
  return row ?? null
}

/** Returns the workspace only if the user is a member of it. */
export async function getWorkspace(db: Db, userId: string, workspaceId: string): Promise<WorkspaceView | null> {
  if (!isOrbitId(workspaceId)) return null // not an id we could have issued
  const [row] = await db<Row[]>`
    SELECT w.id, w.name, w.description, m.role, ${db.unsafe(CAN_MANAGE)} AS "canManage", w.created_at AS "createdAt"
    FROM orbit.memberships m JOIN orbit.workspaces w ON w.id = m.workspace_id
    WHERE m.user_id = ${userId} AND w.id = ${workspaceId}
  `
  return row ? toView(row) : null
}

export interface WorkspaceChanges {
  name?: string
  description?: string | null
}

export type UpdateResult =
  | { ok: true; workspace: WorkspaceView }
  | { ok: false; reason: 'not_found' | 'forbidden' }

/**
 * The one way to change a workspace, for every editing surface. Only the fields present in
 * `changes` are touched. Only its owner or a steward may change it: the same rule is checked
 * again inside the UPDATE itself, so authorization and the write can't drift apart.
 */
export async function updateWorkspace(
  db: Db, userId: string, workspaceId: string, changes: WorkspaceChanges,
): Promise<UpdateResult> {
  const current = await getWorkspace(db, userId, workspaceId)
  if (!current) return { ok: false, reason: 'not_found' } // non-members learn nothing
  if (!current.canManage) return { ok: false, reason: 'forbidden' }

  const fields = (['name', 'description'] as const).filter((key) => key in changes)
  if (fields.length === 0) return { ok: true, workspace: current }

  const [row] = await db<Row[]>`
    UPDATE orbit.workspaces w SET ${db(changes, ...fields)}
    FROM orbit.memberships m
    WHERE w.id = ${workspaceId}
      AND m.workspace_id = w.id AND m.user_id = ${userId} AND ${db.unsafe(CAN_MANAGE)}
    RETURNING w.id, w.name, w.description, m.role, true AS "canManage", w.created_at AS "createdAt"
  `
  return row ? { ok: true, workspace: toView(row) } : { ok: false, reason: 'forbidden' }
}

export interface Member {
  /** This membership's own id (not the person's account id): what membership actions name. */
  id: string
  /** What they asked to be called; null if they haven't said yet. Emails are never exposed. */
  name: string | null
  you: boolean
  /** Their membership role: admin (Steward in the product) or member. */
  role: Role
  /** The workspace's current owner, read from workspaces.owner_id (never from the creator). */
  owner: boolean
  /**
   * What the asking person may do to this membership right now, from allowedActions. A snapshot
   * for showing choices, not a promise: every action is decided again, under lock, when taken.
   */
  actions: MembershipAction[]
  /**
   * Whether the asking person may hand ownership to this member right now (mayTransferOwnership):
   * true only in the owner's view, and never for themselves. Like `actions`, a snapshot for
   * showing the choice; the transfer decides again, under lock. Kept out of `actions` so that
   * browsers which already interpret `actions` never meet a value they don't know.
   */
  transferable: boolean
}

/**
 * Everyone in a workspace, the asking person first. Callers must have confirmed the asking
 * person's own membership first (getWorkspace), so non-members learn nothing.
 */
export async function listMembers(db: Db, workspaceId: string, userId: string): Promise<Member[]> {
  // Exactly one row is the owner: owner_id is NOT NULL and must name a member (migrations 004, 005).
  const rows = await db<{ id: string; userId: string; name: string | null; you: boolean; role: Role; owner: boolean; stewardshipOffered: boolean }[]>`
    SELECT t.id, t.user_id AS "userId", u.display_name AS name, (u.id = ${userId}) AS you, t.role,
      (t.user_id = w.owner_id) AS owner, ${db.unsafe(SQL_STEWARDSHIP_OFFERED)} AS "stewardshipOffered"
    FROM orbit.memberships t
      JOIN orbit.users u ON u.id = t.user_id
      JOIN orbit.workspaces w ON w.id = t.workspace_id
    WHERE t.workspace_id = ${workspaceId}
    ORDER BY (u.id = ${userId}) DESC, t.created_at
  `
  const me = rows.find((r) => r.you)
  const asking: Standing | null = me ? { userId: me.userId, role: me.role, owner: me.owner } : null
  // Each field chosen explicitly: account ids and stewardship offers stay inside.
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    you: r.you,
    role: r.role,
    owner: r.owner,
    actions: asking ? allowedActions(asking, { userId: r.userId, role: r.role, owner: r.owner, stewardshipOffered: r.stewardshipOffered }) : [],
    transferable: asking ? mayTransferOwnership(asking, { userId: r.userId, role: r.role, owner: r.owner }) : false,
  }))
}

/**
 * A workspace as one of its members sees it: the workspace, everyone in it (with what the asking
 * person may do to each), and which roles they may offer by invitation. Null for non-members,
 * who learn nothing.
 */
export async function getWorkspaceDetail(db: Db, userId: string, workspaceId: string): Promise<WorkspaceDetail | null> {
  const workspace = await getWorkspace(db, userId, workspaceId)
  if (!workspace) return null
  const members = await listMembers(db, workspace.id, userId)
  const me = members.find((m) => m.you)!
  return { ...workspace, members, invitationRoles: offerableRoles({ userId, role: me.role, owner: me.owner }) }
}
