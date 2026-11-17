export default defineNuxtRouteMiddleware(async (to) => {
  const account = useAccount()
  if (account.value === undefined) {
    // useRequestFetch forwards the browser's cookies during server rendering.
    account.value = (await useRequestFetch()('/api/me')).email
  }

  if (!account.value && to.path !== '/sign-in') return navigateTo('/sign-in')
  if (account.value && to.path === '/sign-in') return navigateTo('/')
})
