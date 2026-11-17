export default defineEventHandler(async (event) => {
  const account = await currentAccount(event)
  return { email: account?.email ?? null }
})
