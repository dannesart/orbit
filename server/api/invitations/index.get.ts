/** Pending invitations addressed to the signed-in account's verified email address. */
export default defineEventHandler(async (event) => {
  return findInvitationsFor(useDb(), (await requireAccount(event)).id)
})
