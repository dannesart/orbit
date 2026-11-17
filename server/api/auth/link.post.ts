/** Ask Supabase to email a sign-in link. New addresses get a sign-up confirmation link instead. */
export default defineEventHandler(async (event) => {
  const body = await readBody<{ email?: unknown }>(event).catch(() => null)
  const email = parseEmail(body?.email)
  if (!email) throw createError({ statusCode: 422, statusMessage: 'That doesn’t look like an email address.' })

  const { error } = await useSupabase(event).auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true, emailRedirectTo: `${useRuntimeConfig().siteUrl}/auth/callback` },
  })
  if (error) throw authFailure(error, 'We couldn’t send a link right now. Please try again.')

  setResponseStatus(event, 204)
  return null
})
