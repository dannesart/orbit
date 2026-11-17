import type { H3Event } from 'h3'
import type { DatabaseSync } from 'node:sqlite'
import { type AuthError, createClient, type SupabaseClient } from '@supabase/supabase-js'
import { type Account, SESSION_TTL_MS, createSession, deleteSession, resolveSession } from './accounts'
import { openDb } from './db'

const COOKIE = 'orbit_session'
let db: DatabaseSync | undefined

export function useDb(): DatabaseSync {
  db ??= openDb(useRuntimeConfig().dbPath)
  return db
}

/** The signed-in account, verified against Orbit's own session store. */
export function currentAccount(event: H3Event): Account | null {
  const token = getCookie(event, COOKIE)
  return token ? resolveSession(useDb(), token) : null
}

export function requireAccount(event: H3Event): Account {
  const account = currentAccount(event)
  if (!account) throw createError({ statusCode: 401, statusMessage: 'Please sign in.' })
  return account
}

export function startSession(event: H3Event, userId: string): void {
  setCookie(event, COOKIE, createSession(useDb(), userId), {
    httpOnly: true,
    sameSite: 'lax',
    secure: !import.meta.dev,
    path: '/',
    maxAge: SESSION_TTL_MS / 1000,
  })
}

export function endSession(event: H3Event): void {
  const token = getCookie(event, COOKIE)
  if (token) deleteSession(useDb(), token)
  deleteCookie(event, COOKIE, { path: '/' })
}

/** Server-only Supabase client, used solely to send and verify email codes. */
export function useSupabase(): SupabaseClient {
  const { supabaseUrl, supabaseKey } = useRuntimeConfig()
  if (!supabaseUrl || !supabaseKey) {
    throw createError({ statusCode: 503, statusMessage: 'Sign-in isn’t configured yet.' })
  }
  return createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}

/** Maps a Supabase Auth error to a friendly, non-revealing HTTP error. */
export function authFailure(error: AuthError, fallback: string) {
  console.error('[auth]', error.status, error.code, error.message)
  if (error.status === 429) {
    return createError({ statusCode: 429, statusMessage: 'Too many attempts. Please wait a minute and try again.' })
  }
  if (error.code === 'email_address_not_authorized') {
    return createError({ statusCode: 422, statusMessage: 'Orbit can’t send email to that address yet.' })
  }
  return createError({ statusCode: error.status && error.status < 500 ? 400 : 502, statusMessage: fallback })
}
