/**
 * Where a route rule sets Cache-Control (nuxt.config.ts), errors keep it too. Nitro's error
 * handler otherwise replaces it with `no-cache` on every 404, so a private route's "not found"
 * would lose `no-store`. The `error` hook runs just before that handler; from then on, for this
 * response only, Cache-Control can only be the rule's value. Nothing else about errors changes.
 */
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('error', (_error, { event }) => {
    const rule = event && getRouteRules(event).headers?.['cache-control']
    if (!event || !rule) return
    const res = event.node.res
    const setHeader = res.setHeader.bind(res)
    res.setHeader = (name, value) => setHeader(name, name.toLowerCase() === 'cache-control' ? rule : value)
  })
})
