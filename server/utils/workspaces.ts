import type { Standing } from './authority'
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

export type WorkspaceDetail = WorkspaceView & { members: Member[] }

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
 * transaction: their membership row and the workspace row. Anything that changes their role, or
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

/** A membership's standing, found by its own id within one workspace only (not locked). */
export async function standingOf(db: Queryable, workspaceId: string, membershipId: string): Promise<Standing | null> {
  if (!isOrbitId(membershipId) || !isOrbitId(workspaceId)) return null
  const [row] = await db<Standing[]>`
    SELECT t.user_id AS "userId", t.role, (w.owner_id = t.user_id) AS owner
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
  /** What they asked to be called; null if they haven't said yet. Emails are never exposed. */
  name: string | null
  you: boolean
  /** Their membership role: admin (Steward in the product) or member. */
  role: Role
  /** The workspace's current owner, read from workspaces.owner_id (never from the creator). */
  owner: boolean
}

/**
 * Everyone in a workspace, the asking person first. Callers must have confirmed the asking
 * person's own membership first (getWorkspace), so non-members learn nothing.
 */
export async function listMembers(db: Db, workspaceId: string, userId: string): Promise<Member[]> {
  // Exactly one row is the owner: owner_id is NOT NULL and must name a member (migrations 004, 005).
  return db<Member[]>`
    SELECT u.display_name AS name, (u.id = ${userId}) AS you, m.role, (m.user_id = w.owner_id) AS owner
    FROM orbit.memberships m
      JOIN orbit.users u ON u.id = m.user_id
      JOIN orbit.workspaces w ON w.id = m.workspace_id
    WHERE m.workspace_id = ${workspaceId}
    ORDER BY (u.id = ${userId}) DESC, m.created_at
  `
}
