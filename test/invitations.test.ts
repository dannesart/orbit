// Invitations (migration 006) against PostgreSQL with the real migrations, as orbit_app, the role
// the deployed app uses. The domain operations are tested through server/utils/invitations.ts;
// the database's own guarantees are then tested by going around them.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { setName, upsertAccount } from '../server/utils/accounts'
import {
  acceptInvitation, createInvitation, declineInvitation, findInvitationsFor, getInvitationFor, listWorkspaceInvitations,
  revokeInvitation,
} from '../server/utils/invitations'
import { createWorkspace, getWorkspace, listMembers } from '../server/utils/workspaces'
import { startTestDatabase } from './db'

let testDb: Awaited<ReturnType<typeof startTestDatabase>>
beforeAll(async () => { testDb = await startTestDatabase({ asApp: true }) })
afterAll(() => testDb.close())
const sql = () => testDb.sql

let n = 0
/** A person, as sign-in creates them, with a name and their own address. */
async function person(name = `Person ${++n}`, email = `person${n}-${Date.now()}@example.com`) {
  const account = await upsertAccount(sql(), `auth-${email}`, email)
  await setName(sql(), account.id, name)
  return { id: account.id, email }
}
/** A workspace with its owner, a steward and a member. */
async function workspace() {
  const owner = await person('Owner')
  const steward = await person('Steward')
  const member = await person('Member')
  const ws = await createWorkspace(sql(), owner.id, `Place ${n}`)
  await sql()`INSERT INTO orbit.memberships (user_id, workspace_id, role) VALUES (${steward.id}, ${ws.id}, 'admin'), (${member.id}, ${ws.id}, 'member')`
  return { ws, owner, steward, member }
}
async function invite(inviterId: string, workspaceId: string, email: string) {
  const result = await createInvitation(sql(), inviterId, workspaceId, email)
  if (!result.ok) throw new Error(`could not invite: ${result.reason}`)
  return result.invitation
}
/** Outside the application's role, to set up what only time could otherwise do. */
async function asSuperuser<T>(fn: () => Promise<T>): Promise<T> {
  await sql().unsafe('RESET ROLE')
  try { return await fn() } finally { await sql().unsafe('SET ROLE orbit_app') }
}
/** Moves an invitation's whole lifetime into the past, as if 15 days had gone by. */
const ageInvitation = (id: string, days = 15) => asSuperuser(() => sql()`
  UPDATE orbit.invitations SET created_at = created_at - make_interval(days => ${days}), expires_at = expires_at - make_interval(days => ${days})
  WHERE id = ${id}`)
const stored = async (id: string) => (await sql()`SELECT * FROM orbit.invitations WHERE id = ${id}`)[0]!
const membership = async (userId: string, workspaceId: string) =>
  (await sql()`SELECT role FROM orbit.memberships WHERE user_id = ${userId} AND workspace_id = ${workspaceId}`)[0]?.role ?? null

