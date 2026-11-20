// Membership and invitation authority (migration 007, server/utils/authority.ts): the matrix
// against the real operations, role-aware invitations, owner protection, and what the database
// itself refuses, all as orbit_app. Concurrent sessions are tested in test/concurrency.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { setName, upsertAccount } from '../server/utils/accounts'
import { type Standing, allowedActions, blockedByStewardshipOffer, mayInvite, mayRevoke, parseRole } from '../server/utils/authority'
import {
  acceptInvitation, createInvitation, declineInvitation, findInvitationsFor, getInvitationFor, getInvitationPreview,
  listWorkspaceInvitations, revokeInvitation,
} from '../server/utils/invitations'
import { removeMember, setMemberRole } from '../server/utils/memberships'
import { type Role, createWorkspace } from '../server/utils/workspaces'
import { startTestDatabase } from './db'

let testDb: Awaited<ReturnType<typeof startTestDatabase>>
beforeAll(async () => { testDb = await startTestDatabase({ asApp: true }) })
afterAll(() => testDb.close())
const sql = () => testDb.sql

let n = 0
async function person(name: string) {
  const email = `${name.toLowerCase()}${++n}@example.com`
  const account = await upsertAccount(sql(), `auth-${email}`, email)
  await setName(sql(), account.id, name)
  return { id: account.id, email }
}
type Person = Awaited<ReturnType<typeof person>>
/** A workspace with its owner, a steward, a member, and an outsider. */
async function world() {
  const owner = await person('Owner')
  const steward = await person('Steward')
  const member = await person('Member')
  const outsider = await person('Outsider')
  const ws = await createWorkspace(sql(), owner.id, `Place ${n}`)
  await sql()`INSERT INTO orbit.memberships (user_id, workspace_id, role) VALUES (${steward.id}, ${ws.id}, 'admin'), (${member.id}, ${ws.id}, 'member')`
  return { ws, owner, steward, member, outsider }
}
const membershipId = async (p: Person, workspaceId: string) =>
  (await sql()`SELECT id FROM orbit.memberships WHERE user_id = ${p.id} AND workspace_id = ${workspaceId}`)[0]?.id as string | undefined
const roleOf = async (p: Person, workspaceId: string) =>
  ((await sql()`SELECT role FROM orbit.memberships WHERE user_id = ${p.id} AND workspace_id = ${workspaceId}`)[0]?.role ?? null) as Role | null
const ownerOf = async (workspaceId: string) => (await sql()`SELECT owner_id FROM orbit.workspaces WHERE id = ${workspaceId}`)[0]!.owner_id as string
const stored = async (id: string) => (await sql()`SELECT * FROM orbit.invitations WHERE id = ${id}`)[0]!
async function invite(by: Person, workspaceId: string, email: string, role: Role = 'member') {
  const result = await createInvitation(sql(), by.id, workspaceId, email, role)
  if (!result.ok) throw new Error(`could not invite: ${result.reason}`)
  return result.invitation
}
/** Outside orbit_app: for what only time, or a future ownership transfer, could do. */
async function asSuperuser<T>(fn: () => Promise<T>): Promise<T> {
  await sql().unsafe('RESET ROLE')
  try { return await fn() } finally { await sql().unsafe('SET ROLE orbit_app') }
}
const transferOwnership = (workspaceId: string, to: Person) =>
  asSuperuser(() => sql()`UPDATE orbit.workspaces SET owner_id = ${to.id} WHERE id = ${workspaceId}`)
const codeOf = (p: Promise<unknown>) => p.then(() => 'succeeded', (e) => e.code as string)

