// Ownership transfer (server/utils/ownership.ts, migration 008), as orbit_app: who may transfer,
// what changes and what stays, invitations, the authority each person has afterwards, what the
// database still refuses, and rollback when anything fails partway. Concurrent sessions are
// tested in test/concurrency; the HTTP boundary in test/membership-api.test.ts.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { setName, upsertAccount } from '../server/utils/accounts'
import { SQL_MAY, type Standing, mayTransferOwnership } from '../server/utils/authority'
import { acceptInvitation, createInvitation, declineInvitation, revokeInvitation } from '../server/utils/invitations'
import { removeMember, setMemberRole } from '../server/utils/memberships'
import { transferOwnership } from '../server/utils/ownership'
import { type Role, createWorkspace, getWorkspaceDetail, listMembers } from '../server/utils/workspaces'
import { startTestDatabase } from './db'

let testDb: Awaited<ReturnType<typeof startTestDatabase>>
beforeAll(async () => { testDb = await startTestDatabase({ asApp: true }) })
afterAll(() => testDb.close())
const sql = () => testDb.sql

let n = 0
async function person(name: string) {
  const email = `${name.toLowerCase()}${++n}@example.com`
  const account = await upsertAccount(sql(), `auth-${email}`, email)
  await setName(sql(), account.id, `${name} ${n}`)
  return { id: account.id, email, name: `${name} ${n}` }
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
  const mid = async (p: Person) =>
    (await sql()`SELECT id FROM orbit.memberships WHERE user_id = ${p.id} AND workspace_id = ${ws.id}`)[0]?.id as string
  return { ws, owner, steward, member, outsider, mid }
}
const roleOf = async (p: Person, workspaceId: string) =>
  ((await sql()`SELECT role FROM orbit.memberships WHERE user_id = ${p.id} AND workspace_id = ${workspaceId}`)[0]?.role ?? null) as Role | null
const ownerOf = async (workspaceId: string) => (await sql()`SELECT owner_id FROM orbit.workspaces WHERE id = ${workspaceId}`)[0]!.owner_id as string
/** Everything a transfer could touch in a workspace, for "nothing changed" comparisons. */
const snapshot = async (workspaceId: string) => ({
  workspace: [...await sql()`SELECT * FROM orbit.workspaces WHERE id = ${workspaceId}`],
  memberships: [...await sql()`SELECT * FROM orbit.memberships WHERE workspace_id = ${workspaceId} ORDER BY id`],
  invitations: [...await sql()`SELECT * FROM orbit.invitations WHERE workspace_id = ${workspaceId} ORDER BY id`],
})
async function invite(by: Person, workspaceId: string, email: string, role: Role = 'member') {
  const result = await createInvitation(sql(), by.id, workspaceId, email, role)
  if (!result.ok) throw new Error(`could not invite: ${result.reason}`)
  return result.invitation
}
const invitation = async (id: string) =>
  (await sql()`SELECT *, (revoked_at IS NULL AND accepted_at IS NULL AND declined_at IS NULL AND expires_at > now()) AS pending FROM orbit.invitations WHERE id = ${id}`)[0]!
async function asSuperuser<T>(fn: () => Promise<T>): Promise<T> {
  await sql().unsafe('RESET ROLE')
  try { return await fn() } finally { await sql().unsafe('SET ROLE orbit_app') }
}
const codeOf = (p: Promise<unknown>) => p.then(() => 'succeeded', (e) => e.code as string)

describe('who may transfer ownership', () => {
  const owner: Standing = { userId: 'o', role: 'admin', owner: true }
  const memberOwner: Standing = { userId: 'o2', role: 'member', owner: true } // ownership isn't a role
  const steward: Standing = { userId: 's', role: 'admin', owner: false }
  const member: Standing = { userId: 'm', role: 'member', owner: false }

  it('is the owner only, to anyone else who belongs, Member or Steward', () => {
    for (const actor of [owner, memberOwner]) {
      expect(mayTransferOwnership(actor, steward)).toBe(true)
      expect(mayTransferOwnership(actor, member)).toBe(true)
      expect(mayTransferOwnership(actor, actor)).toBe(false) // not to themselves
    }
    for (const actor of [steward, member]) {
      for (const target of [owner, steward, member, { ...member, userId: 'm2' }]) expect(mayTransferOwnership(actor, target)).toBe(false)
    }
  })

  it('is decided the same way by the SQL rule that guards the writes', async () => {
    const { ws, owner, steward, member } = await world()
    const people = [owner, steward, member]
    const rows = await sql()<{ actor: string; target: string; may: boolean; actorRole: Role; actorOwner: boolean; targetRole: Role; targetOwner: boolean }[]>`
      SELECT m.user_id AS actor, t.user_id AS target, ${sql().unsafe(SQL_MAY.transfer)} AS may,
        m.role AS "actorRole", (w.owner_id = m.user_id) AS "actorOwner", t.role AS "targetRole", (w.owner_id = t.user_id) AS "targetOwner"
      FROM orbit.memberships m JOIN orbit.workspaces w ON w.id = m.workspace_id JOIN orbit.memberships t ON t.workspace_id = w.id
      WHERE w.id = ${ws.id}`
    expect(rows).toHaveLength(people.length ** 2)
    for (const r of rows) {
      const decided = mayTransferOwnership({ userId: r.actor, role: r.actorRole, owner: r.actorOwner }, { userId: r.target, role: r.targetRole, owner: r.targetOwner })
      expect(r.may, `${r.actor} → ${r.target}`).toBe(decided)
    }
    expect(rows.filter((r) => r.may).map((r) => r.target).sort()).toEqual([steward.id, member.id].sort())
  })
})

