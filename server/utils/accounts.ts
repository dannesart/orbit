import { createHash, randomBytes } from 'node:crypto'
import type { Db } from './db'

export interface Account {
  id: string
  email: string
}

export const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30

/**
 * Finds or creates the Orbit user for a verified Supabase identity.
 * The Supabase id is only a lookup key; everything in Orbit references our own user id.
 */
export async function upsertAccount(db: Db, authSubject: string, email: string): Promise<Account> {
  const [account] = await db<Account[]>`
    INSERT INTO orbit.users (auth_subject, email) VALUES (${authSubject}, ${email})
    ON CONFLICT (auth_subject) DO UPDATE SET email = excluded.email
    RETURNING id, email
  `
  return account!
}

const hash = (token: string) => createHash('sha256').update(token).digest('hex')

/** Returns the raw token for the cookie; only its hash is stored. */
export async function createSession(db: Db, userId: string, now = Date.now()): Promise<string> {
  const token = randomBytes(32).toString('base64url')
  await db`
    INSERT INTO orbit.sessions (token_hash, user_id, created_at, expires_at)
    VALUES (${hash(token)}, ${userId}, ${new Date(now)}, ${new Date(now + SESSION_TTL_MS)})
  `
  return token
}

export async function resolveSession(db: Db, token: string, now = Date.now()): Promise<Account | null> {
  const [account] = await db<Account[]>`
    SELECT u.id, u.email FROM orbit.sessions s JOIN orbit.users u ON u.id = s.user_id
    WHERE s.token_hash = ${hash(token)} AND s.expires_at > ${new Date(now)}
  `
  return account ?? null
}

export async function deleteSession(db: Db, token: string): Promise<void> {
  await db`DELETE FROM orbit.sessions WHERE token_hash = ${hash(token)}`
}

export function parseEmail(input: unknown): string | null {
  const email = typeof input === 'string' ? input.trim().toLowerCase() : ''
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254 ? email : null
}