describe('the authority matrix', () => {
  const owner: Standing = { userId: 'o', role: 'admin', owner: true }
  const steward: Standing = { userId: 's', role: 'admin', owner: false }
  const member: Standing = { userId: 'm', role: 'member', owner: false }
  const otherSteward: Standing = { userId: 's2', role: 'admin', owner: false }
  const otherMember: Standing = { userId: 'm2', role: 'member', owner: false }

  it('says exactly who may promote, demote and remove whom', () => {
    expect(allowedActions(owner, otherMember)).toEqual(['promote', 'remove'])
    expect(allowedActions(owner, otherSteward)).toEqual(['demote', 'remove'])
    expect(allowedActions(steward, otherMember)).toEqual(['remove'])
    expect(allowedActions(steward, otherSteward)).toEqual([])
    expect(allowedActions(member, otherMember)).toEqual([])
    expect(allowedActions(member, otherSteward)).toEqual([])
    for (const actor of [owner, steward, member]) {
      expect(allowedActions(actor, owner)).toEqual([]) // nobody manages the owner
      expect(allowedActions(actor, actor)).toEqual([]) // nobody manages themselves
    }
    // Ownership comes from owner_id, not the role: an owner whose role is member is still the owner.
    expect(allowedActions({ ...owner, role: 'member' }, otherSteward)).toEqual(['demote', 'remove'])
  })

  it('says who may offer and withdraw which role', () => {
    expect([mayInvite(owner, 'admin'), mayInvite(owner, 'member')]).toEqual([true, true])
    expect([mayInvite(steward, 'admin'), mayInvite(steward, 'member')]).toEqual([false, true])
    expect([mayInvite(member, 'admin'), mayInvite(member, 'member')]).toEqual([false, false])
    expect([mayRevoke(owner, 'admin'), mayRevoke(steward, 'admin'), mayRevoke(steward, 'member'), mayRevoke(member, 'member')])
      .toEqual([true, false, true, false])
  })

  it('accepts exactly member and admin as roles, nothing guessed', () => {
    expect([parseRole('member'), parseRole('admin')]).toEqual(['member', 'admin'])
    for (const forged of ['owner', 'Owner', 'steward', 'ADMIN', 'Member', ' admin', '', null, undefined, 1, true, ['admin'], { role: 'admin' }]) {
      expect(parseRole(forged)).toBeNull()
    }
  })

  it('agrees with what the operations actually do, for every actor and target', async () => {
    for (const actorKey of ['owner', 'steward', 'member'] as const) {
      for (const targetKey of ['owner', 'steward', 'member', 'self'] as const) {
        for (const action of ['promote', 'demote', 'remove'] as const) {
          const w = await world()
          const actor = w[actorKey]
          const target = targetKey === 'self' ? actor : w[targetKey]
          const standing = async (p: Person): Promise<Standing> =>
            ({ userId: p.id, role: (await roleOf(p, w.ws.id))!, owner: (await ownerOf(w.ws.id)) === p.id })
          const expected = allowedActions(await standing(actor), await standing(target)).includes(action)
          const id = (await membershipId(target, w.ws.id))!
          const before = await roleOf(target, w.ws.id)

          const result = action === 'remove'
            ? await removeMember(sql(), actor.id, w.ws.id, id)
            : await setMemberRole(sql(), actor.id, w.ws.id, id, action === 'promote' ? 'admin' : 'member')
          // An owner "promoting" a steward or "demoting" a member asks for the role they have: a no-op.
          const noop = action !== 'remove' && before === (action === 'promote' ? 'admin' : 'member')
          const label = `${actorKey} ${action} ${targetKey}`
          if (expected) {
            expect(result.ok, label).toBe(true)
            expect(await roleOf(target, w.ws.id), label).toBe(action === 'remove' ? null : action === 'promote' ? 'admin' : 'member')
          } else if (noop && allowedActions(await standing(actor), await standing(target)).some((a) => a !== 'remove')) {
            expect(result, label).toMatchObject({ ok: true })
          } else {
            expect(result, label).toEqual({ ok: false, reason: 'forbidden' })
            expect(await roleOf(target, w.ws.id), label).toBe(before) // nothing changed
          }
          expect(await ownerOf(w.ws.id), label).toBe(w.owner.id) // ownership never moves
        }
      }
    }
  }, 60_000)
})

