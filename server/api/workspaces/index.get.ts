export default defineEventHandler(async (event) => {
  return listWorkspaces(useDb(), (await requireAccount(event)).id)
})
