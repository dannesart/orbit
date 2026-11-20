/**
 * The recipient accepts, and so becomes a Member: the only endpoint through which an invitation
 * leads to membership. Who accepts is the signed-in account, never anything in the request, so
 * there is no body. `joined` says whether a membership was created (true), or they already
 * belonged and kept their place and role exactly as it was (false).
 */
export default defineEventHandler(async (event) => {
  const account = await requireAccount(event)
  const result = await acceptInvitation(useDb(), account.id, getRouterParam(event, 'id')!)
  if (!result.ok) throw invitationFailure(result)
  return { workspaceId: result.workspaceId, joined: result.joined }
})
