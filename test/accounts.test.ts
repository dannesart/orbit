import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  SESSION_TTL_MS,
  createSession,
  deleteSession,
  parseEmail,
  resolveSession,
  upsertAccount,
} from '../server/utils/accounts'
import { openDb } from '../server/utils/db'

describe('upsertAccount', () => {
  it('links one Orbit user to one Supabase identity', () => {
    const db = openDb(':memory:')
    const first = upsertAccount(db, 'supabase-user-1', 'ada@example.com')
    const again = upsertAccount(db, 'supabase-user-1', 'ada@example.com')
    const other = upsertAccount(db, 'supabase-user-2', 'grace@example.com')

    expect(again.id).toBe(first.id)
    expect(other.id).not.toBe(first.id)
  })

  it('follows an email change on the identity without creating a new user', () => {
    const db = openDb(':memory:')
    const before = upsertAccount(db, 'supabase-user-1', 'ada@old.example')
    const after = upsertAccount(db, 'supabase-user-1', 'ada@new.example')
    expect(after).toEqual({ id: before.id, email: 'ada@new.example' })
  })
})

describe('sessions', () => {
  it('resolves to its account, in any number of browsers at once', () => {
    const db = openDb(':memory:')
    const ada = upsertAccount(db, 'supabase-user-1', 'ada@example.com')
    const laptop = createSession(db, ada.id)
    const phone = createSession(db, ada.id)

    expect(resolveSession(db, laptop)).toEqual(ada)
    expect(resolveSession(db, phone)).toEqual(ada)
  })

  it('stores only a hash of the token', () => {
    const db = openDb(':memory:')
    const token = createSession(db, upsertAccount(db, 's', 'a@example.com').id)
    const stored = db.prepare('SELECT token_hash FROM sessions').get() as { token_hash: string }
    expect(stored.token_hash).not.toContain(token)
  })

  it('rejects unknown, expired and signed-out sessions', () => {
    const db = openDb(':memory:')
    const ada = upsertAccount(db, 'supabase-user-1', 'ada@example.com')
    const token = createSession(db, ada.id)

    expect(resolveSession(db, 'not-a-token')).toBeNull()
    expect(resolveSession(db, token, Date.now() + SESSION_TTL_MS + 1)).toBeNull()

    deleteSession(db, token)
    expect(resolveSession(db, token)).toBeNull()
  })
})

describe('parseEmail', () => {
  it('normalizes and validates', () => {
    expect(parseEmail('  Ada@Example.COM ')).toBe('ada@example.com')
    for (const bad of ['', 'ada', 'ada@', '@example.com', 'a b@example.com', 42, null]) {
      expect(parseEmail(bad)).toBeNull()
    }
  })
})

describe('schema migration', () => {
  it('drops anonymous prototype data instead of handing it to an account', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'orbit-')), 'orbit.sqlite')
    const legacy = new DatabaseSync(path)
    legacy.exec(`
      CREATE TABLE users (id TEXT PRIMARY KEY, created_at TEXT NOT NULL);
      CREATE TABLE workspaces (id TEXT PRIMARY KEY, name TEXT, created_by TEXT, created_at TEXT);
      CREATE TABLE memberships (user_id TEXT, workspace_id TEXT, role TEXT, created_at TEXT);
      INSERT INTO users VALUES ('anon', 'x');
      INSERT INTO workspaces VALUES ('w1', 'Old', 'anon', 'x');
      INSERT INTO memberships VALUES ('anon', 'w1', 'admin', 'x');
    `)
    legacy.close()

    const db = openDb(path)
    expect(db.prepare('SELECT COUNT(*) AS n FROM workspaces').get()).toEqual({ n: 0 })
    expect(db.prepare('SELECT COUNT(*) AS n FROM users').get()).toEqual({ n: 0 })
    db.close()

    // Re-opening a current database keeps its data.
    const again = openDb(path)
    upsertAccount(again, 's', 'a@example.com')
    again.close()
    expect(openDb(path).prepare('SELECT COUNT(*) AS n FROM users').get()).toEqual({ n: 1 })
  })
})
