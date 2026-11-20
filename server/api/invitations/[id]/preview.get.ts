/**
 * The public preview behind an invitation's link, for anyone holding it, signed in or not: the
 * workspace's name and the offered role, only while the invitation can be accepted. Everything
 * else (unknown, malformed, expired, answered, withdrawn or no longer standing) is the same 404.
 * Never cached, indexed or passed on as a referrer (route rules in nuxt.config.ts).
 */
export default defineEventHandler(async (event) => {
  const preview = await getInvitationPreview(useDb(), getRouterParam(event, 'id')!)
  if (!preview) throw invitationFailure({ reason: 'not_found' })
  // Built field by field: nothing else from the invitation can reach a public response.
  return { workspaceName: preview.workspaceName, role: preview.role }
})
