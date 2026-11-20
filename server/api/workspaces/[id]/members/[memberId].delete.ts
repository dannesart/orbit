/**
 * Removes someone from the workspace, withdrawing their pending invitations here in the same
 * step (the domain decides who may: the owner removes Members and Stewards, a steward Members,
 * nobody themselves or the owner). Takes no body.
 */
export default defineEventHandler(async (event) => {
  const account = await requireAccount(event)
  await requireNoBody(event)
  const result = await removeMember(useDb(), account.id, getRouterParam(event, 'id')!, getRouterParam(event, 'memberId')!)
  if (!result.ok) throw membershipFailure(result)
  setResponseStatus(event, 204)
  return null
})
