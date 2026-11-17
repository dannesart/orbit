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

/**
 * Server-only Supabase client, used solely to send sign-in links and redeem them.
 *
 * Links use the PKCE flow: the verifier for the latest requested link lives in an httpOnly
 * cookie (keys ending in `-code-verifier`, the same contract @supabase/ssr relies on),
 * so only the browser that asked for the link can complete it. Anything else the
 * client wants to store, such as the Supabase session, stays in memory for this request.
 */
export function useSupabase(event: H3Event): SupabaseClient {
  const { supabaseUrl, supabaseKey } = useRuntimeConfig()
  if (!supabaseUrl || !supabaseKey) {
    throw createError({ statusCode: 503, statusMessage: 'Sign-in isn’t configured yet.' })
  }

  const memory = new Map<string, string>()
  const written = new Map<string, string | null>() // read-your-writes within this request
  const isVerifier = (key: string) => key.endsWith('-code-verifier')
  const storage = {
    getItem(key: string) {
      if (!isVerifier(key)) return memory.get(key) ?? null
      return written.has(key) ? written.get(key)! : getCookie(event, key) ?? null
    },
    setItem(key: string, value: string) {
      if (!isVerifier(key)) return void memory.set(key, value)
      written.set(key, value)
      setCookie(event, key, value, VERIFIER_COOKIE)
    },
    removeItem(key: string) {
      if (!isVerifier(key)) return void memory.delete(key)
      written.set(key, null)
      deleteCookie(event, key, { path: '/' })
    },
  }

  return createClient(supabaseUrl, supabaseKey, {
    auth: { flowType: 'pkce', storage, persistSession: true, autoRefreshToken: false, detectSessionInUrl: false },
  })
}

const VERIFIER_COOKIE = {
  httpOnly: true,
  sameSite: 'lax', // sent when the email link opens Orbit
  secure: !import.meta.dev,
  path: '/',
  maxAge: 60 * 60, // Supabase email links expire after an hour by default
} as const

/**
 * Supabase's client discards the stored verifier after any exchange attempt. When an
 * older link fails, put it back so the newest link in this browser still works.
 */
export function keepPendingLink(event: H3Event): void {
  for (const [name, value] of Object.entries(parseCookies(event))) {
    if (name.endsWith('-code-verifier')) setCookie(event, name, value, VERIFIER_COOKIE)
  }
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
