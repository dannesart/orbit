/** Withdraws a pending invitation: the owner any, a steward Member invitations only. Takes no body. */
export default defineEventHandler(async (event) => {
  const account = await requireAccount(event)
  await requireNoBody(event)
  const result = await revokeInvitation(useDb(), account.id, getRouterParam(event, 'id')!)
  if (!result.ok) throw invitationFailure(result)
  return result.invitation
})