describe('transferring ownership', () => {
  for (const to of ['member', 'steward'] as const) {
    it(`to a ${to === 'member' ? 'Member' : 'Steward'}: they own it, the former owner is a Steward, and both still belong`, async () => {
      const w = await world()
      const recipient = w[to]
      const ids = { owner: await w.mid(w.owner), steward: await w.mid(w.steward), member: await w.mid(w.member) }

      expect(await transferOwnership(sql(), w.owner.id, w.ws.id, await w.mid(recipient))).toEqual({ ok: true, revokedInvitations: 0 })

      expect(await ownerOf(w.ws.id)).toBe(recipient.id)
      expect(await roleOf(w.owner, w.ws.id)).toBe('admin') // the former owner: a Steward
      expect(await roleOf(recipient, w.ws.id)).toBe(to === 'member' ? 'member' : 'admin') // the stored role is untouched
      // Belonging remains: the same memberships, with the same ids.
      expect({ owner: await w.mid(w.owner), steward: await w.mid(w.steward), member: await w.mid(w.member) }).toEqual(ids)
      expect(await sql()`SELECT 1 FROM orbit.memberships WHERE workspace_id = ${w.ws.id}`).toHaveLength(3)
    })
  }

  it('makes a former owner whose stored role was member a Steward', async () => {
    const w = await world()
    await transferOwnership(sql(), w.owner.id, w.ws.id, await w.mid(w.member)) // the member owns it, role still member
    expect(await transferOwnership(sql(), w.member.id, w.ws.id, await w.mid(w.steward))).toEqual({ ok: true, revokedInvitations: 0 })
    expect([await ownerOf(w.ws.id), await roleOf(w.member, w.ws.id)]).toEqual([w.steward.id, 'admin'])
  })

  it('gives the new owner full authority at once, and the former owner a Steward’s only', async () => {
    const w = await world()
    await transferOwnership(sql(), w.owner.id, w.ws.id, await w.mid(w.member)) // a Member becomes owner
    const newOwner = w.member
    const former = w.owner

    // What each now sees, from the authority model.
    const seenBy = async (p: Person) => Object.fromEntries((await listMembers(sql(), w.ws.id, p.id)).map((m) => [m.name, { actions: m.actions, transferable: m.transferable, owner: m.owner }]))
    expect(await seenBy(newOwner)).toEqual({
      [newOwner.name]: { actions: [], transferable: false, owner: true },
      [former.name]: { actions: ['demote', 'remove'], transferable: true, owner: false },
      [w.steward.name]: { actions: ['demote', 'remove'], transferable: true, owner: false },
    })
    expect(await seenBy(former)).toEqual({
      [former.name]: { actions: [], transferable: false, owner: false },
      [newOwner.name]: { actions: [], transferable: false, owner: true },
      [w.steward.name]: { actions: [], transferable: false, owner: false },
    })
    expect((await getWorkspaceDetail(sql(), newOwner.id, w.ws.id))!.invitationRoles).toEqual(['member', 'admin'])
    expect((await getWorkspaceDetail(sql(), former.id, w.ws.id))!).toMatchObject({ canManage: true, invitationRoles: ['member'] })

    // The former owner can no longer do what only the owner may.
    expect(await createInvitation(sql(), former.id, w.ws.id, 'x@example.com', 'admin')).toEqual({ ok: false, reason: 'forbidden' })
    expect(await transferOwnership(sql(), former.id, w.ws.id, await w.mid(w.steward))).toEqual({ ok: false, reason: 'forbidden' })
    expect(await setMemberRole(sql(), former.id, w.ws.id, await w.mid(w.steward), 'member')).toEqual({ ok: false, reason: 'forbidden' })
    // The new owner can, at once: including making the former owner a Member, then removing them.
    expect(await createInvitation(sql(), newOwner.id, w.ws.id, 'y@example.com', 'admin')).toMatchObject({ ok: true })
    expect(await setMemberRole(sql(), newOwner.id, w.ws.id, await w.mid(former), 'member')).toMatchObject({ ok: true, role: 'member' })
    expect(await removeMember(sql(), newOwner.id, w.ws.id, await w.mid(former))).toMatchObject({ ok: true })
    expect(await roleOf(former, w.ws.id)).toBeNull()
    expect(await ownerOf(w.ws.id)).toBe(newOwner.id)
  })

  it('refuses anyone but the owner, and the owner naming themselves (forbidden), changing nothing', async () => {
    const w = await world()
    const before = await snapshot(w.ws.id)
    for (const [actor, target] of [[w.steward, w.member], [w.member, w.steward], [w.steward, w.steward], [w.member, w.owner], [w.owner, w.owner]] as const) {
      expect(await transferOwnership(sql(), actor.id, w.ws.id, await w.mid(target)), `${actor.name} → ${target.name}`).toEqual({ ok: false, reason: 'forbidden' })
    }
    expect(await snapshot(w.ws.id)).toEqual(before)
  })

  it('answers not_found to outsiders and for memberships that aren’t here, confirming nothing', async () => {
    const w = await world()
    const other = await world()
    const before = await snapshot(w.ws.id)
    const cases: [Person, string, string][] = [
      [w.outsider, w.ws.id, await w.mid(w.member)], // an outsider
      [w.owner, w.ws.id, await other.mid(other.member)], // another workspace's membership
      [w.owner, other.ws.id, await other.mid(other.member)], // a workspace they don't belong to
      [w.owner, w.ws.id, '00000000-0000-0000-0000-000000000000'],
      [w.owner, w.ws.id, 'not-an-id'],
      [w.owner, 'not-an-id', await w.mid(w.member)],
      [w.owner, '00000000-0000-0000-0000-000000000000', await w.mid(w.member)],
    ]
    for (const [actor, wsId, membershipId] of cases) {
      expect(await transferOwnership(sql(), actor.id, wsId, membershipId), `${wsId} ${membershipId}`).toEqual({ ok: false, reason: 'not_found' })
    }
    expect(await snapshot(w.ws.id)).toEqual(before)
    expect(await ownerOf(other.ws.id)).toBe(other.owner.id)
  })

  it('refuses a stale second transfer, and a retry after success, from the former owner', async () => {
    const w = await world()
    expect(await transferOwnership(sql(), w.owner.id, w.ws.id, await w.mid(w.steward))).toMatchObject({ ok: true })
    expect(await transferOwnership(sql(), w.owner.id, w.ws.id, await w.mid(w.member))).toEqual({ ok: false, reason: 'forbidden' })
    expect(await transferOwnership(sql(), w.owner.id, w.ws.id, await w.mid(w.steward))).toEqual({ ok: false, reason: 'forbidden' })
    expect(await ownerOf(w.ws.id)).toBe(w.steward.id)
  })

  it('answers not_found for a recipient who has been removed', async () => {
    const w = await world()
    const gone = await w.mid(w.member)
    await removeMember(sql(), w.owner.id, w.ws.id, gone)
    expect(await transferOwnership(sql(), w.owner.id, w.ws.id, gone)).toEqual({ ok: false, reason: 'not_found' })
    expect(await ownerOf(w.ws.id)).toBe(w.owner.id)
  })
})

