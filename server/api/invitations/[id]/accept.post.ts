/**
 * The recipient accepts, and so holds the offered role: the only endpoint through which an
 * invitation leads to membership. Who accepts is the signed-in account, never anything in the
 * request, so it takes no body (and refuses one). `joined` says whether a membership was created;
 * `role` is the role they now hold: a Steward invitation raises a Member, nothing lowers anyone.
 */
export default defineEventHandler(async (event) => {
  const account = await requireAccount(event)
  await requireNoBody(event)
  const result = await acceptInvitation(useDb(), account.id, getRouterParam(event, 'id')!)
  if (!result.ok) throw invitationFailure(result)
  return { workspaceId: result.workspaceId, joined: result.joined, role: result.role }
})
