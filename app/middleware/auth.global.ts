export default defineNuxtRouteMiddleware(async (to) => {
  const account = useAccount()
  if (account.value === undefined) {
    // useRequestFetch forwards the browser's cookies during server rendering.
    const me = await useRequestFetch()<{ email: string | null; name: string | null }>('/api/me')
    account.value = me.email ? { email: me.email, name: me.name } : null
  }

  // Where someone was going is carried through each step (signInPath, welcomePath; validated
  // by safeDestination) and honoured once nothing more is needed. It only says where to go:
  // the page it leads to is authorized by the server like any other visit.
  // An invitation's page is open to everyone: its public preview needs no account, and accepting
  // it asks the visitor to sign in (keeping the link) from the page itself.
  if (!account.value) return to.path === '/sign-in' || isInvitationPath(to.path) ? undefined : navigateTo(signInPath(to.fullPath))
  if (to.path === '/sign-in') {
    const next = to.query.next
    return navigateTo(account.value.name ? (safeDestination(next) ?? '/') : welcomePath(next))
  }

  // One question before anything else, asked once: new people and existing people without a
  // name answer it on their next visit; their workspaces are untouched either way.
  if (!account.value.name && to.path !== '/welcome') return navigateTo(welcomePath(to.fullPath))
  if (account.value.name && to.path === '/welcome' && !to.query.change) return navigateTo(safeDestination(to.query.back) ?? '/')
})
