// Ownership invariants, held by the database itself (migrations 004 and 005), exercised as
// orbit_app exactly as the deployed server would be; the owner's authority; and the migrations
// themselves, on databases from before ownership and from between 004 and 005. Changes of
// ownership here are bare owner_id updates made as superuser, to test what the database holds on
// its own; the transfer itself (migration 008, server/utils/ownership.ts) is tested in
// test/ownership-transfer.test.ts.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { upsertAccount } from '../server/utils/accounts'
import { createWorkspace, getWorkspace, listMembers, updateWorkspace } from '../server/utils/workspaces'
import { startTestDatabase } from './db'

let testDb: Awaited<ReturnType<typeof startTestDatabase>>
beforeAll(async () => { testDb = await startTestDatabase({ asApp: true }) })
afterAll(() => testDb.close())

let n = 0
const createUser = async () => (await upsertAccount(testDb.sql, `owner-test-${++n}`, `owner${n}@example.com`)).id
const join = (userId: string, workspaceId: string, role: 'admin' | 'member') =>
  testDb.sql`INSERT INTO orbit.memberships (user_id, workspace_id, role) VALUES (${userId}, ${workspaceId}, ${role})`
const ownerOf = async (workspaceId: string) =>
  (await testDb.sql<{ ownerId: string; createdBy: string }[]>`
    SELECT owner_id AS "ownerId", created_by AS "createdBy" FROM orbit.workspaces WHERE id = ${workspaceId}`)[0]!
/** Postgres error code of a statement expected to fail (23502 not null, 23503 foreign key). */
const codeOf = (statement: Promise<unknown>) => statement.then(() => 'succeeded', (e) => e.code as string)
/** Outside orbit_app, for bare changes of ownership that bypass the transfer's own rules. */
async function asSuperuser<T>(fn: () => Promise<T>): Promise<T> {
  await testDb.sql.unsafe('RESET ROLE')
  try { return await fn() } finally { await testDb.sql.unsafe('SET ROLE orbit_app') }
}

describe('creating a workspace', () => {
  it('makes its creator the one owner, a member and a steward, in one step', async () => {
    const creator = await createUser()
    const ws = await createWorkspace(testDb.sql, creator, 'Harbour')

    expect(await ownerOf(ws.id)).toEqual({ ownerId: creator, createdBy: creator })
    expect([...await testDb.sql`SELECT user_id, role FROM orbit.memberships WHERE workspace_id = ${ws.id}`])
      .toEqual([{ user_id: creator, role: 'admin' }])
  })

  it('leaves nothing behind when it can’t complete', async () => {
    const ghost = '00000000-0000-0000-0000-000000000000'
    await expect(createWorkspace(testDb.sql, ghost, 'Nowhere')).rejects.toThrow()
    expect(await testDb.sql`SELECT 1 FROM orbit.workspaces WHERE name = 'Nowhere'`).toHaveLength(0)
  })

  it('keeps each of many simultaneous creations whole, each with its own owner', async () => {
    const people = await Promise.all(Array.from({ length: 8 }, createUser))
    const created = await Promise.all(people.map((p, i) => createWorkspace(testDb.sql, p, `Rush ${i}`)))
    for (const [i, ws] of created.entries()) {
      expect((await ownerOf(ws.id)).ownerId).toBe(people[i])
      expect(await listMembers(testDb.sql, ws.id, people[i]!)).toEqual([{ id: expect.any(String), name: null, you: true, role: 'admin', owner: true, actions: [], transferable: false }])
    }
  })
})

