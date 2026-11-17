/** Step 1: ask Supabase to email a one-time code. New addresses become new accounts. */
export default defineEventHandler(async (event) => {
  const body = await readBody<{ email?: unknown }>(event).catch(() => null)
  const email = parseEmail(body?.email)
  if (!email) throw createError({ statusCode: 422, statusMessage: 'That doesn’t look like an email address.' })

  const { error } = await useSupabase().auth.signInWithOtp({ email, options: { shouldCreateUser: true } })
  if (error) throw authFailure(error, 'We couldn’t send a code right now. Please try again.')

  setResponseStatus(event, 204)
  return null
})
