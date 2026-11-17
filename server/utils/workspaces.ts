import type { Db } from './db'

export type Role = 'admin' | 'member'

export interface WorkspaceView {
  id: string
  name: string
  role: Role
  createdAt: string
}

export const WORKSPACE_NAME_MAX = 64

/** Trims and collapses whitespace. Returns an error message when the name is unusable. */
export function parseWorkspaceName(input: unknown): { name: string } | { error: string } {
  const name = typeof input === 'string' ? input.trim().replace(/\s+/g, ' ') : ''
  if (!name) return { error: 'Give your workspace a name.' }
  if (name.length > WORKSPACE_NAME_MAX) return { error: `Keep it under ${WORKSPACE_NAME_MAX} characters.` }
  return { name }
}

type Row = Omit<WorkspaceView, 'createdAt'> & { createdAt: Date }
const toView = ({ createdAt, ...rest }: Row): WorkspaceView => ({ ...rest, createdAt: createdAt.toISOString() })

/** Creates a workspace and makes its creator the administrator, atomically. */
export async function createWorkspace(db: Db, userId: string, name: string): Promise<WorkspaceView> {
  return db.begin(async (tx) => {
    const [workspace] = await tx<{ id: string; createdAt: Date }[]>`
      INSERT INTO orbit.workspaces (name, created_by) VALUES (${name}, ${userId})
      RETURNING id, created_at AS "createdAt"
    `
    await tx`
      INSERT INTO orbit.memberships (user_id, workspace_id, role, created_at)
      VALUES (${userId}, ${workspace!.id}, 'admin', ${workspace!.createdAt})
    `
    return toView({ id: workspace!.id, name, role: 'admin', createdAt: workspace!.createdAt })
  })
}

/** Workspaces the user belongs to, most recently created first. */
export async function listWorkspaces(db: Db, userId: string): Promise<WorkspaceView[]> {
  const rows = await db<Row[]>`
    SELECT w.id, w.name, m.role, w.created_at AS "createdAt"
    FROM orbit.memberships m JOIN orbit.workspaces w ON w.id = m.workspace_id
    WHERE m.user_id = ${userId}
    ORDER BY w.created_at DESC
  `
  return rows.map(toView)
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Returns the workspace only if the user is a member of it. */
export async function getWorkspace(db: Db, userId: string, workspaceId: string): Promise<WorkspaceView | null> {
  if (!UUID.test(workspaceId)) return null // not an id we could have issued
  const [row] = await db<Row[]>`
    SELECT w.id, w.name, m.role, w.created_at AS "createdAt"
    FROM orbit.memberships m JOIN orbit.workspaces w ON w.id = m.workspace_id
    WHERE m.user_id = ${userId} AND w.id = ${workspaceId}
  `
  return row ? toView(row) : null
}

export interface Member {
  /** What they asked to be called; null if they haven't said yet. Emails are never exposed. */
  name: string | null
  you: boolean
}

/**
 * Everyone in a workspace, the asking person first. Callers must have confirmed the asking
 * person's own membership first (getWorkspace), so non-members learn nothing.
 */
export async function listMembers(db: Db, workspaceId: string, userId: string): Promise<Member[]> {
  return db<Member[]>`
    SELECT u.display_name AS name, (u.id = ${userId}) AS you
    FROM orbit.memberships m JOIN orbit.users u ON u.id = m.user_id
    WHERE m.workspace_id = ${workspaceId}
    ORDER BY (u.id = ${userId}) DESC, m.created_at
  `
}
