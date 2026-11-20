export default defineEventHandler(async (event) => {
  const account = await requireAccount(event)
  const workspace = await getWorkspaceDetail(useDb(), account.id, getRouterParam(event, 'id')!)
  // 404 rather than 403 so workspace ids aren't confirmed to non-members.
  if (!workspace) throw createError({ statusCode: 404, statusMessage: 'Workspace not found' })
  return workspace
})
