import { describe, expect, it } from 'vitest'
import type { DatabaseSync } from 'node:sqlite'
import { upsertAccount } from '../server/utils/accounts'
import { openDb } from '../server/utils/db'
import { createWorkspace, getWorkspace, listWorkspaces, parseWorkspaceName } from '../server/utils/workspaces'

let n = 0
const createUser = (db: DatabaseSync) => upsertAccount(db, `auth-${++n}`, `user${n}@example.com`).id

describe('parseWorkspaceName', () => {
  it('trims and collapses whitespace', () => {
    expect(parseWorkspaceName('  Northwind   Studio ')).toEqual({ name: 'Northwind Studio' })
  })

  it('rejects empty, blank and non-string names', () => {
    for (const input of ['', '   ', undefined, null, 42]) {
      expect(parseWorkspaceName(input)).toHaveProperty('error')
    }
  })

  it('rejects names over 64 characters', () => {
    expect(parseWorkspaceName('a'.repeat(64))).toEqual({ name: 'a'.repeat(64) })
    expect(parseWorkspaceName('a'.repeat(65))).toHaveProperty('error')
  })
})

describe('workspaces', () => {
  it('makes the creator the administrator of the new workspace', () => {
    const db = openDb(':memory:')
    const user = createUser(db)
    const created = createWorkspace(db, user, 'Northwind')

    expect(created.role).toBe('admin')
    expect(getWorkspace(db, user, created.id)).toEqual(created)
    expect(listWorkspaces(db, user)).toEqual([created])
  })

  it('scopes access to members only', () => {
    const db = openDb(':memory:')
    const owner = createUser(db)
    const stranger = createUser(db)
    const ws = createWorkspace(db, owner, 'Northwind')

    expect(getWorkspace(db, stranger, ws.id)).toBeNull()
    expect(listWorkspaces(db, stranger)).toEqual([])
  })

  it('supports several workspaces per user, newest first', () => {
    const db = openDb(':memory:')
    const user = createUser(db)
    const first = createWorkspace(db, user, 'First')
    const second = createWorkspace(db, user, 'Second')

    expect(listWorkspaces(db, user).map((w) => w.id)).toEqual([second.id, first.id])
  })

  it('creates nothing when the creator does not exist', () => {
    const db = openDb(':memory:')
    expect(() => createWorkspace(db, 'ghost', 'Nope')).toThrow()
    expect(db.prepare('SELECT COUNT(*) AS n FROM workspaces').get()).toEqual({ n: 0 })
  })
})
