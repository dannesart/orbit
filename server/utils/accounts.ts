import { createHash, randomBytes } from 'node:crypto'
import type { Db } from './db'

export interface Account {
  id: string
  email: string
  /** What the person wants to be called; null until they tell us. */
  name: string | null
}

export const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30
export const NAME_MAX = 80

/**
 * Finds or creates the Orbit user for a verified Supabase identity.
 * The Supabase id is only a lookup key; everything in Orbit references our own user id.
 */
export async function upsertAccount(db: Db, authSubject: string, email: string): Promise<Account> {
  const [account] = await db<Account[]>`
    INSERT INTO orbit.users (auth_subject, email) VALUES (${authSubject}, ${email})
    ON CONFLICT (auth_subject) DO UPDATE SET email = excluded.email
    RETURNING id, email, display_name AS name
  `
  return account!
}

/**
 * Accepts any name people actually use (any script, apostrophes, single words), after
 * trimming and collapsing whitespace. Rejects only empty, overlong or control characters.
 */
export function parseName(input: unknown): { name: string } | { error: string } {
  const name = typeof input === 'string' ? input.normalize('NFC').trim().replace(/\s+/g, ' ') : ''
  if (!name) return { error: 'Tell us what to call you.' }
  if ([...name].length > NAME_MAX) return { error: `Keep it under ${NAME_MAX} characters.` }
  if (/\p{Cc}/u.test(name)) return { error: 'That name has characters we can’t use.' }
  return { name }
}

export async function setName(db: Db, userId: string, name: string): Promise<Account> {
  const [account] = await db<Account[]>`
    UPDATE orbit.users SET display_name = ${name} WHERE id = ${userId}
    RETURNING id, email, display_name AS name
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
    SELECT u.id, u.email, u.display_name AS name FROM orbit.sessions s JOIN orbit.users u ON u.id = s.user_id
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
