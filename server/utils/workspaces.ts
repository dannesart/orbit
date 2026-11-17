import { DatabaseSync } from 'node:sqlite'
import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

export type Role = 'admin' | 'member'

export interface WorkspaceView {
  id: string
  name: string
  role: Role
  createdAt: string
}

export const WORKSPACE_NAME_MAX = 64

export function openDb(path: string): DatabaseSync {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
  const db = new DatabaseSync(path)
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_by TEXT NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS memberships (
      user_id TEXT NOT NULL REFERENCES users(id),
      workspace_id TEXT NOT NULL REFERENCES workspaces(id),
      role TEXT NOT NULL CHECK (role IN ('admin', 'member')),
      created_at TEXT NOT NULL,
      PRIMARY KEY (user_id, workspace_id)
    );
  `)
  return db
}

/** Trims and collapses whitespace. Returns an error message when the name is unusable. */
export function parseWorkspaceName(input: unknown): { name: string } | { error: string } {
  const name = typeof input === 'string' ? input.trim().replace(/\s+/g, ' ') : ''
  if (!name) return { error: 'Give your workspace a name.' }
  if (name.length > WORKSPACE_NAME_MAX) return { error: `Keep it under ${WORKSPACE_NAME_MAX} characters.` }
  return { name }
}

export function userExists(db: DatabaseSync, userId: string): boolean {
  return !!db.prepare('SELECT 1 FROM users WHERE id = ?').get(userId)
}

export function createUser(db: DatabaseSync): string {
  const id = randomUUID()
  db.prepare('INSERT INTO users (id, created_at) VALUES (?, ?)').run(id, new Date().toISOString())
  return id
}

/** Creates a workspace and makes its creator the administrator, atomically. */
export function createWorkspace(db: DatabaseSync, userId: string, name: string): WorkspaceView {
  const id = randomUUID()
  const createdAt = new Date().toISOString()
  db.exec('BEGIN')
  try {
    db.prepare('INSERT INTO workspaces (id, name, created_by, created_at) VALUES (?, ?, ?, ?)')
      .run(id, name, userId, createdAt)
    db.prepare('INSERT INTO memberships (user_id, workspace_id, role, created_at) VALUES (?, ?, ?, ?)')
      .run(userId, id, 'admin', createdAt)
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
  return { id, name, role: 'admin', createdAt }
}

const VIEW_SELECT = `
  SELECT w.id, w.name, m.role, w.created_at AS createdAt
  FROM memberships m JOIN workspaces w ON w.id = m.workspace_id
  WHERE m.user_id = ?`

/** Workspaces the user belongs to, most recently created first. */
export function listWorkspaces(db: DatabaseSync, userId: string): WorkspaceView[] {
  return db.prepare(`${VIEW_SELECT} ORDER BY w.created_at DESC, w.rowid DESC`).all(userId) as unknown as WorkspaceView[]
}

/** Returns the workspace only if the user is a member of it. */
export function getWorkspace(db: DatabaseSync, userId: string, workspaceId: string): WorkspaceView | null {
  return (db.prepare(`${VIEW_SELECT} AND w.id = ?`).get(userId, workspaceId) as unknown as WorkspaceView) ?? null
}