describe('changing roles and removing people', () => {
  it('lets the owner promote a member and demote a steward, and reports the new role', async () => {
    const { ws, owner, steward, member } = await world()
    expect(await setMemberRole(sql(), owner.id, ws.id, (await membershipId(member, ws.id))!, 'admin'))
      .toEqual({ ok: true, membershipId: await membershipId(member, ws.id), role: 'admin' })
    expect(await setMemberRole(sql(), owner.id, ws.id, (await membershipId(steward, ws.id))!, 'member')).toMatchObject({ ok: true, role: 'member' })
    expect([await roleOf(member, ws.id), await roleOf(steward, ws.id)]).toEqual(['admin', 'member'])
  })

  it('refuses forged roles, including owner, before looking anything up', async () => {
    const { ws, owner, member } = await world()
    const id = (await membershipId(member, ws.id))!
    for (const forged of ['owner', 'Owner', 'steward', 'ADMIN', '', null, 7, ['admin'], { role: 'admin' }]) {
      expect(await setMemberRole(sql(), owner.id, ws.id, id, forged)).toEqual({ ok: false, reason: 'invalid_role' })
    }
    expect(await roleOf(member, ws.id)).toBe('member')
    expect(await ownerOf(ws.id)).toBe(owner.id)
  })

  it('never lets anyone remove, demote or change the owner, including the owner themselves', async () => {
    const { ws, owner, steward } = await world()
    const ownerMembership = (await membershipId(owner, ws.id))!
    for (const actor of [owner, steward]) {
      expect(await removeMember(sql(), actor.id, ws.id, ownerMembership)).toEqual({ ok: false, reason: 'forbidden' })
      expect(await setMemberRole(sql(), actor.id, ws.id, ownerMembership, 'member')).toEqual({ ok: false, reason: 'forbidden' })
    }
    expect(await roleOf(owner, ws.id)).toBe('admin')
    expect(await ownerOf(ws.id)).toBe(owner.id)
  })

  it('finds a membership only within its own workspace: another workspace’s id is not found', async () => {
    const a = await world()
    const b = await world()
    const bMember = (await membershipId(b.member, b.ws.id))!
    expect(await removeMember(sql(), a.owner.id, a.ws.id, bMember)).toEqual({ ok: false, reason: 'not_found' })
    expect(await setMemberRole(sql(), a.owner.id, a.ws.id, bMember, 'admin')).toEqual({ ok: false, reason: 'not_found' })
    // Nor can someone act in a workspace they don't belong to, with a valid id from it.
    expect(await removeMember(sql(), a.owner.id, b.ws.id, bMember)).toEqual({ ok: false, reason: 'not_found' })
    expect(await setMemberRole(sql(), a.outsider.id, b.ws.id, bMember, 'admin')).toEqual({ ok: false, reason: 'not_found' })
    for (const id of ['not-an-id', '00000000-0000-0000-0000-000000000000']) {
      expect(await removeMember(sql(), a.owner.id, a.ws.id, id)).toEqual({ ok: false, reason: 'not_found' })
    }
    expect(await roleOf(b.member, b.ws.id)).toBe('member')
  })

  it('removes someone together with their pending invitations here, which can’t bring them back', async () => {
    const { ws, owner, steward, member } = await world()
    const pending = await invite(owner, ws.id, member.email) // an offer they hadn't answered
    const expired = await asSuperuser(async () => (await sql()`
      INSERT INTO orbit.invitations (workspace_id, email, invited_by, created_at, expires_at)
      VALUES (${ws.id}, ${member.email}, ${owner.id}, now() - interval '20 days', now() - interval '6 days') RETURNING id`)[0]!.id as string)
    const elsewhere = await world()
    const otherWorkspace = await invite(elsewhere.owner, elsewhere.ws.id, member.email) // not this workspace's

    expect(await removeMember(sql(), steward.id, ws.id, (await membershipId(member, ws.id))!)).toEqual({ ok: true, revokedInvitations: 1 })
    expect(await roleOf(member, ws.id)).toBeNull()
    const row = await stored(pending.id)
    expect([row.revoked_by, row.revoked_at instanceof Date]).toEqual([steward.id, true])
    expect((await stored(expired)).revoked_at).toBeNull() // an expired invitation is history as it is
    expect((await stored(otherWorkspace.id)).revoked_at).toBeNull()

    expect(await acceptInvitation(sql(), member.id, pending.id)).toEqual({ ok: false, reason: 'not_pending', status: 'revoked' })
    expect(await roleOf(member, ws.id)).toBeNull()
    // A new, deliberate invitation can bring them back.
    const again = await invite(owner, ws.id, member.email)
    expect(await acceptInvitation(sql(), member.id, again.id)).toMatchObject({ ok: true, joined: true, role: 'member' })
  })

  it('rolls back the revocations when the removal itself doesn’t happen', async () => {
    const { ws, owner, steward, member } = await world()
    const pending = await invite(owner, ws.id, member.email)
    const id = (await membershipId(member, ws.id))!
    // After the invitations are revoked and before the delete, the member becomes a steward, whom
    // a steward may not remove: the delete then finds nothing, and everything must roll back.
    // (Injected into the same transaction: PGlite has one session. Real concurrent sessions are
    // tested in test/concurrency.)
    const racing = new Proxy(sql(), {
      get: (target, prop, receiver) => prop !== 'begin' ? Reflect.get(target, prop, receiver)
        : (fn: (tx: typeof target) => unknown) => target.begin((tx) => fn(new Proxy(tx, {
            apply: (t, self, args) => {
              const text = Array.isArray(args[0]) && 'raw' in args[0] ? (args[0] as TemplateStringsArray).join('') : ''
              return text.includes('DELETE FROM orbit.memberships t')
                ? t`UPDATE orbit.memberships SET role = 'admin' WHERE id = ${id}`.then(() => Reflect.apply(t, self, args))
                : Reflect.apply(t, self, args)
            },
          }) as unknown as typeof target)),
    })
    expect(await removeMember(racing, steward.id, ws.id, id)).toEqual({ ok: false, reason: 'role_changed', role: 'member' })
    expect((await stored(pending.id)).revoked_at).toBeNull() // the revocation was rolled back with it
    expect(await roleOf(member, ws.id)).toBe('member') // as was everything else in that transaction
  })
})