describe('the owner', () => {
  it('is always a member: someone outside the workspace can’t be made owner', async () => {
    const creator = await createUser()
    const outsider = await createUser()
    const elsewhere = await createWorkspace(testDb.sql, outsider, 'Elsewhere') // a member somewhere, just not here
    const ws = await createWorkspace(testDb.sql, creator, 'Pier')

    expect(await codeOf(asSuperuser(() => testDb.sql`UPDATE orbit.workspaces SET owner_id = ${outsider} WHERE id = ${ws.id}`))).toBe('23503')
    expect((await ownerOf(ws.id)).ownerId).toBe(creator)
    expect((await ownerOf(elsewhere.id)).ownerId).toBe(outsider)
  })

  it('can’t lose their membership while they own the workspace; others can', async () => {
    const creator = await createUser()
    const steward = await createUser()
    const member = await createUser()
    const ws = await createWorkspace(testDb.sql, creator, 'Dock')
    await join(steward, ws.id, 'admin')
    await join(member, ws.id, 'member')

    const remove = (userId: string) =>
      testDb.sql`DELETE FROM orbit.memberships WHERE user_id = ${userId} AND workspace_id = ${ws.id}`
    expect(await codeOf(remove(creator))).toBe('23503')
    expect(await codeOf(testDb.sql`DELETE FROM orbit.memberships WHERE workspace_id = ${ws.id}`)).toBe('23503') // not even all at once
    expect(await codeOf(remove(member))).toBe('succeeded')
    expect(await codeOf(remove(steward))).toBe('succeeded')
    expect(await listMembers(testDb.sql, ws.id, creator)).toEqual([{ id: expect.any(String), name: null, you: true, role: 'admin', owner: true, actions: [], transferable: false }])
  })

  it('is read from owner_id, not inferred from the creator, and can change hands in one step', async () => {
    // No transfer feature exists yet; this proves the constraints allow one to be atomic.
    const creator = await createUser()
    const successor = await createUser()
    const ws = await createWorkspace(testDb.sql, creator, 'Relay')
    await join(successor, ws.id, 'member')

    await asSuperuser(() => testDb.sql`UPDATE orbit.workspaces SET owner_id = ${successor} WHERE id = ${ws.id}`)
    expect(await ownerOf(ws.id)).toEqual({ ownerId: successor, createdBy: creator }) // history unchanged
    expect(await listMembers(testDb.sql, ws.id, creator)).toEqual([
      { id: expect.any(String), name: null, you: true, role: 'admin', owner: false, actions: [], transferable: false },
      { id: expect.any(String), name: null, you: false, role: 'member', owner: true, actions: [], transferable: false },
    ])
    // The former owner is now an ordinary membership, and the new owner's is protected.
    expect(await codeOf(testDb.sql`DELETE FROM orbit.memberships WHERE user_id = ${successor} AND workspace_id = ${ws.id}`)).toBe('23503')
  })

  it('doesn’t trap a workspace: deleting the whole workspace still takes its memberships with it', async () => {
    // Not a feature; this guards against the two-way reference making deletion impossible.
    const creator = await createUser()
    const ws = await createWorkspace(testDb.sql, creator, 'Ephemeral')
    await join(await createUser(), ws.id, 'member')
    expect(await codeOf(testDb.sql`DELETE FROM orbit.workspaces WHERE id = ${ws.id}`)).toBe('succeeded')
    expect(await testDb.sql`SELECT 1 FROM orbit.memberships WHERE workspace_id = ${ws.id}`).toHaveLength(0)
  })
})

describe('the owner’s authority', () => {
  it('comes from ownership itself: an owner whose membership role is member can still manage', async () => {
    const owner = await createUser()
    const member = await createUser()
    const ws = await createWorkspace(testDb.sql, owner, 'Keep')
    await join(member, ws.id, 'member')
    await testDb.sql`UPDATE orbit.memberships SET role = 'member' WHERE user_id = ${owner} AND workspace_id = ${ws.id}`

    expect(await getWorkspace(testDb.sql, owner, ws.id)).toMatchObject({ role: 'member', canManage: true })
    expect(await updateWorkspace(testDb.sql, owner, ws.id, { name: 'Still mine' }))
      .toMatchObject({ ok: true, workspace: { name: 'Still mine', role: 'member', canManage: true } })
    // An ordinary member gains nothing from this.
    expect(await getWorkspace(testDb.sql, member, ws.id)).toMatchObject({ role: 'member', canManage: false })
    expect(await updateWorkspace(testDb.sql, member, ws.id, { name: 'Taken' })).toEqual({ ok: false, reason: 'forbidden' })
  })

  it('moves with ownership: a former owner without the steward role can no longer manage', async () => {
    const creator = await createUser()
    const successor = await createUser()
    const ws = await createWorkspace(testDb.sql, creator, 'Handover')
    await join(successor, ws.id, 'member')
    await asSuperuser(() => testDb.sql.begin(async (tx) => {
      await tx`UPDATE orbit.workspaces SET owner_id = ${successor} WHERE id = ${ws.id}`
      await tx`UPDATE orbit.memberships SET role = 'member' WHERE user_id = ${creator} AND workspace_id = ${ws.id}`
    }))
    expect(await updateWorkspace(testDb.sql, successor, ws.id, { name: 'Passed on' })).toMatchObject({ ok: true })
    expect(await updateWorkspace(testDb.sql, creator, ws.id, { name: 'Taken back' })).toEqual({ ok: false, reason: 'forbidden' })
  })

  it('is checked inside the write itself, not only before it', async () => {
    // updateWorkspace checks first, then writes with the same rule in the UPDATE. Revoke the
    // authority between the two (as a concurrent change could) and the write must not land.
    const owner = await createUser()
    const successor = await createUser()
    const ws = await createWorkspace(testDb.sql, owner, 'Race')
    await join(successor, ws.id, 'member')
    let revoked = false
    const revoke = () => asSuperuser(() => testDb.sql.begin(async (tx) => {
      await tx`UPDATE orbit.workspaces SET owner_id = ${successor} WHERE id = ${ws.id}`
      await tx`UPDATE orbit.memberships SET role = 'member' WHERE user_id = ${owner} AND workspace_id = ${ws.id}`
    }))
    // Passes every call straight through, except that the UPDATE waits for the revocation.
    const racing = new Proxy(testDb.sql, {
      apply: (target, self, args) => {
        const text = Array.isArray(args[0]) && 'raw' in args[0] ? (args[0] as TemplateStringsArray).join('') : ''
        if (revoked || !text.includes('UPDATE orbit.workspaces')) return Reflect.apply(target, self, args)
        revoked = true
        return revoke().then(() => Reflect.apply(target, self, args))
      },
    })
    expect(await updateWorkspace(racing, owner, ws.id, { name: 'Too late' })).toEqual({ ok: false, reason: 'forbidden' })
    expect(revoked).toBe(true)
    expect((await getWorkspace(testDb.sql, successor, ws.id))?.name).toBe('Race')
  })
})

