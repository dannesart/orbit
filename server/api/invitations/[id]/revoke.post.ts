/** The owner or a steward withdraws a pending invitation. It stays as history. No body. */
export default defineEventHandler(async (event) => {
  const account = await requireAccount(event)
  const result = await revokeInvitation(useDb(), account.id, getRouterParam(event, 'id')!)
  if (!result.ok) throw invitationFailure(result)
  return result.invitation
})
