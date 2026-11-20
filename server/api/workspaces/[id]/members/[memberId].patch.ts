/**
 * Changes a membership's role: exactly `{ role }`, 'member' or 'admin'. Promotion and demotion
 * are the owner's (the domain decides, under lock); asking for the role someone already has is
 * a no-op for whoever could have changed it. Names the membership by its own id, never a user id.
 * Ownership never changes here.
 */
export default defineEventHandler(async (event) => {
  const account = await requireAccount(event)
  const body = await readStrictObject(event, ['role'])
  const result = await setMemberRole(useDb(), account.id, getRouterParam(event, 'id')!, getRouterParam(event, 'memberId')!, 'role' in body ? body.role : null)
  if (!result.ok) throw membershipFailure(result)
  return { id: result.membershipId, role: result.role }
})