describe('a Member the owner has offered stewardship to', () => {
  const steward: Standing = { userId: 's', role: 'admin', owner: false }
  const owner: Standing = { userId: 'o', role: 'admin', owner: true }
  const member: Standing = { userId: 'm', role: 'member', owner: false }
  const alex: Standing = { userId: 'a', role: 'member', owner: false, stewardshipOffered: true }

  it('is the owner’s decision while the offer stands: in the matrix', () => {
    expect(allowedActions(steward, alex)).toEqual([])
    expect(allowedActions(owner, alex)).toEqual(['promote', 'remove'])
    expect(blockedByStewardshipOffer(steward, alex)).toBe(true)
    expect(blockedByStewardshipOffer(owner, alex)).toBe(false) // the owner isn't blocked at all
    expect(blockedByStewardshipOffer(member, alex)).toBe(false) // a member is simply forbidden
    expect(blockedByStewardshipOffer(steward, { ...alex, role: 'admin' })).toBe(false) // stewards never remove stewards anyway
  })

  it('can’t be removed by a steward, and the owner’s offer is left exactly as it was', async () => {
    const { ws, owner: o, steward: s, member: alexP } = await world()
    const offer = await invite(o, ws.id, alexP.email, 'admin')
    expect(await removeMember(sql(), s.id, ws.id, (await membershipId(alexP, ws.id))!)).toEqual({ ok: false, reason: 'stewardship_offered' })
    expect(await roleOf(alexP, ws.id)).toBe('member')
    const row = await stored(offer.id)
    expect([row.revoked_at, row.revoked_by, row.accepted_at]).toEqual([null, null, null])
    expect(await acceptInvitation(sql(), alexP.id, offer.id)).toMatchObject({ ok: true, role: 'admin' }) // still theirs to accept
  })

  it('can be removed by the owner, whose removal withdraws the offer with everything else', async () => {
    const { ws, owner: o, member: alexP } = await world()
    const offer = await invite(o, ws.id, alexP.email, 'admin')
    expect(await removeMember(sql(), o.id, ws.id, (await membershipId(alexP, ws.id))!)).toEqual({ ok: true, revokedInvitations: 1 })
    expect(await roleOf(alexP, ws.id)).toBeNull()
    expect((await stored(offer.id)).revoked_by).toBe(o.id)
    expect(await acceptInvitation(sql(), alexP.id, offer.id)).toEqual({ ok: false, reason: 'not_pending', status: 'revoked' })
  })

  it('can be removed by a steward once the offer is withdrawn, declined or expired', async () => {
    for (const close of ['revoked', 'declined', 'expired'] as const) {
      const { ws, owner: o, steward: s, member: alexP } = await world()
      const offer = await invite(o, ws.id, alexP.email, 'admin')
      if (close === 'revoked') await revokeInvitation(sql(), o.id, offer.id)
      if (close === 'declined') await declineInvitation(sql(), alexP.id, offer.id)
      if (close === 'expired') await asSuperuser(() => sql()`UPDATE orbit.invitations SET created_at = created_at - interval '15 days', expires_at = expires_at - interval '15 days' WHERE id = ${offer.id}`)
      expect(await removeMember(sql(), s.id, ws.id, (await membershipId(alexP, ws.id))!), close).toEqual({ ok: true, revokedInvitations: 0 })
    }
  })

  it('isn’t protected by an offer whose inviter no longer owns the workspace, and a steward still never withdraws it', async () => {
    const { ws, owner: o, steward: s, member: alexP } = await world()
    const heir = await person('Heir')
    await sql()`INSERT INTO orbit.memberships (user_id, workspace_id, role) VALUES (${heir.id}, ${ws.id}, 'member')`
    const offer = await invite(o, ws.id, alexP.email, 'admin')
    await transferOwnership(ws.id, heir) // the offer no longer stands

    expect(await removeMember(sql(), s.id, ws.id, (await membershipId(alexP, ws.id))!)).toEqual({ ok: true, revokedInvitations: 0 })
    expect(await roleOf(alexP, ws.id)).toBeNull()
    expect((await stored(offer.id)).revoked_at).toBeNull() // not the steward's to withdraw; it can't be accepted anyway
    expect(await acceptInvitation(sql(), alexP.id, offer.id)).toEqual({ ok: false, reason: 'no_longer_valid' })
  })

  it('a steward’s removal still withdraws Member invitations, and only those', async () => {
    const { ws, owner: o, steward: s, member: alexP } = await world()
    const memberOffer = await invite(o, ws.id, alexP.email, 'member')
    expect(await removeMember(sql(), s.id, ws.id, (await membershipId(alexP, ws.id))!)).toEqual({ ok: true, revokedInvitations: 1 })
    expect((await stored(memberOffer.id)).revoked_by).toBe(s.id)
  })

  it('agrees with the operation for every actor', async () => {
    for (const actorKey of ['owner', 'steward', 'member'] as const) {
      const w = await world()
      await invite(w.owner, w.ws.id, w.member.email, 'admin')
      const result = await removeMember(sql(), w[actorKey].id, w.ws.id, (await membershipId(w.member, w.ws.id))!)
      const expected = { owner: { ok: true, revokedInvitations: 1 }, steward: { ok: false, reason: 'stewardship_offered' }, member: { ok: false, reason: 'forbidden' } }[actorKey]
      expect(result, actorKey).toEqual(expected)
    }
  })
})