describe('the ownership contract (migration 005)', () => {
  /** Exactly what Orbit did before ownership existed: no owner_id. */
  const createAsBefore = (userId: string, name: string) =>
    testDb.sql.begin(async (tx) => {
      const [w] = await tx<{ id: string }[]>`INSERT INTO orbit.workspaces (name, created_by) VALUES (${name}, ${userId}) RETURNING id`
      await tx`INSERT INTO orbit.memberships (user_id, workspace_id, role) VALUES (${userId}, ${w!.id}, 'admin')`
    })

  it('refuses a workspace without an owner, leaving nothing behind', async () => {
    const creator = await createUser()
    expect(await codeOf(createAsBefore(creator, 'Ownerless'))).toBe('23502')
    expect(await testDb.sql`SELECT 1 FROM orbit.workspaces WHERE name = 'Ownerless'`).toHaveLength(0)
  })

  it('never lets ownership be emptied', async () => {
    const ws = await createWorkspace(testDb.sql, await createUser(), 'Lighthouse')
    expect(await codeOf(asSuperuser(() => testDb.sql`UPDATE orbit.workspaces SET owner_id = NULL WHERE id = ${ws.id}`))).toBe('23502')
    expect(await listMembers(testDb.sql, ws.id, (await ownerOf(ws.id)).ownerId))
      .toEqual([{ id: expect.any(String), name: null, you: true, role: 'admin', owner: true, actions: [], transferable: false }])
  })
})