describe('invitations when ownership moves', () => {
  it('withdraws the former owner’s pending Steward invitations, by them, and keeps everything else as it was', async () => {
    const w = await world()
    const guest = await person('Guest')
    const toSteward = await invite(w.owner, w.ws.id, 'future-steward@example.com', 'admin')
    const toRecipient = await invite(w.owner, w.ws.id, w.member.email, 'admin') // the owner's offer of stewardship to the recipient
    const ownersMember = await invite(w.owner, w.ws.id, guest.email, 'member')
    const stewardsMember = await invite(w.steward, w.ws.id, 'by-steward@example.com', 'member')
    const declined = await invite(w.owner, w.ws.id, (await person('Dee')).email, 'admin')
    await asSuperuser(() => sql()`UPDATE orbit.invitations SET declined_at = now() WHERE id = ${declined.id}`)
    const revoked = await invite(w.owner, w.ws.id, 'withdrawn@example.com', 'admin'); await revokeInvitation(sql(), w.owner.id, revoked.id)
    const expired = await invite(w.owner, w.ws.id, 'expired@example.com', 'admin')
    await asSuperuser(() => sql()`UPDATE orbit.invitations SET created_at = created_at - interval '15 days', expires_at = expires_at - interval '15 days' WHERE id = ${expired.id}`)
    const acceptor = await person('Ace')
    const accepted = await invite(w.owner, w.ws.id, acceptor.email, 'admin'); await acceptInvitation(sql(), acceptor.id, accepted.id)
    const closed = await Promise.all([declined, revoked, expired, accepted].map((i) => invitation(i.id)))
    const kept = await Promise.all([ownersMember, stewardsMember].map((i) => invitation(i.id)))

    expect(await transferOwnership(sql(), w.owner.id, w.ws.id, await w.mid(w.member))).toEqual({ ok: true, revokedInvitations: 2 })

    for (const id of [toSteward.id, toRecipient.id]) {
      expect(await invitation(id)).toMatchObject({ revoked_by: w.owner.id, pending: false, role: 'admin', accepted_at: null, declined_at: null })
      expect((await invitation(id)).revoked_at).toBeInstanceOf(Date)
    }
    // History and Member invitations: exactly as they were.
    expect(await Promise.all([declined, revoked, expired, accepted].map((i) => invitation(i.id)))).toEqual(closed)
    expect(await Promise.all([ownersMember, stewardsMember].map((i) => invitation(i.id)))).toEqual(kept)
    // A Member invitation from the former owner can still be accepted.
    expect(await acceptInvitation(sql(), guest.id, ownersMember.id)).toEqual({ ok: true, workspaceId: w.ws.id, joined: true, role: 'member' })
  })

  it('lets the new owner invite again someone whose Steward invitation was withdrawn', async () => {
    const w = await world()
    const guest = await person('Guest')
    await invite(w.owner, w.ws.id, guest.email, 'admin')
    await transferOwnership(sql(), w.owner.id, w.ws.id, await w.mid(w.steward))
    const again = await invite(w.steward, w.ws.id, guest.email, 'admin') // not 'already_invited'
    expect(await acceptInvitation(sql(), guest.id, again.id)).toEqual({ ok: true, workspaceId: w.ws.id, joined: true, role: 'admin' })
  })

  it('withdraws only what is still pending: an invitation the recipient declined first stays declined', async () => {
    const w = await world()
    const guest = await person('Guest')
    const offer = await invite(w.owner, w.ws.id, guest.email, 'admin')
    await declineInvitation(sql(), guest.id, offer.id)
    expect(await transferOwnership(sql(), w.owner.id, w.ws.id, await w.mid(w.steward))).toEqual({ ok: true, revokedInvitations: 0 })
    expect(await invitation(offer.id)).toMatchObject({ revoked_at: null, revoked_by: null })
    expect((await invitation(offer.id)).declined_at).toBeInstanceOf(Date)
  })

  it('ends the former owner’s protection of a Member (Option C) with their offer; the new owner’s offers protect', async () => {
    const w = await world()
    const third = await person('Third')
    await sql()`INSERT INTO orbit.memberships (user_id, workspace_id, role) VALUES (${third.id}, ${w.ws.id}, 'member')`
    const thirdId = (await sql()`SELECT id FROM orbit.memberships WHERE user_id = ${third.id} AND workspace_id = ${w.ws.id}`)[0]!.id as string
    await invite(w.owner, w.ws.id, w.member.email, 'admin')
    expect(await removeMember(sql(), w.steward.id, w.ws.id, await w.mid(w.member))).toEqual({ ok: false, reason: 'stewardship_offered' })

    await transferOwnership(sql(), w.owner.id, w.ws.id, thirdId) // Third owns it now
    // The former owner's offer is withdrawn, so a steward may remove the Member...
    expect(await removeMember(sql(), w.steward.id, w.ws.id, await w.mid(w.member))).toEqual({ ok: true, revokedInvitations: 0 })
    // ...while the new owner's own offer protects, as before.
    const sam = await person('Sam')
    await sql()`INSERT INTO orbit.memberships (user_id, workspace_id, role) VALUES (${sam.id}, ${w.ws.id}, 'member')`
    await invite(third, w.ws.id, sam.email, 'admin')
    const samId = (await sql()`SELECT id FROM orbit.memberships WHERE user_id = ${sam.id} AND workspace_id = ${w.ws.id}`)[0]!.id as string
    expect(await removeMember(sql(), w.owner.id, w.ws.id, samId)).toEqual({ ok: false, reason: 'stewardship_offered' }) // the former owner, now a steward
  })
})

