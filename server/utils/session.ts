import type { H3Event } from 'h3'
import { type AuthError, createClient, type SupabaseClient } from '@supabase/supabase-js'
import { type Account, SESSION_TTL_MS, createSession, deleteSession, resolveSession } from './accounts'
import { useDb } from './db'

const COOKIE = 'orbit_session'

/** The signed-in account, verified against Orbit's own session store. */
export async function currentAccount(event: H3Event): Promise<Account | null> {
  const token = getCookie(event, COOKIE)
  return token ? resolveSession(useDb(), token) : null
}

export async function requireAccount(event: H3Event): Promise<Account> {
  const account = await currentAccount(event)
  if (!account) throw createError({ statusCode: 401, statusMessage: 'Please sign in.' })
  return account
}

export async function startSession(event: H3Event, userId: string): Promise<void> {
  setCookie(event, COOKIE, await createSession(useDb(), userId), {
    httpOnly: true,
    sameSite: 'lax',
    secure: !import.meta.dev,
    path: '/',
    maxAge: SESSION_TTL_MS / 1000,
  })
}

export async function endSession(event: H3Event): Promise<void> {
  const token = getCookie(event, COOKIE)
  if (token) await deleteSession(useDb(), token)
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

/**
 * Maps a Supabase Auth error to a friendly HTTP error. Supabase's messages never contain
 * the code or credentials, so logging them is safe; request bodies are never logged.
 */
export function authFailure(error: AuthError, fallback: string) {
  console.error('[auth]', error.status, error.code, error.message)

  // Per-address resend cooldown: "For security purposes, you can only request this after 42 seconds."
  const retryAfter = Number(error.message.match(/after (\d+) seconds?/)?.[1])
  if (retryAfter) {
    return createError({
      statusCode: 429,
      statusMessage: `Please wait ${retryAfter} seconds before asking for another code.`,
      data: { retryAfter },
    })
  }
  switch (error.code) {
    case 'otp_expired':
      return createError({ statusCode: 400, statusMessage: 'That code is incorrect or has expired. Check it, or send a new one.' })
    case 'over_email_send_rate_limit':
      return createError({ statusCode: 429, statusMessage: 'Orbit has sent a lot of emails just now. Please try again in a few minutes.' })
  }
  if (error.status === 429) {
    return createError({ statusCode: 429, statusMessage: 'Too many attempts. Please wait a few minutes and try again.' })
  }
  return createError({ statusCode: error.status && error.status < 500 ? 400 : 502, statusMessage: fallback })
}
