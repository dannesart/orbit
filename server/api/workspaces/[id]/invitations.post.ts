/**
 * The owner or a steward invites an email address to their workspace: `{ email }`. Creates an
 * offer and nothing else: nobody becomes a member here, and whether the address belongs to
 * anyone in Orbit is never looked up or revealed.
 */
export default defineEventHandler(async (event) => {
  const account = await requireAccount(event)
  const body = await readBody<Record<string, unknown>>(event).catch(() => null)
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw invitationFailure({ reason: 'invalid_body' })

  const result = await createInvitation(useDb(), account.id, getRouterParam(event, 'id')!, body.email)
  if (!result.ok) throw invitationFailure(result, 'Workspace not found')
  setResponseStatus(event, 201)
  return result.invitation
})