describe('role-aware invitations', () => {
  it('lets the owner offer Steward or Member, a steward Member only, and members nothing', async () => {
    const { ws, owner, steward, member, outsider } = await world()
    expect((await createInvitation(sql(), owner.id, ws.id, 's1@example.com', 'admin'))).toMatchObject({ ok: true, invitation: { role: 'admin', acceptable: true } })
    expect((await createInvitation(sql(), owner.id, ws.id, 'm1@example.com'))).toMatchObject({ ok: true, invitation: { role: 'member' } }) // default
    expect(await createInvitation(sql(), steward.id, ws.id, 's2@example.com', 'admin')).toEqual({ ok: false, reason: 'forbidden' })
    expect((await createInvitation(sql(), steward.id, ws.id, 'm2@example.com', 'member'))).toMatchObject({ ok: true })
    expect(await createInvitation(sql(), member.id, ws.id, 'm3@example.com', 'member')).toEqual({ ok: false, reason: 'forbidden' })
    expect(await createInvitation(sql(), outsider.id, ws.id, 'm4@example.com', 'admin')).toEqual({ ok: false, reason: 'not_found' })
    expect((await sql()`SELECT email, role FROM orbit.invitations WHERE workspace_id = ${ws.id} ORDER BY email`).map((r) => `${r.email}:${r.role}`))
      .toEqual(['m1@example.com:member', 'm2@example.com:member', 's1@example.com:admin'])
  })

  it('refuses forged or invalid roles, including owner', async () => {
    const { ws, owner } = await world()
    for (const forged of ['owner', 'Owner', 'steward', 'ADMIN', '', null, 1, ['admin'], { toString: () => 'admin' }]) {
      expect(await createInvitation(sql(), owner.id, ws.id, 'forged@example.com', forged)).toEqual({ ok: false, reason: 'invalid_role' })
    }
    expect(await sql()`SELECT 1 FROM orbit.invitations WHERE workspace_id = ${ws.id}`).toHaveLength(0)
  })

  it('lets the owner revoke any pending invitation, and a steward Member invitations only', async () => {
    const { ws, owner, steward, member } = await world()
    const toSteward = await invite(owner, ws.id, 'future-steward@example.com', 'admin')
    const toMember = await invite(steward, ws.id, 'future-member@example.com')
    expect(await revokeInvitation(sql(), steward.id, toSteward.id)).toEqual({ ok: false, reason: 'forbidden' })
    expect(await revokeInvitation(sql(), member.id, toMember.id)).toEqual({ ok: false, reason: 'forbidden' })
    expect(await revokeInvitation(sql(), steward.id, toMember.id)).toMatchObject({ ok: true, invitation: { status: 'revoked', acceptable: false } })
    expect(await revokeInvitation(sql(), owner.id, toSteward.id)).toMatchObject({ ok: true, invitation: { role: 'admin', status: 'revoked' } })
  })

  it('makes a newcomer a steward, upgrades a member, and never lowers anyone', async () => {
    const { ws, owner, steward, member } = await world()
    const newcomer = await person('Newcomer')
    expect(await acceptInvitation(sql(), newcomer.id, (await invite(owner, ws.id, newcomer.email, 'admin')).id))
      .toEqual({ ok: true, workspaceId: ws.id, joined: true, role: 'admin' })
    expect(await acceptInvitation(sql(), member.id, (await invite(owner, ws.id, member.email, 'admin')).id))
      .toEqual({ ok: true, workspaceId: ws.id, joined: false, role: 'admin' }) // raised, only because they accepted
    expect(await acceptInvitation(sql(), steward.id, (await invite(owner, ws.id, steward.email, 'member')).id))
      .toEqual({ ok: true, workspaceId: ws.id, joined: false, role: 'admin' }) // never lowered
    expect(await acceptInvitation(sql(), owner.id, (await invite(owner, ws.id, owner.email, 'member')).id))
      .toEqual({ ok: true, workspaceId: ws.id, joined: false, role: 'admin' })
    expect(await ownerOf(ws.id)).toBe(owner.id) // an invitation never moves ownership
  })

  it('upgrades a member only when they accept: creating, finding, opening or declining changes nothing', async () => {
    const { ws, owner, member } = await world()
    const offer = await invite(owner, ws.id, member.email, 'admin')
    await findInvitationsFor(sql(), member.id)
    await getInvitationFor(sql(), member.id, offer.id)
    await getInvitationPreview(sql(), offer.id)
    expect(await roleOf(member, ws.id)).toBe('member')
    expect(await declineInvitation(sql(), member.id, offer.id)).toEqual({ ok: true })
    expect(await roleOf(member, ws.id)).toBe('member')
  })

  describe('after the inviter’s authority changes', () => {
    it('a Steward invitation stops being acceptable once its inviter no longer owns the workspace, keeping its facts', async () => {
      const { ws, owner, steward } = await world()
      const guest = await person('Guest')
      const offer = await invite(owner, ws.id, guest.email, 'admin')
      await transferOwnership(ws.id, steward) // stands in for a future transfer

      expect(await acceptInvitation(sql(), guest.id, offer.id)).toEqual({ ok: false, reason: 'no_longer_valid' })
      expect(await roleOf(guest, ws.id)).toBeNull() // not even as Member
      const row = await stored(offer.id)
      expect([row.role, row.accepted_at, row.revoked_at, row.invited_by]).toEqual(['admin', null, null, owner.id]) // history as it was
      expect(await getInvitationFor(sql(), guest.id, offer.id)).toMatchObject({ status: 'pending', acceptable: false, role: 'admin' })
      expect(await findInvitationsFor(sql(), guest.id)).toEqual([]) // not offered
      expect(await getInvitationPreview(sql(), offer.id)).toBeNull()
      expect((await listWorkspaceInvitations(sql(), steward.id, ws.id))).toMatchObject({ ok: true, invitations: [{ id: offer.id, status: 'pending', acceptable: false }] })
      // The recipient can still close it; the (new) owner can still withdraw such an invitation.
      const another = await invite(steward, ws.id, 'second@example.com', 'member')
      expect(another.acceptable).toBe(true)
      expect(await declineInvitation(sql(), guest.id, offer.id)).toEqual({ ok: true })
    })

    it('the new owner may withdraw a Steward invitation that no longer stands', async () => {
      const { ws, owner, steward } = await world()
      const offer = await invite(owner, ws.id, 'stale@example.com', 'admin')
      await transferOwnership(ws.id, steward)
      expect(await revokeInvitation(sql(), steward.id, offer.id)).toMatchObject({ ok: true, invitation: { status: 'revoked' } })
    })

    it('a Member invitation stays valid after its inviter is demoted or removed', async () => {
      const { ws, owner, steward } = await world()
      const first = await person('First')
      const second = await person('Second')
      const byDemoted = await invite(steward, ws.id, first.email)
      await setMemberRole(sql(), owner.id, ws.id, (await membershipId(steward, ws.id))!, 'member')
      expect(await acceptInvitation(sql(), first.id, byDemoted.id)).toMatchObject({ ok: true, role: 'member' })

      const formerSteward = await person('Former')
      await sql()`INSERT INTO orbit.memberships (user_id, workspace_id, role) VALUES (${formerSteward.id}, ${ws.id}, 'admin')`
      const byRemoved = await invite(formerSteward, ws.id, second.email)
      await removeMember(sql(), owner.id, ws.id, (await membershipId(formerSteward, ws.id))!)
      expect(await acceptInvitation(sql(), second.id, byRemoved.id)).toMatchObject({ ok: true, role: 'member' })
    })
  })
})