describe('what the database holds (migration 008)', () => {
  it('lets orbit_app write owner_id, but only to a member, never to nobody', async () => {
    const w = await world()
    // The privilege alone doesn't decide who may transfer: that is the domain's rule, carried in
    // the transfer's own statements. The database still holds the owner to membership.
    expect(await codeOf(sql()`UPDATE orbit.workspaces SET owner_id = ${w.outsider.id} WHERE id = ${w.ws.id}`)).toBe('23503')
    expect(await codeOf(sql()`UPDATE orbit.workspaces SET owner_id = NULL WHERE id = ${w.ws.id}`)).toBe('23502')
    expect(await ownerOf(w.ws.id)).toBe(w.owner.id)
  })

  it('never lets the new owner’s membership go in the same transaction', async () => {
    const w = await world()
    const attempt = sql().begin(async (tx) => {
      await tx`UPDATE orbit.workspaces SET owner_id = ${w.member.id} WHERE id = ${w.ws.id}`
      await tx`DELETE FROM orbit.memberships WHERE user_id = ${w.member.id} AND workspace_id = ${w.ws.id}`
    })
    expect(await codeOf(attempt)).toBe('23503')
    expect([await ownerOf(w.ws.id), await roleOf(w.member, w.ws.id)]).toEqual([w.owner.id, 'member'])
  })

  it('keeps created_by as history: a transfer never changes who made the workspace', async () => {
    const w = await world()
    await transferOwnership(sql(), w.owner.id, w.ws.id, await w.mid(w.member))
    expect((await sql()`SELECT created_by FROM orbit.workspaces WHERE id = ${w.ws.id}`)[0]!.created_by).toBe(w.owner.id)
  })
})