describe('creating an invitation', () => {
  it('lets the owner and stewards invite an address, for 14 days, as an offer and nothing more', async () => {
    const { ws, owner, steward } = await workspace()
    const guest = await person('Guest')

    const byOwner = await invite(owner.id, ws.id, `  ${guest.email.toUpperCase()} `)
    expect(byOwner).toMatchObject({ workspaceId: ws.id, email: guest.email, status: 'pending' })
    const days = (Date.parse(byOwner.expiresAt) - Date.parse(byOwner.createdAt)) / 86_400_000
    expect(days).toBe(14)
    expect((await stored(byOwner.id)).invited_by).toBe(owner.id)

    expect((await createInvitation(sql(), steward.id, ws.id, 'someone-new@example.com')).ok).toBe(true)

    // Invited is not belonging
    expect(await membership(guest.id, ws.id)).toBeNull()
    expect(await getWorkspace(sql(), guest.id, ws.id)).toBeNull()
    expect((await listMembers(sql(), ws.id, owner.id)).map((m) => m.name)).not.toContain('Guest')
  })

  it('refuses members and outsiders, without telling outsiders the workspace exists', async () => {
    const { ws, member } = await workspace()
    const outsider = await person()
    expect(await createInvitation(sql(), member.id, ws.id, 'friend@example.com')).toEqual({ ok: false, reason: 'forbidden' })
    expect(await createInvitation(sql(), outsider.id, ws.id, 'friend@example.com')).toEqual({ ok: false, reason: 'not_found' })
    expect(await createInvitation(sql(), outsider.id, 'not-an-id', 'friend@example.com')).toEqual({ ok: false, reason: 'not_found' })
    expect(await sql()`SELECT 1 FROM orbit.invitations WHERE workspace_id = ${ws.id}`).toHaveLength(0)
  })

  it('refuses what isn’t an email address', async () => {
    const { ws, owner } = await workspace()
    for (const email of ['', 'nope', 'a@b', ' @example.com', 42, null]) {
      expect(await createInvitation(sql(), owner.id, ws.id, email)).toEqual({ ok: false, reason: 'invalid_email' })
    }
  })

  it('allows one pending invitation per workspace and address, however the address is written', async () => {
    const { ws, owner, steward } = await workspace()
    await invite(owner.id, ws.id, 'twice@example.com')
    expect(await createInvitation(sql(), steward.id, ws.id, 'Twice@Example.com')).toEqual({ ok: false, reason: 'already_invited' })
    // The same address may be invited to another workspace: people belong to many
    const other = await workspace()
    expect((await createInvitation(sql(), other.owner.id, other.ws.id, 'twice@example.com')).ok).toBe(true)
  })

  it('makes a new invitation, with a new id, once the last has expired, been declined or revoked', async () => {
    const { ws, owner } = await workspace()
    const guest = await person()

    const first = await invite(owner.id, ws.id, guest.email)
    await ageInvitation(first.id)
    const second = await invite(owner.id, ws.id, guest.email) // no job had to run
    expect(second.id).not.toBe(first.id)

    expect(await declineInvitation(sql(), guest.id, second.id)).toEqual({ ok: true })
    const third = await invite(owner.id, ws.id, guest.email)
    expect((await revokeInvitation(sql(), owner.id, third.id)).ok).toBe(true)
    const fourth = await invite(owner.id, ws.id, guest.email)

    // Each keeps its own history; the expired one stays expired
    const statuses = await sql()`
      SELECT id, CASE WHEN revoked_at IS NOT NULL THEN 'revoked' WHEN declined_at IS NOT NULL THEN 'declined'
                      WHEN expires_at <= now() THEN 'expired' ELSE 'pending' END AS status
      FROM orbit.invitations WHERE workspace_id = ${ws.id} ORDER BY created_at`
    expect(statuses.map((r) => [r.id, r.status])).toEqual([
      [first.id, 'expired'], [second.id, 'declined'], [third.id, 'revoked'], [fourth.id, 'pending'],
    ])
  })

  it('lets only one of two simultaneous invitations for the same address through', async () => {
    const { ws, owner, steward } = await workspace()
    const results = await Promise.all([
      createInvitation(sql(), owner.id, ws.id, 'race@example.com'),
      createInvitation(sql(), steward.id, ws.id, 'race@example.com'),
    ])
    expect(results.map((r) => r.ok).sort()).toEqual([false, true])
    expect(results.find((r) => !r.ok)).toEqual({ ok: false, reason: 'already_invited' })
    expect(await sql()`SELECT 1 FROM orbit.invitations WHERE workspace_id = ${ws.id}`).toHaveLength(1)
  })
})

