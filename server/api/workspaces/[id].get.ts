export default defineEventHandler((event) => {
  const account = requireAccount(event)
  const workspace = getWorkspace(useDb(), account.id, getRouterParam(event, 'id')!)
  // 404 rather than 403 so workspace ids aren't confirmed to non-members.
  if (!workspace) throw createError({ statusCode: 404, statusMessage: 'Workspace not found' })
  return workspace
})
