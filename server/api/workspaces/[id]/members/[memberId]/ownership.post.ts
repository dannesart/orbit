/**
 * Hands ownership of the workspace to this member, at once: they become the owner, and the
 * former owner stays as a Steward. Their pending Steward invitations are withdrawn in the same
 * step (answered as `revokedInvitations`). Only the current owner may (the domain decides, under
 * lock); names the recipient by membership id, never by account id. Takes no body.
 */
export default defineEventHandler(async (event) => {
  const account = await requireAccount(event)
  await requireNoBody(event)
  const result = await transferOwnership(useDb(), account.id, getRouterParam(event, 'id')!, getRouterParam(event, 'memberId')!)
  if (!result.ok) throw membershipFailure(result)
  return { revokedInvitations: result.revokedInvitations }
})
