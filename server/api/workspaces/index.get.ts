export default defineEventHandler((event) => {
  const userId = currentUserId(event)
  return userId ? listWorkspaces(useDb(), userId) : []
})