describe('the public preview', () => {
  it('shows only the workspace’s name and the offered role, to anyone holding the link', async () => {
    const { ws, owner } = await world()
    await sql()`UPDATE orbit.workspaces SET description = 'Private purpose' WHERE id = ${ws.id}`
    const offer = await invite(owner, ws.id, 'recipient@example.com', 'admin')
    const preview = await getInvitationPreview(sql(), offer.id)
    expect(preview).toEqual({ workspaceName: ws.name, role: 'admin' })
    const text = JSON.stringify(preview)
    for (const secret of ['recipient@example.com', owner.email, owner.id, ws.id, 'Private purpose', 'Owner']) expect(text).not.toContain(secret)
  })

  it('shows nothing for anything that can’t be accepted, all alike', async () => {
    const { ws, owner, steward } = await world()
    const guest = await person('Guest')
    const declined = await invite(owner, ws.id, guest.email); await declineInvitation(sql(), guest.id, declined.id)
    const revoked = await invite(owner, ws.id, 'r@example.com'); await revokeInvitation(sql(), owner.id, revoked.id)
    const accepted = await invite(owner, ws.id, guest.email); await acceptInvitation(sql(), guest.id, accepted.id)
    const expired = await invite(owner, ws.id, 'e@example.com')
    await asSuperuser(() => sql()`UPDATE orbit.invitations SET created_at = created_at - interval '15 days', expires_at = expires_at - interval '15 days' WHERE id = ${expired.id}`)
    const stale = await invite(owner, ws.id, 's@example.com', 'admin'); await transferOwnership(ws.id, steward)
    for (const id of [declined.id, revoked.id, accepted.id, expired.id, stale.id, '00000000-0000-0000-0000-000000000000', 'not-an-id', "'; --"]) {
      expect(await getInvitationPreview(sql(), id)).toBeNull()
    }
  })
})

