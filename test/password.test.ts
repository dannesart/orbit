// The verifier is checked against PostgreSQL's own SCRAM implementation (in-process PGlite);
// nothing connects to a hosted database.
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { generatePassword, scramSha256Verifier } from '../server/db/password'

let pg: PGlite
beforeAll(async () => {
  pg = await PGlite.create()
  await pg.exec("CREATE ROLE orbit_app LOGIN; SET password_encryption = 'scram-sha-256';")
})
afterAll(() => pg.close())

const storedVerifier = async () =>
  (await pg.query<{ rolpassword: string }>("SELECT rolpassword FROM pg_authid WHERE rolname = 'orbit_app'")).rows[0]!.rolpassword

describe('scramSha256Verifier', () => {
  it('matches the verifier PostgreSQL itself derives from the same password and salt', async () => {
    const password = generatePassword()
    await pg.exec(`ALTER ROLE orbit_app PASSWORD '${password}'`) // Postgres hashes it with a random salt
    const postgres = await storedVerifier()

    const [, iterations, salt] = postgres.match(/^SCRAM-SHA-256\$(\d+):([^$]+)\$/)!
    expect(scramSha256Verifier(password, Buffer.from(salt!, 'base64'), Number(iterations))).toBe(postgres)
  })

  it('is stored by PostgreSQL as-is, so the plaintext never reaches the server', async () => {
    const password = generatePassword()
    const verifier = scramSha256Verifier(password)
    await pg.exec(`ALTER ROLE orbit_app PASSWORD '${verifier}'`)

    expect(await storedVerifier()).toBe(verifier)
    expect(verifier).not.toContain(password)
  })

  it('uses a fresh salt every time', () => {
    const password = generatePassword()
    expect(scramSha256Verifier(password)).not.toBe(scramSha256Verifier(password))
  })
})

describe('generatePassword', () => {
  it('is long, URL-safe and unique', () => {
    const passwords = new Set(Array.from({ length: 50 }, generatePassword))
    expect(passwords.size).toBe(50)
    for (const p of passwords) expect(p).toMatch(/^[A-Za-z0-9_-]{32}$/)
  })
})
