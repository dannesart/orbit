export default defineEventHandler((event) => {
  return listWorkspaces(useDb(), requireAccount(event).id)
})