describe('revoking an invitation', () => {
  it('lets the owner or any steward withdraw a pending invitation, which stays as history', async () => {
    const { ws, owner, steward } = await workspace()
    const invitation = await invite(owner.id, ws.id, 'withdrawn@example.com')
    const revoked = await revokeInvitation(sql(), steward.id, invitation.id) // not only its inviter
    expect(revoked).toMatchObject({ ok: true, invitation: { id: invitation.id, status: 'revoked' } })
    const row = await stored(invitation.id)
    expect(row.revoked_by).toBe(steward.id)
    expect(row.revoked_at).toBeInstanceOf(Date)
  })

  it('refuses members and outsiders, and anything no longer pending', async () => {
    const { ws, owner, member } = await workspace()
    const outsider = await person()
    const guest = await person()
    const invitation = await invite(owner.id, ws.id, guest.email)

    expect(await revokeInvitation(sql(), member.id, invitation.id)).toEqual({ ok: false, reason: 'forbidden' })
    expect(await revokeInvitation(sql(), outsider.id, invitation.id)).toEqual({ ok: false, reason: 'not_found' })
    expect(await revokeInvitation(sql(), owner.id, '00000000-0000-0000-0000-000000000000')).toEqual({ ok: false, reason: 'not_found' })
    expect(await revokeInvitation(sql(), owner.id, 'nope')).toEqual({ ok: false, reason: 'not_found' })

    await acceptInvitation(sql(), guest.id, invitation.id)
    expect(await revokeInvitation(sql(), owner.id, invitation.id)).toEqual({ ok: false, reason: 'not_pending', status: 'accepted' })

    const expired = await invite(owner.id, ws.id, 'late@example.com')
    await ageInvitation(expired.id)
    expect(await revokeInvitation(sql(), owner.id, expired.id)).toEqual({ ok: false, reason: 'not_pending', status: 'expired' })
  })
})

