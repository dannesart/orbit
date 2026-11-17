export default defineNuxtRouteMiddleware(async (to) => {
  const account = useAccount()
  if (account.value === undefined) {
    // useRequestFetch forwards the browser's cookies during server rendering.
    const me = await useRequestFetch()<{ email: string | null; name: string | null }>('/api/me')
    account.value = me.email ? { email: me.email, name: me.name } : null
  }

  if (!account.value) return to.path === '/sign-in' ? undefined : navigateTo('/sign-in')
  if (to.path === '/sign-in') return navigateTo('/')

  // One question before anything else, asked once: new people and existing people without a
  // name answer it on their next visit; their workspaces are untouched either way.
  if (!account.value.name && to.path !== '/welcome') return navigateTo('/welcome')
  if (account.value.name && to.path === '/welcome') return navigateTo('/')
})
