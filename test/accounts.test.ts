import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { migrate } from '../server/db/migrate'
import {
  SESSION_TTL_MS,
  createSession,
  deleteSession,
  parseEmail,
  resolveSession,
  upsertAccount,
} from '../server/utils/accounts'
import { startTestDatabase } from './db'

let testDb: Awaited<ReturnType<typeof startTestDatabase>>
beforeAll(async () => { testDb = await startTestDatabase() })
afterAll(() => testDb.close())

describe('upsertAccount', () => {
  it('links one Orbit user to one Supabase identity', async () => {
    const first = await upsertAccount(testDb.sql, 'supabase-user-1', 'ada@example.com')
    const again = await upsertAccount(testDb.sql, 'supabase-user-1', 'ada@example.com')
    const other = await upsertAccount(testDb.sql, 'supabase-user-2', 'grace@example.com')

    expect(again.id).toBe(first.id)
    expect(other.id).not.toBe(first.id)
  })

  it('follows an email change on the identity without creating a new user', async () => {
    const before = await upsertAccount(testDb.sql, 'supabase-user-3', 'ada@old.example')
    const after = await upsertAccount(testDb.sql, 'supabase-user-3', 'ada@new.example')
    expect(after).toEqual({ id: before.id, email: 'ada@new.example' })
  })
})

describe('sessions', () => {
  it('resolves to its account, in any number of browsers at once', async () => {
    const ada = await upsertAccount(testDb.sql, 'supabase-ada', 'ada@example.com')
    const laptop = await createSession(testDb.sql, ada.id)
    const phone = await createSession(testDb.sql, ada.id)

    expect(await resolveSession(testDb.sql, laptop)).toEqual(ada)
    expect(await resolveSession(testDb.sql, phone)).toEqual(ada)
  })

  it('stores only a hash of the token', async () => {
    const user = await upsertAccount(testDb.sql, 'supabase-hash', 'hash@example.com')
    const token = await createSession(testDb.sql, user.id)
    const rows = await testDb.sql<{ token_hash: string }[]>`SELECT token_hash FROM orbit.sessions WHERE user_id = ${user.id}`
    expect(rows).toHaveLength(1)
    expect(rows[0]!.token_hash).not.toContain(token)
  })

  it('rejects unknown, expired and signed-out sessions', async () => {
    const ada = await upsertAccount(testDb.sql, 'supabase-expiry', 'expiry@example.com')
    const token = await createSession(testDb.sql, ada.id)

    expect(await resolveSession(testDb.sql, 'not-a-token')).toBeNull()
    expect(await resolveSession(testDb.sql, token, Date.now() + SESSION_TTL_MS + 1)).toBeNull()

    await deleteSession(testDb.sql, token)
    expect(await resolveSession(testDb.sql, token)).toBeNull()
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

describe('migrations', () => {
  it('apply once; re-running changes nothing', async () => {
    expect(await migrate(testDb.sql)).toEqual([])
    const names = await testDb.sql`SELECT name FROM orbit.schema_migrations ORDER BY name`
    expect(names.map((r) => r.name)).toEqual(['001_orbit_schema.sql'])
  })

  it('give orbit_app row access to Orbit tables only', async () => {
    const asRole = (role: string, query: string) =>
      testDb.sql.begin(async (tx) => {
        await tx.unsafe(`SET LOCAL ROLE ${role}`)
        return tx.unsafe(query)
      })

    await expect(asRole('orbit_app', 'SELECT count(*) FROM orbit.users')).resolves.toBeDefined()
    await expect(asRole('orbit_app', 'SELECT * FROM orbit.schema_migrations')).rejects.toThrow(/permission denied/)
    await expect(asRole('orbit_app', 'CREATE TABLE orbit.sneaky (id int)')).rejects.toThrow(/permission denied/)
    await expect(asRole('orbit_app', 'DROP TABLE orbit.sessions')).rejects.toThrow(/must be owner|permission denied/)
  })

  it('give Supabase API roles no access at all', async () => {
    for (const role of ['anon', 'authenticated']) {
      const attempt = testDb.sql.begin(async (tx) => {
        await tx.unsafe(`SET LOCAL ROLE ${role}`)
        return tx.unsafe('SELECT * FROM orbit.users')
      })
      await expect(attempt).rejects.toThrow(/permission denied/)
    }
  })
})