describe('the recipient', () => {
  it('finds pending invitations addressed to their verified address, and nobody else’s', async () => {
    const { ws, owner } = await workspace()
    await sql()`UPDATE orbit.workspaces SET description = 'Planning the spring launch' WHERE id = ${ws.id}`
    const guest = await person('Guest')
    const stranger = await person('Stranger')
    const invitation = await invite(owner.id, ws.id, guest.email)

    expect(await findInvitationsFor(sql(), guest.id)).toEqual([{
      id: invitation.id,
      workspace: { id: ws.id, name: ws.name, description: 'Planning the spring launch' },
      role: 'member',
      invitedBy: 'Owner',
      expiresAt: invitation.expiresAt,
    }])
    expect(await findInvitationsFor(sql(), stranger.id)).toEqual([])
    expect(JSON.stringify(await findInvitationsFor(sql(), guest.id))).not.toContain(owner.email) // never the inviter's address

    // Expired, declined and revoked invitations aren't offered
    await ageInvitation(invitation.id)
    expect(await findInvitationsFor(sql(), guest.id)).toEqual([])
  })

  it('is matched by their address however Orbit stored its case', async () => {
    const { ws, owner } = await workspace()
    const account = await upsertAccount(sql(), 'auth-mixed-case', 'Mixed.Case@Example.com') // Supabase lowercases; be safe anyway
    const invitation = await invite(owner.id, ws.id, 'mixed.case@example.com')
    expect((await findInvitationsFor(sql(), account.id)).map((i) => i.id)).toEqual([invitation.id])
    expect(await acceptInvitation(sql(), account.id, invitation.id)).toEqual({ ok: true, workspaceId: ws.id, joined: true, role: 'member' })
  })

  it('becomes a Member by accepting, which records who accepted, in the same moment', async () => {
    const { ws, owner } = await workspace()
    const guest = await person('Guest')
    const invitation = await invite(owner.id, ws.id, guest.email)

    expect(await acceptInvitation(sql(), guest.id, invitation.id)).toEqual({ ok: true, workspaceId: ws.id, joined: true, role: 'member' })
    expect(await membership(guest.id, ws.id)).toBe('member')
    const row = await stored(invitation.id)
    expect(row.accepted_by).toBe(guest.id)
    expect(row.accepted_at).toBeInstanceOf(Date)
    expect(await getWorkspace(sql(), guest.id, ws.id)).toMatchObject({ role: 'member', canManage: false })
  })

  it('declines without becoming a member', async () => {
    const { ws, owner } = await workspace()
    const guest = await person()
    const invitation = await invite(owner.id, ws.id, guest.email)
    expect(await declineInvitation(sql(), guest.id, invitation.id)).toEqual({ ok: true })
    expect(await membership(guest.id, ws.id)).toBeNull()
    expect((await stored(invitation.id)).declined_at).toBeInstanceOf(Date)
  })

  it('can’t answer an invitation addressed to someone else: it is simply not found', async () => {
    const { ws, owner } = await workspace()
    const guest = await person()
    const holderOfTheLink = await person()
    const invitation = await invite(owner.id, ws.id, guest.email)

    expect(await acceptInvitation(sql(), holderOfTheLink.id, invitation.id)).toEqual({ ok: false, reason: 'not_found' })
    expect(await declineInvitation(sql(), holderOfTheLink.id, invitation.id)).toEqual({ ok: false, reason: 'not_found' })
    expect(await acceptInvitation(sql(), holderOfTheLink.id, '00000000-0000-0000-0000-000000000000')).toEqual({ ok: false, reason: 'not_found' })
    expect(await acceptInvitation(sql(), holderOfTheLink.id, 'not-an-id')).toEqual({ ok: false, reason: 'not_found' })
    expect(await membership(holderOfTheLink.id, ws.id)).toBeNull()
    expect((await stored(invitation.id)).accepted_at).toBeNull() // still the recipient's to answer
  })

  it('can’t accept or decline an expired, revoked, declined or accepted invitation', async () => {
    const { ws, owner } = await workspace()
    const guest = await person()

    const expired = await invite(owner.id, ws.id, guest.email)
    await ageInvitation(expired.id)
    expect(await acceptInvitation(sql(), guest.id, expired.id)).toEqual({ ok: false, reason: 'not_pending', status: 'expired' })
    expect(await declineInvitation(sql(), guest.id, expired.id)).toEqual({ ok: false, reason: 'not_pending', status: 'expired' })

    const revoked = await invite(owner.id, ws.id, guest.email)
    await revokeInvitation(sql(), owner.id, revoked.id)
    expect(await acceptInvitation(sql(), guest.id, revoked.id)).toEqual({ ok: false, reason: 'not_pending', status: 'revoked' })

    const declined = await invite(owner.id, ws.id, guest.email)
    await declineInvitation(sql(), guest.id, declined.id)
    expect(await acceptInvitation(sql(), guest.id, declined.id)).toEqual({ ok: false, reason: 'not_pending', status: 'declined' })
    expect(await membership(guest.id, ws.id)).toBeNull()

    const accepted = await invite(owner.id, ws.id, guest.email)
    await acceptInvitation(sql(), guest.id, accepted.id)
    expect(await acceptInvitation(sql(), guest.id, accepted.id)).toEqual({ ok: false, reason: 'not_pending', status: 'accepted' })
    expect(await declineInvitation(sql(), guest.id, accepted.id)).toEqual({ ok: false, reason: 'not_pending', status: 'accepted' })
  })

  it('keeps their place and role if they already belong: a steward is never made a member', async () => {
    const { ws, owner, steward } = await workspace()
    const toSteward = await invite(owner.id, ws.id, steward.email)
    expect(await acceptInvitation(sql(), steward.id, toSteward.id)).toEqual({ ok: true, workspaceId: ws.id, joined: false, role: 'admin' })
    expect(await membership(steward.id, ws.id)).toBe('admin')

    const toOwner = await invite(steward.id, ws.id, owner.email)
    expect(await acceptInvitation(sql(), owner.id, toOwner.id)).toEqual({ ok: true, workspaceId: ws.id, joined: false, role: 'admin' })
    expect((await listMembers(sql(), ws.id, owner.id)).find((m) => m.you)).toMatchObject({ role: 'admin', owner: true })
  })

  it('may belong to several workspaces, each joined independently', async () => {
    const a = await workspace()
    const b = await workspace()
    const guest = await person()
    const toA = await invite(a.owner.id, a.ws.id, guest.email)
    const toB = await invite(b.owner.id, b.ws.id, guest.email)
    await acceptInvitation(sql(), guest.id, toA.id)
    expect(await membership(guest.id, a.ws.id)).toBe('member')
    expect(await membership(guest.id, b.ws.id)).toBeNull() // still only offered
    await declineInvitation(sql(), guest.id, toB.id)
    expect(await membership(guest.id, b.ws.id)).toBeNull()
  })

  it('settles simultaneous answers once: one acceptance, one membership', async () => {
    const { ws, owner } = await workspace()
    const guest = await person()
    const invitation = await invite(owner.id, ws.id, guest.email)
    const results = await Promise.all([
      acceptInvitation(sql(), guest.id, invitation.id),
      acceptInvitation(sql(), guest.id, invitation.id),
      declineInvitation(sql(), guest.id, invitation.id),
    ])
    expect(results.filter((r) => r.ok)).toHaveLength(1)
    expect(await sql()`SELECT 1 FROM orbit.memberships WHERE user_id = ${guest.id} AND workspace_id = ${ws.id}`)
      .toHaveLength(results[0]!.ok || results[1]!.ok ? 1 : 0) // an acceptance won, or the decline did
  })

  it('settles acceptance against revocation once, whichever comes first', async () => {
    const { ws, owner } = await workspace()
    const guest = await person()
    const invitation = await invite(owner.id, ws.id, guest.email)
    const [accepted, revoked] = await Promise.all([
      acceptInvitation(sql(), guest.id, invitation.id),
      revokeInvitation(sql(), owner.id, invitation.id),
    ])
    expect([accepted.ok, revoked.ok].filter(Boolean)).toHaveLength(1)
    expect(await membership(guest.id, ws.id)).toBe(accepted.ok ? 'member' : null)
  })
})

