/**
 * One invitation, for its recipient opening its link: with its real status, pending or not.
 * Anyone else gets 404, exactly as for an invitation that doesn't exist. Reading answers nothing.
 */
export default defineEventHandler(async (event) => {
  const account = await requireAccount(event)
  const invitation = await getInvitationFor(useDb(), account.id, getRouterParam(event, 'id')!)
  if (!invitation) throw invitationFailure({ reason: 'not_found' })
  return invitation
})
