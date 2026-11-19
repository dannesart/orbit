/**
 * Change a workspace's name and/or purpose. The single endpoint behind both the purpose dialog
 * on Arrival and Settings. Fields left out are untouched; `description: null` or "" clears it.
 */
export default defineEventHandler(async (event) => {
  const account = await requireAccount(event)
  const body = await readBody<Record<string, unknown>>(event).catch(() => null)
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw createError({ statusCode: 422, statusMessage: 'Send the changes as an object.' })
  }

  const changes: WorkspaceChanges = {}
  if ('name' in body) {
    const parsed = parseWorkspaceName(body.name)
    if ('error' in parsed) throw createError({ statusCode: 422, statusMessage: parsed.error, data: { field: 'name' } })
    changes.name = parsed.name
  }
  if ('description' in body) {
    const parsed = parseDescription(body.description)
    if ('error' in parsed) throw createError({ statusCode: 422, statusMessage: parsed.error, data: { field: 'description' } })
    changes.description = parsed.description
  }

  const result = await updateWorkspace(useDb(), account.id, getRouterParam(event, 'id')!, changes)
  if (!result.ok && result.reason === 'not_found') throw createError({ statusCode: 404, statusMessage: 'Workspace not found' })
  if (!result.ok) throw createError({ statusCode: 403, statusMessage: 'Only this workspace’s admins can change it.' })
  return result.workspace
})