describe('reading invitations', () => {
  it('lists a workspace’s invitations, whatever became of them, to its owner and stewards only', async () => {
    const { ws, owner, steward, member } = await workspace()
    const outsider = await person()
    const guest = await person()
    const declined = await invite(owner.id, ws.id, guest.email)
    await declineInvitation(sql(), guest.id, declined.id)
    const pending = await invite(steward.id, ws.id, 'pending@example.com')

    for (const manager of [owner, steward]) {
      const result = await listWorkspaceInvitations(sql(), manager.id, ws.id)
      expect(result).toEqual({ ok: true, invitations: [
        { ...pending, invitedBy: 'Steward', revocable: true }, // a Member invitation: either may withdraw it
        expect.objectContaining({ id: declined.id, status: 'declined', invitedBy: 'Owner', closedAt: expect.any(String) }),
      ] })
    }
    expect(await listWorkspaceInvitations(sql(), member.id, ws.id)).toEqual({ ok: false, reason: 'forbidden' })
    expect(await listWorkspaceInvitations(sql(), outsider.id, ws.id)).toEqual({ ok: false, reason: 'not_found' })
    expect(await listWorkspaceInvitations(sql(), owner.id, 'nope')).toEqual({ ok: false, reason: 'not_found' })
  })

  it('shows one invitation to its recipient only, with its real status', async () => {
    const { ws, owner } = await workspace()
    const guest = await person()
    const stranger = await person()
    const invitation = await invite(owner.id, ws.id, guest.email)

    expect(await getInvitationFor(sql(), guest.id, invitation.id)).toEqual({
      id: invitation.id,
      workspace: { id: ws.id, name: ws.name, description: null },
      role: 'member',
      invitedBy: 'Owner',
      expiresAt: invitation.expiresAt,
      status: 'pending',
      acceptable: true,
      closedAt: null,
    })
    // Not theirs, nonexistent, or not an id at all: the same nothing. Not even its managers.
    for (const [who, id] of [[stranger.id, invitation.id], [owner.id, invitation.id], [guest.id, '00000000-0000-0000-0000-000000000000'], [guest.id, 'nope']]) {
      expect(await getInvitationFor(sql(), who!, id!)).toBeNull()
    }

    await ageInvitation(invitation.id)
    expect(await getInvitationFor(sql(), guest.id, invitation.id)).toMatchObject({ status: 'expired', closedAt: null })
    const accepted = await invite(owner.id, ws.id, guest.email)
    await acceptInvitation(sql(), guest.id, accepted.id)
    expect(await getInvitationFor(sql(), guest.id, accepted.id)).toMatchObject({ status: 'accepted', closedAt: expect.any(String) })
  })
})

