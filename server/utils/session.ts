import type { H3Event } from 'h3'
import type { DatabaseSync } from 'node:sqlite'
import { createUser, openDb, userExists } from './workspaces'

const COOKIE = 'orbit_uid'
let db: DatabaseSync | undefined

export function useDb(): DatabaseSync {
  db ??= openDb(useRuntimeConfig().dbPath)
  return db
}

/**
 * Anonymous, browser-bound identity until real sign-in exists.
 * Returns null when this browser has never created anything.
 */
export function currentUserId(event: H3Event): string | null {
  const id = getCookie(event, COOKIE)
  return id && userExists(useDb(), id) ? id : null
}

/** Like currentUserId, but mints a new identity on first write. */
export function ensureUserId(event: H3Event): string {
  const existing = currentUserId(event)
  if (existing) return existing
  const id = createUser(useDb())
  setCookie(event, COOKIE, id, {
    httpOnly: true,
    sameSite: 'lax',
    secure: !import.meta.dev,
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  })
  return id
}
