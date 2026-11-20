// Acceptance, removal and role changes, as truly concurrent PostgreSQL transactions
// (npm run test:concurrency; not part of npm test). The operations under test are Orbit's real
// domain functions, each in its own session as orbit_app. A controlling session ("X") holds
// specific row locks to force each order, and pg_stat_activity proves who waits for whom, so
// every scenario is reproducible rather than timing-dependent. Ownership transfer against all of
// these: ownership-concurrency.test.ts.
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { acceptInvitation, createInvitation } from '../../server/utils/invitations'
import { removeMember, setMemberRole } from '../../server/utils/memberships'
import { type Session, startPostgres } from './postgres'

let pg: Awaited<ReturnType<typeof startPostgres>>
let A: Session // accepting
let R: Session // removing
let D: Session // changing a role
let X: Session // controlling: holds row locks to force an order (superuser)
beforeAll(async () => {
  pg = await startPostgres()
  A = await pg.session('accept')
  R = await pg.session('remove')
  D = await pg.session('change role')
  X = await pg.session('control', { superuser: true })
})
afterAll(() => pg?.stop())

let k = 0
/** A fresh workspace (as superuser): owner O, steward S, member M, and a guest G with no place yet. */
async function world() {
  k++
  const db = pg.admin
  const user = async (name: string) =>
    (await db<{ id: string; email: string }[]>`INSERT INTO orbit.users (auth_subject, email) VALUES (${name + k}, ${`${name}${k}@example.com`}) RETURNING id, email`)[0]!
  const [O, S, M, G] = [await user('owner'), await user('steward'), await user('member'), await user('guest')]
  const ws = await db.begin(async (tx) => {
    const [w] = await tx<{ id: string }[]>`INSERT INTO orbit.workspaces (name, created_by, owner_id) VALUES (${'Place ' + k}, ${O.id}, ${O.id}) RETURNING id`
    await tx`INSERT INTO orbit.memberships (user_id, workspace_id, role) VALUES (${O.id}, ${w!.id}, 'admin'), (${S.id}, ${w!.id}, 'admin'), (${M.id}, ${w!.id}, 'member')`
    return w!.id
  })
  const membership = async (p: { id: string }) => (await db<{ id: string }[]>`SELECT id FROM orbit.memberships WHERE user_id = ${p.id} AND workspace_id = ${ws}`)[0]!.id
  const invite = async (to: { email: string }, by: { id: string }, role: 'member' | 'admin') =>
    (await db<{ id: string }[]>`INSERT INTO orbit.invitations (workspace_id, email, invited_by, role) VALUES (${ws}, ${to.email}, ${by.id}, ${role}) RETURNING id`)[0]!.id
  const roleOf = async (p: { id: string }) =>
    (await db<{ role: string }[]>`SELECT role FROM orbit.memberships WHERE user_id = ${p.id} AND workspace_id = ${ws}`)[0]?.role ?? 'none'
  const invitation = async (id: string) => (await db<{ status: string; revokedBy: string | null; acceptedBy: string | null }[]>`
    SELECT CASE WHEN revoked_at IS NOT NULL THEN 'revoked' WHEN accepted_at IS NOT NULL THEN 'accepted'
                WHEN declined_at IS NOT NULL THEN 'declined' ELSE 'pending' END AS status,
           revoked_by AS "revokedBy", accepted_by AS "acceptedBy"
    FROM orbit.invitations WHERE id = ${id}`)[0]!
  const ownerId = async () => (await db<{ ownerId: string }[]>`SELECT owner_id AS "ownerId" FROM orbit.workspaces WHERE id = ${ws}`)[0]!.ownerId
  return { O, S, M, G, ws, membership, invite, roleOf, invitation, ownerId }
}
/** X takes a row lock on one row, in its own open transaction, until released. */
async function hold(table: 'memberships' | 'invitations' | 'workspaces', id: string, mode = 'FOR SHARE') {
  await X.sql`BEGIN`
  await X.sql.unsafe(`SELECT 1 FROM orbit.${table} WHERE id = $1 ${mode}`, [id])
}
const release = () => X.sql`ROLLBACK`

afterEach(async () => expect(await pg.waiting()).toBe(0)) // nothing left waiting: no stuck or deadlocked sessions

