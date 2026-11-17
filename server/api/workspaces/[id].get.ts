export default defineEventHandler((event) => {
  const userId = currentUserId(event)
  const workspace = userId && getWorkspace(useDb(), userId, getRouterParam(event, 'id')!)
  // 404 rather than 403 so workspace ids aren't confirmed to non-members.
  if (!workspace) throw createError({ statusCode: 404, statusMessage: 'Workspace not found' })
  return workspace
})
