export default defineEventHandler(async (event) => {
  const account = requireAccount(event)
  const body = await readBody<{ name?: unknown }>(event).catch(() => null)
  const parsed = parseWorkspaceName(body?.name)
  if ('error' in parsed) throw createError({ statusCode: 422, statusMessage: parsed.error })

  setResponseStatus(event, 201)
  return createWorkspace(useDb(), account.id, parsed.name)
})
