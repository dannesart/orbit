import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

const SCHEMA_VERSION = 1

export function openDb(path: string): DatabaseSync {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
  const db = new DatabaseSync(path)
  db.exec('PRAGMA foreign_keys = ON')

  const { user_version: version } = db.prepare('PRAGMA user_version').get() as { user_version: number }
  if (version < SCHEMA_VERSION) {
    db.exec('BEGIN')
    // Version 0 held anonymous prototype data (#1). It is disposable and must not be
    // claimed by a signed-in account, so it is dropped rather than migrated.
    db.exec(`
      DROP TABLE IF EXISTS memberships;
      DROP TABLE IF EXISTS workspaces;
      DROP TABLE IF EXISTS users;

      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        auth_subject TEXT NOT NULL UNIQUE, -- Supabase Auth user id
        email TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE sessions (
        token_hash TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL
      );
      CREATE TABLE workspaces (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_by TEXT NOT NULL REFERENCES users(id),
        created_at TEXT NOT NULL
      );
      CREATE TABLE memberships (
        user_id TEXT NOT NULL REFERENCES users(id),
        workspace_id TEXT NOT NULL REFERENCES workspaces(id),
        role TEXT NOT NULL CHECK (role IN ('admin', 'member')),
        created_at TEXT NOT NULL,
        PRIMARY KEY (user_id, workspace_id)
      );
      PRAGMA user_version = ${SCHEMA_VERSION};
    `)
    db.exec('COMMIT')
  }
  return db
}