describe('what the database itself refuses (migration 007)', () => {
  it('won’t let orbit_app change who owns a workspace, or whose or where a membership is', async () => {
    const { ws, owner, steward, member } = await world()
    expect(await codeOf(sql()`UPDATE orbit.workspaces SET owner_id = ${steward.id} WHERE id = ${ws.id}`)).toBe('42501')
    expect(await codeOf(sql()`UPDATE orbit.workspaces SET created_by = ${steward.id} WHERE id = ${ws.id}`)).toBe('42501')
    expect(await codeOf(sql()`UPDATE orbit.memberships SET user_id = ${steward.id} WHERE user_id = ${member.id} AND workspace_id = ${ws.id}`)).toBe('42501')
    expect(await codeOf(sql()`UPDATE orbit.memberships SET id = gen_random_uuid() WHERE user_id = ${member.id}`)).toBe('42501')
    // What the app legitimately changes still works.
    expect(await codeOf(sql()`UPDATE orbit.workspaces SET name = 'Renamed', description = 'x' WHERE id = ${ws.id}`)).toBe('succeeded')
    expect(await ownerOf(ws.id)).toBe(owner.id)
  })

  it('keeps an invitation’s offered role fixed, for orbit_app and anyone else', async () => {
    const { ws, owner } = await world()
    const offer = await invite(owner, ws.id, 'fixed@example.com')
    expect(await codeOf(sql()`UPDATE orbit.invitations SET role = 'admin' WHERE id = ${offer.id}`)).toBe('42501')
    expect(await codeOf(asSuperuser(() => sql()`UPDATE orbit.invitations SET role = 'admin' WHERE id = ${offer.id}`))).toBe('55000')
    expect(await codeOf(asSuperuser(() => sql()`INSERT INTO orbit.invitations (workspace_id, email, invited_by, role) VALUES (${ws.id}, 'o@example.com', ${owner.id}, 'owner')`))).toBe('23514')
    expect((await stored(offer.id)).role).toBe('member')
  })

  it('records a Steward acceptance only while its inviter owns the workspace, and only with stewardship', async () => {
    const { ws, owner, steward } = await world()
    const guest = await person('Guest')
    const other = await person('Other')
    // Made by a steward, as buggy code could: the database still refuses its acceptance.
    const bogus = (await sql()`INSERT INTO orbit.invitations (workspace_id, email, invited_by, role) VALUES (${ws.id}, ${guest.email}, ${steward.id}, 'admin') RETURNING id`)[0]!.id
    const acceptRaw = (id: string, who: Person, role: Role) => sql().begin(async (tx) => {
      await tx`UPDATE orbit.invitations SET accepted_at = now(), accepted_by = ${who.id} WHERE id = ${id}`
      await tx`INSERT INTO orbit.memberships (user_id, workspace_id, role) VALUES (${who.id}, ${ws.id}, ${role})`
    })
    expect(await codeOf(acceptRaw(bogus, guest, 'admin'))).toBe('23000')
    // The owner's real offer, recorded with only a plain membership: refused too.
    const real = (await invite(owner, ws.id, other.email, 'admin')).id
    expect(await codeOf(acceptRaw(real, other, 'member'))).toBe('23000')
    expect([await roleOf(guest, ws.id), await roleOf(other, ws.id)]).toEqual([null, null])
    expect([(await stored(bogus)).accepted_at, (await stored(real)).accepted_at]).toEqual([null, null])
  })

  it('gives every membership its own id, and code that never names one still works', async () => {
    const { ws } = await world()
    const ids = await sql()`SELECT id FROM orbit.memberships WHERE workspace_id = ${ws.id}`
    expect(ids).toHaveLength(3)
    expect(new Set(ids.map((r) => r.id)).size).toBe(3)
  })
})

