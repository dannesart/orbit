import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { migrate } from '../server/db/migrate'
import {
  SESSION_TTL_MS,
  createSession,
  deleteSession,
  parseEmail,
  parseName,
  resolveSession,
  setName,
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
    expect(after).toEqual({ id: before.id, email: 'ada@new.example', name: null })
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

describe('parseName', () => {
  it('accepts the names people actually use, tidied', () => {
    for (const name of ['Ada', 'Daniel Mårtensson', 'Zoë', '李小龙', 'O’Brien', 'Jean-Luc', 'Prince']) {
      expect(parseName(name)).toEqual({ name })
    }
    expect(parseName('  Grace   Hopper ')).toEqual({ name: 'Grace Hopper' })
    expect(parseName('Mårtensson')).toEqual({ name: 'Mårtensson' }) // decomposed å → composed
  })

  it('rejects empty, overlong and control-character names', () => {
    for (const input of ['', '   ', undefined, null, 42]) expect(parseName(input)).toHaveProperty('error')
    expect(parseName('a'.repeat(80))).toEqual({ name: 'a'.repeat(80) })
    expect(parseName('a'.repeat(81))).toHaveProperty('error')
    expect(parseName('Ada\u0000')).toHaveProperty('error')
  })
})

describe('names', () => {
  it('start empty, are saved on the person, and come back with their session', async () => {
    const person = await upsertAccount(testDb.sql, 'supabase-named', 'named@example.com')
    expect(person.name).toBeNull()

    const named = await setName(testDb.sql, person.id, 'Linnea')
    expect(named).toEqual({ id: person.id, email: 'named@example.com', name: 'Linnea' })
    const token = await createSession(testDb.sql, person.id)
    expect(await resolveSession(testDb.sql, token)).toEqual(named)
  })

  it('survive signing in again, even when the email changes', async () => {
    const person = await upsertAccount(testDb.sql, 'supabase-returning', 'old@example.com')
    await setName(testDb.sql, person.id, 'Signe')
    expect(await upsertAccount(testDb.sql, 'supabase-returning', 'new@example.com'))
      .toEqual({ id: person.id, email: 'new@example.com', name: 'Signe' })
  })

  it('are length-checked by the database too', async () => {
    const person = await upsertAccount(testDb.sql, 'supabase-long', 'long@example.com')
    await expect(setName(testDb.sql, person.id, 'a'.repeat(81))).rejects.toThrow(/check constraint/)
  })
})

describe('migrations', () => {
  it('apply once; re-running changes nothing', async () => {
    expect(await migrate(testDb.sql)).toEqual([])
    const names = await testDb.sql`SELECT name FROM orbit.schema_migrations ORDER BY name`
    expect(names.map((r) => r.name)).toEqual(['001_orbit_schema.sql', '002_user_display_name.sql', '003_workspace_description.sql', '004_workspace_owner.sql'])
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
