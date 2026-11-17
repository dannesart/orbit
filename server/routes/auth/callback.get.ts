/**
 * Where Supabase sends the browser after someone clicks the email link
 * (both sign-up confirmation and returning sign-in): /auth/callback?code=…
 * On failure Supabase sends ?error=…&error_code=… instead.
 */
export default defineEventHandler(async (event) => {
  setHeader(event, 'cache-control', 'no-store')
  const query = getQuery(event)
  const fail = (reason: 'expired' | 'browser' | 'invalid') => sendRedirect(event, `/sign-in?error=${reason}`, 303)

  if (query.error_code === 'otp_expired') return fail('expired')
  const code = typeof query.code === 'string' ? query.code : ''
  if (query.error || !code) return fail('invalid')

  const supabase = useSupabase(event)
  const { data, error } = await supabase.auth.exchangeCodeForSession(code)
  if (error || !data.user) {
    console.error('[auth] callback', error?.status, error?.code)
    keepPendingLink(event)
    return fail(error?.code === 'pkce_code_verifier_not_found' ? 'browser' : 'invalid')
  }

  const account = upsertAccount(useDb(), data.user.id, data.user.email ?? '')
  startSession(event, account.id)
  // Orbit keeps its own session; end the Supabase one rather than leave an unused refresh token.
  await supabase.auth.signOut({ scope: 'local' }).catch(() => {})
  return sendRedirect(event, '/', 303)
})
