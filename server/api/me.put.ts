/** The signed-in person sets what Orbit should call them. Only ever their own profile. */
export default defineEventHandler(async (event) => {
  const account = await requireAccount(event)
  const body = await readBody<{ name?: unknown }>(event).catch(() => null)
  const parsed = parseName(body?.name)
  if ('error' in parsed) throw createError({ statusCode: 422, statusMessage: parsed.error })

  const updated = await setName(useDb(), account.id, parsed.name)
  return { email: updated.email, name: updated.name }
})
