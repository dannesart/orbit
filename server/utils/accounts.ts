import type { DatabaseSync } from 'node:sqlite'
import { createHash, randomBytes, randomUUID } from 'node:crypto'

export interface Account {
  id: string
  email: string
}

export const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30

/**
 * Finds or creates the Orbit user for a verified Supabase identity.
 * The Supabase id is only a lookup key; everything in Orbit references our own user id.
 */
export function upsertAccount(db: DatabaseSync, authSubject: string, email: string): Account {
  return db.prepare(`
    INSERT INTO users (id, auth_subject, email, created_at) VALUES (?, ?, ?, ?)
    ON CONFLICT (auth_subject) DO UPDATE SET email = excluded.email
    RETURNING id, email
  `).get(randomUUID(), authSubject, email, new Date().toISOString()) as unknown as Account
}

const hash = (token: string) => createHash('sha256').update(token).digest('hex')

/** Returns the raw token for the cookie; only its hash is stored. */
export function createSession(db: DatabaseSync, userId: string, now = Date.now()): string {
  const token = randomBytes(32).toString('base64url')
  db.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .run(hash(token), userId, new Date(now).toISOString(), new Date(now + SESSION_TTL_MS).toISOString())
  return token
}

export function resolveSession(db: DatabaseSync, token: string, now = Date.now()): Account | null {
  const row = db.prepare(`
    SELECT u.id, u.email FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > ?
  `).get(hash(token), new Date(now).toISOString())
  return (row as unknown as Account) ?? null
}

export function deleteSession(db: DatabaseSync, token: string): void {
  db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hash(token))
}

export function parseEmail(input: unknown): string | null {
  const email = typeof input === 'string' ? input.trim().toLowerCase() : ''
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254 ? email : null
}