describe('migration 005 on a database from between 004 and 005', () => {
  const BETWEEN = '004_workspace_owner.sql'
  const nullable = (sql: Awaited<ReturnType<typeof startTestDatabase>>['sql']) =>
    sql<{ nullable: string }[]>`SELECT is_nullable AS nullable FROM information_schema.columns WHERE table_schema = 'orbit' AND table_name = 'workspaces' AND column_name = 'owner_id'`.then((r) => r[0]!.nullable)

  it('gives each ownerless workspace its creator as owner, leaves set ownership alone, and makes ownership required', async () => {
    const ids: Record<string, string> = {}
    const db = await startTestDatabase({
      upTo: BETWEEN,
      prepare: async (sql) => {
        for (const key of ['ada', 'grace', 'lin']) {
          ids[key] = (await sql<{ id: string }[]>`INSERT INTO orbit.users (auth_subject, email) VALUES (${key}, ${`${key}@example.com`}) RETURNING id`)[0]!.id
        }
        // Made by code from before ownership, during the rollout: no owner yet.
        await sql.begin(async (tx) => {
          ids.early = (await tx<{ id: string }[]>`INSERT INTO orbit.workspaces (name, created_by) VALUES ('Early', ${ids.ada!}) RETURNING id`)[0]!.id
          await tx`INSERT INTO orbit.memberships (user_id, workspace_id, role) VALUES (${ids.ada!}, ${ids.early!}, 'admin')`
        })
        await sql`INSERT INTO orbit.memberships (user_id, workspace_id, role) VALUES (${ids.lin!}, ${ids.early!}, 'admin')`
        // Made with an owner, which has since changed hands: must not be reset to the creator.
        ids.handed = (await createWorkspace(sql, ids.grace!, 'Handed on')).id
        await sql`INSERT INTO orbit.memberships (user_id, workspace_id, role) VALUES (${ids.lin!}, ${ids.handed!}, 'member')`
        await sql`UPDATE orbit.workspaces SET owner_id = ${ids.lin!} WHERE id = ${ids.handed!}`
      },
    })
    try {
      const memberships = () => db.sql`SELECT user_id, workspace_id, role FROM orbit.memberships ORDER BY user_id, workspace_id`
      const before = [...await memberships()]
      expect(await nullable(db.sql)).toBe('YES')

      const { migrate } = await import('../server/db/migrate')
      expect(await migrate(db.sql)).toEqual(['005_workspace_owner_required.sql', '006_invitations.sql', '007_invitation_roles_and_membership_authority.sql', '008_ownership_transfer.sql'])

      expect([...await db.sql`SELECT name, owner_id, created_by FROM orbit.workspaces ORDER BY name`]).toEqual([
        { name: 'Early', owner_id: ids.ada, created_by: ids.ada }, // Lin is a steward there, not the owner
        { name: 'Handed on', owner_id: ids.lin, created_by: ids.grace }, // untouched
      ])
      expect([...await memberships()]).toEqual(before)
      expect(await nullable(db.sql)).toBe('NO')
      // 004's owner-membership key is still there, unchanged.
      expect([...await db.sql`SELECT condeferrable AS deferrable, condeferred AS deferred, convalidated AS validated, pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = 'workspaces_owner_is_member'`])
        .toEqual([{ deferrable: true, deferred: true, validated: true, def: 'FOREIGN KEY (owner_id, id) REFERENCES orbit.memberships(user_id, workspace_id) DEFERRABLE INITIALLY DEFERRED' }])
      // Today's code still creates workspaces; code that doesn't name an owner can't.
      expect(await createWorkspace(db.sql, ids.grace!, 'After')).toMatchObject({ role: 'admin', canManage: true })
      expect(await codeOf(db.sql`INSERT INTO orbit.workspaces (name, created_by) VALUES ('Stale', ${ids.grace!})`)).toBe('23502')

      // Repeating the migration's statements changes nothing.
      const { readFileSync } = await import('node:fs')
      const owners = [...await db.sql`SELECT id, owner_id FROM orbit.workspaces ORDER BY id`]
      await db.sql.begin((tx) => tx.unsafe(readFileSync(new URL('../server/db/migrations/005_workspace_owner_required.sql', import.meta.url), 'utf8')))
      expect([...await db.sql`SELECT id, owner_id FROM orbit.workspaces ORDER BY id`]).toEqual(owners)
    } finally {
      await db.close()
    }
  }, 30_000) // starts a database of its own

  it('stops, naming the workspace and changing nothing, rather than invent an owner', async () => {
    let orphan = ''
    const db = await startTestDatabase({
      upTo: BETWEEN,
      prepare: async (sql) => {
        const user = async (key: string) => (await sql<{ id: string }[]>`INSERT INTO orbit.users (auth_subject, email) VALUES (${key}, ${`${key}@example.com`}) RETURNING id`)[0]!.id
        const [creator, member] = [await user('left'), await user('stayed')]
        // No owner, and its creator isn't a member; someone else is. That person must not be guessed.
        orphan = (await sql<{ id: string }[]>`INSERT INTO orbit.workspaces (name, created_by) VALUES ('Orphan', ${creator}) RETURNING id`)[0]!.id
        await sql`INSERT INTO orbit.memberships (user_id, workspace_id, role) VALUES (${member}, ${orphan}, 'admin')`
        await sql.begin(async (tx) => { // and one that can be backfilled, to show it is rolled back too
          const [w] = await tx<{ id: string }[]>`INSERT INTO orbit.workspaces (name, created_by) VALUES ('Fine', ${member}) RETURNING id`
          await tx`INSERT INTO orbit.memberships (user_id, workspace_id, role) VALUES (${member}, ${w!.id}, 'admin')`
        })
      },
    })
    try {
      const { migrate } = await import('../server/db/migrate')
      const error = await migrate(db.sql).then(() => null, (e) => e as Error)
      expect(error?.message).toMatch(/^Migration 005: these workspaces have no owner, and their creator is not a member/)
      expect(error?.message).toContain(orphan)
      expect([...await db.sql`SELECT name, owner_id FROM orbit.workspaces ORDER BY name`])
        .toEqual([{ name: 'Fine', owner_id: null }, { name: 'Orphan', owner_id: null }])
      expect(await nullable(db.sql)).toBe('YES')
      expect(await db.sql`SELECT 1 FROM orbit.schema_migrations WHERE name = '005_workspace_owner_required.sql'`).toHaveLength(0)
    } finally {
      await db.close()
    }
  }, 30_000)
})