describe('acceptance against removal', () => {
  it('removal first: the acceptance waits for it, then finds its invitation revoked', async () => {
    const w = await world()
    const inv = await w.invite(w.M, w.O, 'member')
    const target = await w.membership(w.M)
    await hold('memberships', target) // pauses the removal at its delete, after it has revoked

    const removing = removeMember(R.sql, w.S.id, w.ws, target)
    await pg.waitsFor(R, X)
    const accepting = acceptInvitation(A.sql, w.M.id, inv)
    await pg.waitsFor(A, R) // the acceptance waits on the invitation the removal already revoked
    await release()

    expect(await removing).toEqual({ ok: true, revokedInvitations: 1 })
    expect(await accepting).toEqual({ ok: false, reason: 'not_pending', status: 'revoked' })
    expect(await w.roleOf(w.M)).toBe('none') // not restored
    expect(await w.invitation(inv)).toMatchObject({ status: 'revoked', revokedBy: w.S.id })
  })

  it('acceptance first: the removal waits for it, then removes the person; the deferred check passes in between', async () => {
    const w = await world()
    const inv = await w.invite(w.M, w.O, 'member')
    const target = await w.membership(w.M)
    await hold('memberships', target) // pauses the acceptance at its membership write, after it has accepted

    const accepting = acceptInvitation(A.sql, w.M.id, inv)
    await pg.waitsFor(A, X)
    const removing = removeMember(R.sql, w.S.id, w.ws, target)
    await pg.waitsFor(R, A) // the removal's revoke waits on the invitation the acceptance holds
    await release()

    expect(await accepting).toEqual({ ok: true, workspaceId: w.ws, joined: false, role: 'member' })
    expect(await removing).toEqual({ ok: true, revokedInvitations: 0 }) // nothing pending left to revoke
    expect(await w.roleOf(w.M)).toBe('none') // removed after accepting, as if one came after the other
    expect(await w.invitation(inv)).toMatchObject({ status: 'accepted', acceptedBy: w.M.id }) // history kept
  })

  it('removal revokes before it deletes (regression: the reverse order would restore membership)', async () => {
    const w = await world()
    const inv = await w.invite(w.M, w.O, 'member')
    const target = await w.membership(w.M)
    await hold('invitations', inv) // stops the removal at its revoke

    const removing = removeMember(R.sql, w.S.id, w.ws, target)
    await pg.waitsFor(R, X)
    // While the removal waits at the invitations, it hasn't touched the membership yet: X can
    // lock that row outright without waiting. Had it deleted first, this would fail at once.
    await expect(X.sql`SELECT 1 FROM orbit.memberships WHERE id = ${target} FOR UPDATE NOWAIT`).resolves.toHaveLength(1)
    await release()

    expect(await removing).toEqual({ ok: true, revokedInvitations: 1 })
    expect(await w.roleOf(w.M)).toBe('none')
  })

  it('the owner removes someone while their Steward acceptance is in flight: they accept, then are removed', async () => {
    const w = await world()
    const inv = await w.invite(w.M, w.O, 'admin')
    const target = await w.membership(w.M)
    await hold('memberships', target)

    const accepting = acceptInvitation(A.sql, w.M.id, inv)
    await pg.waitsFor(A, X)
    const removing = removeMember(R.sql, w.O.id, w.ws, target)
    await pg.waitsFor(R, A)
    await release()

    expect(await accepting).toMatchObject({ ok: true, role: 'admin' })
    expect(await removing).toEqual({ ok: true, revokedInvitations: 0 })
    expect(await w.roleOf(w.M)).toBe('none')
  })

  it('the owner removes someone first: their own Steward invitation is withdrawn, and can’t bring them back', async () => {
    const w = await world()
    const inv = await w.invite(w.M, w.O, 'admin')
    const target = await w.membership(w.M)
    await hold('memberships', target)

    const removing = removeMember(R.sql, w.O.id, w.ws, target)
    await pg.waitsFor(R, X) // has withdrawn the invitation, waits to delete
    const accepting = acceptInvitation(A.sql, w.M.id, inv)
    await pg.waitsFor(A, R)
    await release()

    expect(await removing).toEqual({ ok: true, revokedInvitations: 1 })
    expect(await accepting).toEqual({ ok: false, reason: 'not_pending', status: 'revoked' })
    expect(await w.roleOf(w.M)).toBe('none')
    expect(await w.invitation(inv)).toMatchObject({ status: 'revoked', revokedBy: w.O.id })
  })

  it('an invitation accepted before the removal stays accepted; the removed person can’t reuse it', async () => {
    const w = await world()
    const inv = await w.invite(w.M, w.O, 'member')
    expect(await acceptInvitation(A.sql, w.M.id, inv)).toMatchObject({ ok: true, joined: false })
    expect(await removeMember(R.sql, w.S.id, w.ws, await w.membership(w.M))).toEqual({ ok: true, revokedInvitations: 0 })
    expect(await acceptInvitation(A.sql, w.M.id, inv)).toEqual({ ok: false, reason: 'not_pending', status: 'accepted' })
    expect(await w.roleOf(w.M)).toBe('none')
  })
})

