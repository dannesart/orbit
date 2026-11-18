import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { setName, upsertAccount } from '../server/utils/accounts'
import {
  createWorkspace,
  getWorkspace,
  listMembers,
  listWorkspaces,
  parseDescription,
  parseWorkspaceName,
  updateWorkspace,
} from '../server/utils/workspaces'
import { startTestDatabase } from './db'

let testDb: Awaited<ReturnType<typeof startTestDatabase>>
beforeAll(async () => { testDb = await startTestDatabase({ asApp: true }) })
afterAll(() => testDb.close())

let n = 0
const createUser = async () => (await upsertAccount(testDb.sql, `auth-${++n}`, `user${n}@example.com`)).id

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
  it('makes the creator the administrator of the new workspace', async () => {
    const user = await createUser()
    const created = await createWorkspace(testDb.sql, user, 'Northwind')

    expect(created.role).toBe('admin')
    expect(await getWorkspace(testDb.sql, user, created.id)).toEqual(created)
    expect(await listWorkspaces(testDb.sql, user)).toEqual([created])
  })

  it('scopes access to members only', async () => {
    const owner = await createUser()
    const stranger = await createUser()
    const ws = await createWorkspace(testDb.sql, owner, 'Northwind')

    expect(await getWorkspace(testDb.sql, stranger, ws.id)).toBeNull()
    expect(await listWorkspaces(testDb.sql, stranger)).toEqual([])
  })

  it('treats ids that are not UUIDs as not found', async () => {
    expect(await getWorkspace(testDb.sql, await createUser(), 'not-a-uuid')).toBeNull()
  })

  it('supports several workspaces per user, newest first', async () => {
    const user = await createUser()
    const first = await createWorkspace(testDb.sql, user, 'First')
    const second = await createWorkspace(testDb.sql, user, 'Second')

    expect((await listWorkspaces(testDb.sql, user)).map((w) => w.id)).toEqual([second.id, first.id])
  })

  it('creates nothing when the creator does not exist', async () => {
    const ghost = '00000000-0000-0000-0000-000000000000'
    await expect(createWorkspace(testDb.sql, ghost, 'Ghost Town')).rejects.toThrow()
    expect(await testDb.sql`SELECT 1 FROM orbit.workspaces WHERE name = 'Ghost Town'`).toHaveLength(0)
  })
})

describe('members', () => {
  it('lists everyone in the workspace, the asking person first, by name only', async () => {
    const owner = await createUser()
    const ws = await createWorkspace(testDb.sql, owner, 'Crew')
    expect(await listMembers(testDb.sql, ws.id, owner)).toEqual([{ name: null, you: true, role: 'admin', owner: true }])

    const colleague = await createUser()
    await setName(testDb.sql, colleague, 'Grace')
    await testDb.sql`INSERT INTO orbit.memberships (user_id, workspace_id, role) VALUES (${colleague}, ${ws.id}, 'member')`
    expect(await listMembers(testDb.sql, ws.id, owner)).toEqual([{ name: null, you: true, role: 'admin', owner: true }, { name: 'Grace', you: false, role: 'member', owner: false }])
    expect(await listMembers(testDb.sql, ws.id, colleague)).toEqual([{ name: 'Grace', you: true, role: 'member', owner: false }, { name: null, you: false, role: 'admin', owner: true }])
  })

  it('does not include people from other workspaces', async () => {
    const a = await createUser()
    const b = await createUser()
    const wsA = await createWorkspace(testDb.sql, a, 'A')
    await createWorkspace(testDb.sql, b, 'B')
    expect(await listMembers(testDb.sql, wsA.id, a)).toHaveLength(1)
  })
})

describe('parseDescription', () => {
  it('keeps one tidy line of thought', () => {
    expect(parseDescription('  Planning   the spring\nlaunch ')).toEqual({ description: 'Planning the spring launch' })
    expect(parseDescription('a'.repeat(280))).toEqual({ description: 'a'.repeat(280) })
  })

  it('treats null and empty text as a deliberate clear', () => {
    for (const input of [null, '', '   ']) expect(parseDescription(input)).toEqual({ description: null })
  })

  it('rejects non-text, overlong and control characters', () => {
    for (const input of [undefined, 42, {}, 'a'.repeat(281), 'nope\u0007']) {
      expect(parseDescription(input)).toHaveProperty('error')
    }
  })
})

describe('updateWorkspace', () => {
  const setup = async () => {
    const admin = await createUser()
    const ws = await createWorkspace(testDb.sql, admin, 'Before')
    return { admin, ws }
  }

  it('changes only the fields it is given', async () => {
    const { admin, ws } = await setup()
    const withPurpose = await updateWorkspace(testDb.sql, admin, ws.id, { description: 'Planning the spring launch' })
    expect(withPurpose).toMatchObject({ ok: true, workspace: { name: 'Before', description: 'Planning the spring launch', role: 'admin' } })

    const renamed = await updateWorkspace(testDb.sql, admin, ws.id, { name: 'After' })
    expect(renamed).toMatchObject({ ok: true, workspace: { name: 'After', description: 'Planning the spring launch' } })
    expect(await getWorkspace(testDb.sql, admin, ws.id)).toMatchObject({ name: 'After', description: 'Planning the spring launch' })
  })

  it('clears the purpose when asked to, and does nothing when given nothing', async () => {
    const { admin, ws } = await setup()
    await updateWorkspace(testDb.sql, admin, ws.id, { description: 'Temporary' })
    expect(await updateWorkspace(testDb.sql, admin, ws.id, { description: null }))
      .toMatchObject({ ok: true, workspace: { description: null } })
    expect(await updateWorkspace(testDb.sql, admin, ws.id, {}))
      .toMatchObject({ ok: true, workspace: { name: 'Before', description: null } })
  })

  it('lets members look but not change, and tells non-members nothing', async () => {
    const { ws } = await setup()
    const member = await createUser()
    await testDb.sql`INSERT INTO orbit.memberships (user_id, workspace_id, role) VALUES (${member}, ${ws.id}, 'member')`
    const outsider = await createUser()

    expect(await updateWorkspace(testDb.sql, member, ws.id, { name: 'Mine now' })).toEqual({ ok: false, reason: 'forbidden' })
    expect(await updateWorkspace(testDb.sql, outsider, ws.id, { name: 'Mine now' })).toEqual({ ok: false, reason: 'not_found' })
    expect(await updateWorkspace(testDb.sql, outsider, 'not-a-uuid', { name: 'x' })).toEqual({ ok: false, reason: 'not_found' })
    expect((await getWorkspace(testDb.sql, member, ws.id))?.name).toBe('Before')
  })

  it('is length-checked by the database too', async () => {
    const { admin, ws } = await setup()
    await expect(updateWorkspace(testDb.sql, admin, ws.id, { description: 'a'.repeat(281) })).rejects.toThrow(/check constraint/)
  })
})
