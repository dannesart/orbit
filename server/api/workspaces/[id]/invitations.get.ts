/** A workspace's invitations, whatever became of them, newest first: for its owner and stewards only. */
export default defineEventHandler(async (event) => {
  const account = await requireAccount(event)
  const result = await listWorkspaceInvitations(useDb(), account.id, getRouterParam(event, 'id')!)
  if (!result.ok) throw invitationFailure(result, 'Workspace not found')
  return result.invitations
})