describe('acceptance and membership are atomic', () => {
  it('records no acceptance if becoming a member fails', async () => {
    const { ws, owner } = await workspace()
    const guest = await person()
    const invitation = await invite(owner.id, ws.id, guest.email)
    // Make the membership insert fail, for this person only
    await asSuperuser(() => sql().unsafe(`
      CREATE FUNCTION orbit.fail_membership() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.user_id = '${guest.id}' THEN RAISE EXCEPTION 'membership refused'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER fail_membership BEFORE INSERT ON orbit.memberships FOR EACH ROW EXECUTE FUNCTION orbit.fail_membership();`))
    try {
      await expect(acceptInvitation(sql(), guest.id, invitation.id)).rejects.toThrow('membership refused')
    } finally {
      await asSuperuser(() => sql().unsafe('DROP TRIGGER fail_membership ON orbit.memberships; DROP FUNCTION orbit.fail_membership();'))
    }
    expect((await stored(invitation.id)).accepted_at).toBeNull()
    expect(await membership(guest.id, ws.id)).toBeNull()
    expect(await acceptInvitation(sql(), guest.id, invitation.id)).toMatchObject({ ok: true, joined: true }) // still answerable
  })
})

// Going around the domain operations, as orbit_app, to show what the database itself refuses.
describe('the database’s own guarantees', () => {
  it('refuses a second overlapping open invitation, even without the application’s check', async () => {
    const { ws, owner } = await workspace()
    await invite(owner.id, ws.id, 'direct@example.com')
    await expect(sql()`INSERT INTO orbit.invitations (workspace_id, email, invited_by) VALUES (${ws.id}, 'direct@example.com', ${owner.id})`)
      .rejects.toMatchObject({ code: '23P01', constraint_name: 'invitations_one_open_per_address' })
  })

  it('refuses to record an acceptance without the membership, at commit', async () => {
    const { ws, owner } = await workspace()
    const guest = await person()
    const invitation = await invite(owner.id, ws.id, guest.email)
    await expect(sql()`UPDATE orbit.invitations SET accepted_at = now(), accepted_by = ${guest.id} WHERE id = ${invitation.id}`)
      .rejects.toThrow(/not a member of the workspace/)
    expect((await stored(invitation.id)).accepted_at).toBeNull()
  })

  it('refuses an acceptance by anyone but the recipient, even an existing member of the workspace', async () => {
    const { ws, owner, member } = await workspace()
    const guest = await person()
    const invitation = await invite(owner.id, ws.id, guest.email)
    // The member already belongs, so only the recipient check stands in the way
    await expect(sql()`UPDATE orbit.invitations SET accepted_at = now(), accepted_by = ${member.id} WHERE id = ${invitation.id}`)
      .rejects.toThrow(/can only be accepted by the account it was addressed to/)
    await expect(sql().begin(async (tx) => {
      await tx`INSERT INTO orbit.memberships (user_id, workspace_id, role) VALUES (${guest.id}, ${ws.id}, 'member')` // even with the recipient made a member
      await tx`UPDATE orbit.invitations SET accepted_at = now(), accepted_by = ${owner.id} WHERE id = ${invitation.id}`
    })).rejects.toThrow(/can only be accepted by the account it was addressed to/)

    expect((await stored(invitation.id)).accepted_at).toBeNull()
    expect(await membership(guest.id, ws.id)).toBeNull() // the whole transaction rolled back
    expect(await acceptInvitation(sql(), guest.id, invitation.id)).toMatchObject({ ok: true, joined: true }) // still the recipient's to answer
  })

  it('refuses to record an answer after expiry, and stamps answers with its own clock', async () => {
    const { ws, owner } = await workspace()
    const late = await invite(owner.id, ws.id, 'late-answer@example.com')
    await ageInvitation(late.id)
    await expect(sql()`UPDATE orbit.invitations SET declined_at = now() WHERE id = ${late.id}`)
      .rejects.toMatchObject({ code: '23514', constraint_name: 'invitations_closed_while_open' })

    const backdated = await invite(owner.id, ws.id, 'backdated@example.com')
    await sql()`UPDATE orbit.invitations SET declined_at = '2000-01-01' WHERE id = ${backdated.id}`
    expect(Math.abs(Date.now() - (await stored(backdated.id)).declined_at.getTime())).toBeLessThan(60_000)
  })

  it('keeps history final: a closed invitation can’t be reopened or answered again', async () => {
    const { ws, owner } = await workspace()
    const guest = await person()
    const invitation = await invite(owner.id, ws.id, guest.email)
    await declineInvitation(sql(), guest.id, invitation.id)
    await expect(sql()`UPDATE orbit.invitations SET declined_at = NULL WHERE id = ${invitation.id}`).rejects.toMatchObject({ code: '55000' })
    await expect(sql()`UPDATE orbit.invitations SET revoked_at = now(), revoked_by = ${owner.id} WHERE id = ${invitation.id}`).rejects.toMatchObject({ code: '55000' })
  })

  it('allows only one outcome, each with its author', async () => {
    const { ws, owner } = await workspace()
    const one = await invite(owner.id, ws.id, 'outcome@example.com')
    await expect(sql()`UPDATE orbit.invitations SET declined_at = now(), revoked_at = now(), revoked_by = ${owner.id} WHERE id = ${one.id}`)
      .rejects.toMatchObject({ constraint_name: 'invitations_one_outcome' })
    await expect(sql()`UPDATE orbit.invitations SET revoked_at = now() WHERE id = ${one.id}`)
      .rejects.toMatchObject({ constraint_name: 'invitations_revoked_by_someone' })
  })

  it('only stores normalised addresses', async () => {
    const { ws, owner } = await workspace()
    for (const email of ['Upper@example.com', ' padded@example.com', 'no-at-sign', 'a b@example.com']) {
      await expect(sql()`INSERT INTO orbit.invitations (workspace_id, email, invited_by) VALUES (${ws.id}, ${email}, ${owner.id})`, email)
        .rejects.toMatchObject({ constraint_name: 'invitations_email_normalised' })
    }
  })

  it('lets the app create and answer invitations, but never rewrite or delete them', async () => {
    const { ws, owner } = await workspace()
    const other = await workspace()
    const invitation = await invite(owner.id, ws.id, 'fixed@example.com')
    for (const statement of [
      sql()`UPDATE orbit.invitations SET expires_at = now() + interval '1 year' WHERE id = ${invitation.id}`,
      sql()`UPDATE orbit.invitations SET email = 'someone-else@example.com' WHERE id = ${invitation.id}`,
      sql()`UPDATE orbit.invitations SET workspace_id = ${other.ws.id} WHERE id = ${invitation.id}`,
      sql()`INSERT INTO orbit.invitations (workspace_id, email, invited_by, created_at) VALUES (${ws.id}, 'past@example.com', ${owner.id}, '2000-01-01')`,
      sql()`INSERT INTO orbit.invitations (workspace_id, email, invited_by, accepted_at, accepted_by) VALUES (${ws.id}, 'pre@example.com', ${owner.id}, now(), ${owner.id})`,
      sql()`DELETE FROM orbit.invitations WHERE id = ${invitation.id}`,
    ]) await expect(statement).rejects.toMatchObject({ code: '42501' }) // permission denied
    expect((await stored(invitation.id)).email).toBe('fixed@example.com')
  })

  it('goes with its workspace when a workspace is deleted', async () => {
    const { ws, owner } = await workspace()
    const invitation = await invite(owner.id, ws.id, 'cascade@example.com')
    await asSuperuser(() => sql()`DELETE FROM orbit.workspaces WHERE id = ${ws.id}`)
    expect(await sql()`SELECT 1 FROM orbit.invitations WHERE id = ${invitation.id}`).toHaveLength(0)
  })
})