describe('a transfer that fails partway', () => {
  /** Makes one kind of statement fail inside this workspace only, as superuser, until undone. */
  async function failing(statement: string, workspaceId: string) {
    await asSuperuser(() => sql().unsafe(`
      CREATE FUNCTION public.injected_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected failure'; END $$;
      ${statement.replaceAll(':ws', `'${workspaceId}'`)}`))
    return () => asSuperuser(() => sql().unsafe('DROP FUNCTION public.injected_failure() CASCADE'))
  }

  it('after withdrawing invitations and moving owner_id: everything is rolled back', async () => {
    const w = await world()
    await invite(w.owner, w.ws.id, 'offer@example.com', 'admin')
    const before = await snapshot(w.ws.id)
    // The last write, making the former owner a Steward, fails.
    const undo = await failing(`CREATE TRIGGER injected BEFORE UPDATE OF role ON orbit.memberships FOR EACH ROW
      WHEN (NEW.workspace_id = :ws) EXECUTE FUNCTION public.injected_failure()`, w.ws.id)
    try {
      await expect(transferOwnership(sql(), w.owner.id, w.ws.id, await w.mid(w.member))).rejects.toThrow('injected failure')
    } finally { await undo() }
    expect(await snapshot(w.ws.id)).toEqual(before) // ownership, roles and invitations unchanged
    expect(await transferOwnership(sql(), w.owner.id, w.ws.id, await w.mid(w.member))).toEqual({ ok: true, revokedInvitations: 1 })
  })

  it('at commit, when the new owner no longer belongs: everything is rolled back', async () => {
    const w = await world()
    await invite(w.owner, w.ws.id, 'offer@example.com', 'admin')
    const before = await snapshot(w.ws.id)
    // Something removes the recipient's membership inside the same transaction, after ownership moved.
    const undo = await failing(`
      CREATE FUNCTION public.remove_recipient() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN DELETE FROM orbit.memberships WHERE user_id = NEW.owner_id AND workspace_id = NEW.id; RETURN NULL; END $$;
      CREATE TRIGGER injected AFTER UPDATE OF owner_id ON orbit.workspaces FOR EACH ROW
        WHEN (NEW.id = :ws) EXECUTE FUNCTION public.remove_recipient()`, w.ws.id)
    try {
      expect(await codeOf(transferOwnership(sql(), w.owner.id, w.ws.id, await w.mid(w.member)))).toBe('23503')
    } finally {
      await undo()
      await asSuperuser(() => sql().unsafe('DROP FUNCTION public.remove_recipient() CASCADE'))
    }
    expect(await snapshot(w.ws.id)).toEqual(before)
  })
})
