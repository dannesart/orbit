/** Step 2: verify the code with Supabase, then start an Orbit session. */
export default defineEventHandler(async (event) => {
  const body = await readBody<{ email?: unknown; code?: unknown }>(event).catch(() => null)
  const email = parseEmail(body?.email)
  const code = typeof body?.code === 'string' ? body.code.replace(/\s/g, '') : ''
  if (!email || !/^\d{6,10}$/.test(code)) {
    throw createError({ statusCode: 422, statusMessage: 'Enter the code from your email.' })
  }

  const supabase = useSupabase()
  const { data, error } = await supabase.auth.verifyOtp({ email, token: code, type: 'email' })
  if (error || !data.user) {
    throw error?.status === 429
      ? authFailure(error, '')
      : createError({ statusCode: 400, statusMessage: 'That code didn’t work. Check it, or send a new one.' })
  }

  const account = upsertAccount(useDb(), data.user.id, data.user.email ?? email)
  startSession(event, account.id)
  // Orbit keeps its own session; revoke the Supabase one so no unused refresh token lingers.
  await supabase.auth.signOut({ scope: 'local' }).catch(() => {})
  return { email: account.email }
})
