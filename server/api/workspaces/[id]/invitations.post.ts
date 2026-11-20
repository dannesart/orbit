/**
 * Invites an email address to the workspace, offering a role: exactly `{ email, role }`, where
 * role is 'member' or 'admin' (Steward), always stated, never assumed. Who may offer which role
 * is the domain's decision (the owner either; a steward Member only). Creates an offer and
 * nothing else: nobody becomes a member here, and the address is never looked up.
 */
export default defineEventHandler(async (event) => {
  const account = await requireAccount(event)
  const body = await readStrictObject(event, ['email', 'role'])
  // A missing role is passed on as missing (null), so the domain refuses it rather than defaulting.
  const result = await createInvitation(useDb(), account.id, getRouterParam(event, 'id')!, body.email, 'role' in body ? body.role : null)
  if (!result.ok) throw invitationFailure(result, 'Workspace not found')
  setResponseStatus(event, 201)
  return result.invitation
})