describe('migration 004 on a database from before ownership', () => {
  const BEFORE = '003_workspace_description.sql'

  it('makes each existing workspace’s creator its owner, touching nothing else', async () => {
    const ids: Record<string, string> = {}
    const old = await startTestDatabase({
      upTo: BEFORE,
      prepare: async (sql) => {
        const user = async (key: string) => {
          ids[key] = (await sql<{ id: string }[]>`INSERT INTO orbit.users (auth_subject, email) VALUES (${key}, ${`${key}@example.com`}) RETURNING id`)[0]!.id
        }
        for (const key of ['ada', 'grace', 'lin']) await user(key)
        // As created before 004: workspace row plus the creator's admin membership.
        for (const [ws, creator] of [['sweden', 'ada'], ['garden', 'grace']] as const) {
          ids[ws] = (await sql<{ id: string }[]>`INSERT INTO orbit.workspaces (name, created_by) VALUES (${ws}, ${ids[creator]!}) RETURNING id`)[0]!.id
          await sql`INSERT INTO orbit.memberships (user_id, workspace_id, role) VALUES (${ids[creator]!}, ${ids[ws]!}, 'admin')`
        }
        await sql`INSERT INTO orbit.memberships (user_id, workspace_id, role) VALUES (${ids.lin!}, ${ids.sweden!}, 'admin')`
        await sql`INSERT INTO orbit.memberships (user_id, workspace_id, role) VALUES (${ids.ada!}, ${ids.garden!}, 'member')`
      },
    })
    try {
      const memberships = () => old.sql`SELECT user_id, workspace_id, role FROM orbit.memberships ORDER BY user_id, workspace_id`
      const before = [...await memberships()]

      const { migrate } = await import('../server/db/migrate')
      // A database from before ownership goes straight to the final contract.
      expect(await migrate(old.sql)).toEqual(['004_workspace_owner.sql', '005_workspace_owner_required.sql', '006_invitations.sql', '007_invitation_roles_and_membership_authority.sql', '008_ownership_transfer.sql'])

      expect([...await old.sql`SELECT name, owner_id, created_by FROM orbit.workspaces ORDER BY name`]).toEqual([
        { name: 'garden', owner_id: ids.grace, created_by: ids.grace },
        { name: 'sweden', owner_id: ids.ada, created_by: ids.ada }, // Lin is a steward, not the owner
      ])
      expect([...await memberships()]).toEqual(before)
    } finally {
      await old.close()
    }
  }, 30_000) // starts a database of its own

  it('refuses, changing nothing, if a creator isn’t a member of their workspace', async () => {
    const old = await startTestDatabase({
      upTo: BEFORE,
      prepare: async (sql) => {
        const [u] = await sql<{ id: string }[]>`INSERT INTO orbit.users (auth_subject, email) VALUES ('gone', 'gone@example.com') RETURNING id`
        await sql`INSERT INTO orbit.workspaces (name, created_by) VALUES ('Orphan', ${u!.id})`
      },
    })
    try {
      const { migrate } = await import('../server/db/migrate')
      await expect(migrate(old.sql)).rejects.toMatchObject({ code: '23503' })
      expect(await old.sql`SELECT 1 FROM information_schema.columns WHERE table_schema = 'orbit' AND table_name = 'workspaces' AND column_name = 'owner_id'`).toHaveLength(0)
      expect(await old.sql`SELECT 1 FROM orbit.schema_migrations WHERE name LIKE '00%_workspace_owner%'`).toHaveLength(0)
    } finally {
      await old.close()
    }
  }, 30_000)
})