describe('a steward removing a Member the owner has offered stewardship to', () => {
  it('while the member is accepting the offer: refused at once, without waiting; the acceptance completes', async () => {
    const w = await world()
    const inv = await w.invite(w.M, w.O, 'admin')
    const target = await w.membership(w.M)
    await hold('memberships', target) // the acceptance has recorded itself, and is not yet committed

    const accepting = acceptInvitation(A.sql, w.M.id, inv)
    await pg.waitsFor(A, X)
    // The offer is still pending in every committed view, so the steward's removal is refused
    // before it writes anything (and so never waits for the acceptance).
    expect(await removeMember(R.sql, w.S.id, w.ws, target)).toEqual({ ok: false, reason: 'stewardship_offered' })
    await release()

    expect(await accepting).toEqual({ ok: true, workspaceId: w.ws, joined: false, role: 'admin' })
    expect(await w.roleOf(w.M)).toBe('admin')
    expect(await w.invitation(inv)).toMatchObject({ status: 'accepted', revokedBy: null })
  })

  it('removal started first, acceptance committed before it decides: the member is now a steward, so refused', async () => {
    const w = await world()
    const inv = await w.invite(w.M, w.O, 'admin')
    const target = await w.membership(w.M)
    await hold('memberships', await w.membership(w.S), 'FOR UPDATE') // pauses the removal at its first lock

    const removing = removeMember(R.sql, w.S.id, w.ws, target)
    await pg.waitsFor(R, X)
    expect(await acceptInvitation(A.sql, w.M.id, inv)).toMatchObject({ ok: true, role: 'admin' })
    await release()

    expect(await removing).toEqual({ ok: false, reason: 'forbidden' }) // a steward never removes a steward
    expect(await w.roleOf(w.M)).toBe('admin')
  })

  it('offer made first: refused, and the offer is untouched', async () => {
    const w = await world()
    const offer = await createInvitation(D.sql, w.O.id, w.ws, w.M.email, 'admin')
    expect(offer).toMatchObject({ ok: true })
    expect(await removeMember(R.sql, w.S.id, w.ws, await w.membership(w.M))).toEqual({ ok: false, reason: 'stewardship_offered' })
    expect(await w.roleOf(w.M)).toBe('member')
    expect(await w.invitation((offer as { invitation: { id: string } }).invitation.id)).toMatchObject({ status: 'pending', revokedBy: null })
  })

  it('removal started first, but the offer committed before the removal decided: refused (each statement sees what has committed)', async () => {
    const w = await world()
    const target = await w.membership(w.M)
    await hold('memberships', await w.membership(w.S), 'FOR UPDATE') // pauses the removal before it reads anything

    const removing = removeMember(R.sql, w.S.id, w.ws, target)
    await pg.waitsFor(R, X)
    const offer = await createInvitation(D.sql, w.O.id, w.ws, w.M.email, 'admin') // doesn't wait for the removal
    expect(offer).toMatchObject({ ok: true })
    await release()

    expect(await removing).toEqual({ ok: false, reason: 'stewardship_offered' })
    expect(await w.roleOf(w.M)).toBe('member')
    expect(await w.invitation((offer as { invitation: { id: string } }).invitation.id)).toMatchObject({ status: 'pending', revokedBy: null })
  })

  it('offer committed between the removal’s check and its writes: the writes refuse it themselves, and roll back', async () => {
    const w = await world()
    const target = await w.membership(w.M)
    let offerId = ''
    // The removal runs unchanged in its own session; only its first write is held back until the
    // owner's offer (in another session) has committed. Its check had already said yes.
    const heldBack = new Proxy(R.sql, {
      get: (sql, prop, receiver) => prop !== 'begin' ? Reflect.get(sql, prop, receiver)
        : (fn: (tx: typeof sql) => unknown) => sql.begin((tx) => fn(new Proxy(tx, {
            apply: async (t, self, args) => {
              const text = Array.isArray(args[0]) && 'raw' in args[0] ? (args[0] as TemplateStringsArray).join('') : ''
              if (text.includes('UPDATE orbit.invitations i SET revoked_at') && !offerId) {
                const offer = await createInvitation(D.sql, w.O.id, w.ws, w.M.email, 'admin')
                offerId = (offer as { invitation: { id: string } }).invitation.id
              }
              return Reflect.apply(t, self, args)
            },
          }) as unknown as typeof sql)),
    })

    expect(await removeMember(heldBack, w.S.id, w.ws, target)).toEqual({ ok: false, reason: 'stewardship_offered' })
    expect(offerId).not.toBe('')
    expect(await w.roleOf(w.M)).toBe('member')
    expect(await w.invitation(offerId)).toMatchObject({ status: 'pending', revokedBy: null })
  })

  it('removal already deleting when the offer commits: the removal stands, and the owner’s later offer stays open to them', async () => {
    const w = await world()
    const target = await w.membership(w.M)
    await hold('memberships', target) // the removal is past its checks and its revoke, waiting to delete

    const removing = removeMember(R.sql, w.S.id, w.ws, target)
    await pg.waitsFor(R, X)
    const offer = await createInvitation(D.sql, w.O.id, w.ws, w.M.email, 'admin') // commits while the delete waits
    expect(offer).toMatchObject({ ok: true })
    await release()

    // Under READ COMMITTED the delete keeps the snapshot it started with, from before the offer
    // existed; and the row it waited for was locked, not changed, so nothing is re-checked. The
    // outcome is the serial order "removal, then offer": Alex is removed, and the owner's offer,
    // made to someone no longer a member, stays open. It was never the steward's to close.
    expect(await removing).toEqual({ ok: true, revokedInvitations: 0 })
    expect(await w.roleOf(w.M)).toBe('none')
    const id = (offer as { invitation: { id: string } }).invitation.id
    expect(await w.invitation(id)).toMatchObject({ status: 'pending', revokedBy: null })
    expect(await acceptInvitation(A.sql, w.M.id, id)).toEqual({ ok: true, workspaceId: w.ws, joined: true, role: 'admin' })
  })
})

