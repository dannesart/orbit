/** The recipient declines. Nobody becomes a member; the invitation stays as history. No body. */
export default defineEventHandler(async (event) => {
  const account = await requireAccount(event)
  const result = await declineInvitation(useDb(), account.id, getRouterParam(event, 'id')!)
  if (!result.ok) throw invitationFailure(result)
  setResponseStatus(event, 204)
  return null
})
