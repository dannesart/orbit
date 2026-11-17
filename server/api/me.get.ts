export default defineEventHandler((event) => {
  const account = currentAccount(event)
  return { email: account?.email ?? null }
})