describe('authority changing while it is used', () => {
  it('a steward demoted just before acting: the removal waits for the demotion, then is refused', async () => {
    const w = await world()
    const stewardMembership = await w.membership(w.S)
    // The owner's demotion, in flight (uncommitted).
    await D.sql`BEGIN`
    await D.sql`UPDATE orbit.memberships SET role = 'member' WHERE id = ${stewardMembership}`

    const removing = removeMember(R.sql, w.S.id, w.ws, await w.membership(w.M))
    await pg.waitsFor(R, D) // locking the steward's own standing waits for the change to it
    await D.sql`COMMIT`

    expect(await removing).toEqual({ ok: false, reason: 'forbidden' })
    expect(await w.roleOf(w.M)).toBe('member')
  })

  it('a steward acting first keeps their authority until done; the owner’s demotion waits', async () => {
    const w = await world()
    const inv = await w.invite(w.M, w.S, 'member')
    await hold('invitations', inv) // pauses the removal mid-way, holding the steward's standing

    const removing = removeMember(R.sql, w.S.id, w.ws, await w.membership(w.M))
    await pg.waitsFor(R, X)
    const demoting = setMemberRole(D.sql, w.O.id, w.ws, await w.membership(w.S), 'member')
    await pg.waitsFor(D, R)
    await release()

    expect(await removing).toEqual({ ok: true, revokedInvitations: 1 })
    expect(await demoting).toMatchObject({ ok: true, role: 'member' })
    expect([await w.roleOf(w.M), await w.roleOf(w.S)]).toEqual(['none', 'member'])
  })
})

describe('a Steward invitation against a bare change of owner_id (bypassing the transfer, which would also withdraw it; as superuser)', () => {
  it('ownership changes first: the acceptance waits, then the offer no longer stands', async () => {
    const w = await world()
    const inv = await w.invite(w.G, w.O, 'admin')
    await X.sql`BEGIN`
    await X.sql`UPDATE orbit.workspaces SET owner_id = ${w.S.id} WHERE id = ${w.ws}`

    const accepting = acceptInvitation(A.sql, w.G.id, inv)
    await pg.waitsFor(A, X) // the acceptance's workspace lock waits for the change
    await X.sql`COMMIT`

    expect(await accepting).toEqual({ ok: false, reason: 'no_longer_valid' })
    expect(await w.roleOf(w.G)).toBe('none')
    expect(await w.invitation(inv)).toMatchObject({ status: 'pending' }) // facts kept, not turned into a Member invitation
  })
})