describe('migration 007 on a database from before it (as deployed with 001–006)', () => {
  it('turns existing invitations into Member invitations, gives memberships ids, and keeps the deployed code working', async () => {
    const ids: Record<string, string> = {}
    const db = await startTestDatabase({
      upTo: '006_invitations.sql',
      prepare: async (s) => {
        for (const key of ['ada', 'grace']) ids[key] = (await s`INSERT INTO orbit.users (auth_subject, email) VALUES (${key}, ${`${key}@example.com`}) RETURNING id`)[0]!.id
        await s.begin(async (tx) => {
          ids.ws = (await tx`INSERT INTO orbit.workspaces (name, created_by, owner_id) VALUES ('Before', ${ids.ada!}, ${ids.ada!}) RETURNING id`)[0]!.id
          await tx`INSERT INTO orbit.memberships (user_id, workspace_id, role) VALUES (${ids.ada!}, ${ids.ws!}, 'admin')`
        })
        ids.invitation = (await s`INSERT INTO orbit.invitations (workspace_id, email, invited_by) VALUES (${ids.ws!}, 'grace@example.com', ${ids.ada!}) RETURNING id`)[0]!.id
      },
    })
    try {
      const before = [...await db.sql`SELECT user_id, workspace_id, role, created_at FROM orbit.memberships ORDER BY user_id`]
      const { migrate } = await import('../server/db/migrate')
      expect(await migrate(db.sql)).toEqual(['007_invitation_roles_and_membership_authority.sql'])
      expect((await db.sql`SELECT role FROM orbit.invitations WHERE id = ${ids.invitation!}`)[0]!.role).toBe('member')
      expect([...await db.sql`SELECT user_id, workspace_id, role, created_at FROM orbit.memberships ORDER BY user_id`]).toEqual(before)
      expect((await db.sql`SELECT count(*)::int AS n FROM orbit.memberships WHERE id IS NULL`)[0]!.n).toBe(0)

      // The statements the deployed application (main, with 001–006) runs, as orbit_app.
      await db.sql.unsafe('SET ROLE orbit_app')
      await db.sql.begin(async (tx) => { // createWorkspace
        const [w] = await tx`INSERT INTO orbit.workspaces (name, created_by, owner_id) VALUES ('Old code', ${ids.grace!}, ${ids.grace!}) RETURNING id, created_at`
        await tx`INSERT INTO orbit.memberships (user_id, workspace_id, role, created_at) VALUES (${ids.grace!}, ${w!.id}, 'admin', ${w!.created_at})`
      })
      await db.sql`UPDATE orbit.workspaces w SET name = 'Renamed', description = 'Still works' WHERE w.id = ${ids.ws!}` // updateWorkspace
      const [created] = await db.sql`
        WITH i AS (INSERT INTO orbit.invitations (workspace_id, email, invited_by) VALUES (${ids.ws!}, 'new@example.com', ${ids.ada!}) RETURNING *)
        SELECT i.id, i.role FROM i` // createInvitation, as deployed: no role given
      expect(created!.role).toBe('member')
      await db.sql.begin(async (tx) => { // acceptInvitation, as deployed
        await tx`UPDATE orbit.invitations i SET accepted_at = now(), accepted_by = ${ids.grace!} WHERE i.id = ${ids.invitation!}`
        await tx`INSERT INTO orbit.memberships (user_id, workspace_id, role) VALUES (${ids.grace!}, ${ids.ws!}, 'member') ON CONFLICT (user_id, workspace_id) DO NOTHING`
      })
      expect((await db.sql`SELECT role FROM orbit.memberships WHERE user_id = ${ids.grace!} AND workspace_id = ${ids.ws!}`)[0]!.role).toBe('member')
    } finally {
      await db.close()
    }
  }, 30_000)
})
