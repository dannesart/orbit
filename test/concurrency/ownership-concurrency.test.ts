// Ownership transfer against everything that could happen at the same time, as truly concurrent
// PostgreSQL transactions (npm run test:concurrency). Every operation is Orbit's real domain
// function in its own session as orbit_app. A controlling superuser session ("X") holds one row
// lock to pause an operation at a chosen point, and pg_stat_activity proves who waits for whom,
// so each order is forced, not hoped for. Two pause points for the transfer:
//   - at its revocations: X holds one of the owner's pending Steward invitations, so the
//     transfer stops having locked the owner's membership and the workspace;
//   - at commit: X holds the recipient's membership FOR UPDATE, so the transfer runs every
//     statement and then waits in the deferred owner-membership check (FOR KEY SHARE).
// After every scenario nothing is left waiting: no stuck or deadlocked sessions.
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { acceptInvitation, createInvitation, declineInvitation, revokeInvitation } from '../../server/utils/invitations'
import { removeMember, setMemberRole } from '../../server/utils/memberships'
import { transferOwnership } from '../../server/utils/ownership'
import { type Session, startPostgres } from './postgres'

let pg: Awaited<ReturnType<typeof startPostgres>>
let P: Session // transferring
let P2: Session // a second transfer
let A: Session // accepting
let R: Session // removing
let D: Session // changing a role
let I: Session // inviting, or withdrawing an invitation
let C: Session // declining
let X: Session // controlling: holds row locks to force an order (superuser)
beforeAll(async () => {
  pg = await startPostgres()
  ;[P, P2, A, R, D, I, C] = await Promise.all(['transfer', 'second transfer', 'accept', 'remove', 'change role', 'invite', 'decline'].map((name) => pg.session(name)))
  X = await pg.session('control', { superuser: true })
})
afterAll(() => pg?.stop())
afterEach(async () => expect(await pg.waiting()).toBe(0))

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
  const invite = async (to: string, by: { id: string }, role: 'member' | 'admin') =>
    (await db<{ id: string }[]>`INSERT INTO orbit.invitations (workspace_id, email, invited_by, role) VALUES (${ws}, ${to}, ${by.id}, ${role}) RETURNING id`)[0]!.id
  const roleOf = async (p: { id: string }) =>
    (await db<{ role: string }[]>`SELECT role FROM orbit.memberships WHERE user_id = ${p.id} AND workspace_id = ${ws}`)[0]?.role ?? 'none'
  const invitation = async (id: string) => (await db<{ status: string; revokedBy: string | null }[]>`
    SELECT CASE WHEN revoked_at IS NOT NULL THEN 'revoked' WHEN accepted_at IS NOT NULL THEN 'accepted'
                WHEN declined_at IS NOT NULL THEN 'declined' ELSE 'pending' END AS status, revoked_by AS "revokedBy"
    FROM orbit.invitations WHERE id = ${id}`)[0]!
  const ownerId = async () => (await db<{ ownerId: string }[]>`SELECT owner_id AS "ownerId" FROM orbit.workspaces WHERE id = ${ws}`)[0]!.ownerId
  /** Owner and every role, in one comparable value. */
  const state = async () => ({ owner: await ownerId(), O: await roleOf(O), S: await roleOf(S), M: await roleOf(M), G: await roleOf(G) })
  return { O, S, M, G, ws, membership, invite, roleOf, invitation, ownerId, state }
}
type World = Awaited<ReturnType<typeof world>>

/** X takes a row lock on one row, in its own open transaction, until released. */
async function hold(table: 'memberships' | 'invitations', id: string, mode = 'FOR SHARE') {
  await X.sql`BEGIN`
  await X.sql.unsafe(`SELECT 1 FROM orbit.${table} WHERE id = $1 ${mode}`, [id])
}
const release = () => X.sql`ROLLBACK`
/** Pauses the transfer at its revocations: X holds one of the owner's pending Steward invitations. */
async function pauseAtRevocations(w: World) {
  await hold('invitations', await w.invite(`pause${k}@example.com`, w.O, 'admin'))
}
/** Pauses the transfer at commit, every statement done: X holds the recipient's membership. */
async function pauseAtCommit(recipientMembershipId: string) {
  await hold('memberships', recipientMembershipId, 'FOR UPDATE')
}
const codeOf = (p: Promise<unknown>) => p.then(() => 'succeeded', (e) => e.code as string)

describe('two transfers at once', () => {
  it('the second waits, then finds its actor no longer owns the workspace: exactly one transfer happens', async () => {
    const w = await world()
    await pauseAtRevocations(w)
    const first = transferOwnership(P.sql, w.O.id, w.ws, await w.membership(w.S))
    await pg.waitsFor(P, X)
    const second = transferOwnership(P2.sql, w.O.id, w.ws, await w.membership(w.M))
    await pg.waitsFor(P2, P) // waits on the owner's membership, held by the first
    await release()

    expect(await first).toEqual({ ok: true, revokedInvitations: 1 })
    expect(await second).toEqual({ ok: false, reason: 'forbidden' })
    expect(await w.state()).toEqual({ owner: w.S.id, O: 'admin', S: 'admin', M: 'member', G: 'none' })
  })
})

describe('the recipient removed at the same time', () => {
  it('removal first: the transfer waits, then finds no one to hand ownership to', async () => {
    const w = await world()
    await hold('invitations', await w.invite(w.M.email, w.S, 'member')) // pauses the steward's removal of M mid-way
    const removing = removeMember(R.sql, w.S.id, w.ws, await w.membership(w.M))
    await pg.waitsFor(R, X)
    const transferring = transferOwnership(P.sql, w.O.id, w.ws, await w.membership(w.M))
    await pg.waitsFor(P, R) // the workspace row, shared by the removal
    await release()

    expect(await removing).toEqual({ ok: true, revokedInvitations: 1 })
    expect(await transferring).toEqual({ ok: false, reason: 'not_found' })
    expect(await w.state()).toEqual({ owner: w.O.id, O: 'admin', S: 'admin', M: 'none', G: 'none' })
  })

  it('transfer first: the removal waits, then finds the owner, whom nobody removes', async () => {
    const w = await world()
    await pauseAtCommit(await w.membership(w.M))
    const transferring = transferOwnership(P.sql, w.O.id, w.ws, await w.membership(w.M))
    await pg.waitsFor(P, X)
    const removing = removeMember(R.sql, w.S.id, w.ws, await w.membership(w.M))
    await pg.waitsFor(R, P)
    await release()

    expect(await transferring).toEqual({ ok: true, revokedInvitations: 0 })
    expect(await removing).toEqual({ ok: false, reason: 'forbidden' })
    expect(await w.state()).toEqual({ owner: w.M.id, O: 'admin', S: 'admin', M: 'member', G: 'none' })
  })
})

describe('roles changing at the same time (the former owner, from another tab)', () => {
  it('transfer first: the former owner’s demotion of the recipient waits, then is refused', async () => {
    const w = await world()
    await pauseAtCommit(await w.membership(w.S))
    const transferring = transferOwnership(P.sql, w.O.id, w.ws, await w.membership(w.S))
    await pg.waitsFor(P, X)
    const demoting = setMemberRole(D.sql, w.O.id, w.ws, await w.membership(w.S), 'member')
    await pg.waitsFor(D, P) // the owner's own membership, held exclusively by the transfer
    await release()

    expect(await transferring).toEqual({ ok: true, revokedInvitations: 0 })
    expect(await demoting).toEqual({ ok: false, reason: 'forbidden' })
    expect(await w.state()).toEqual({ owner: w.S.id, O: 'admin', S: 'admin', M: 'member', G: 'none' })
  })

  it('the former owner acting from another tab while the transfer is mid-way: it waits at their own membership, so no deadlock; then acts as a Steward', async () => {
    // Regression for the lock order: had the transfer locked the workspace before the owner's
    // membership, this action would take the owner's membership FOR SHARE and wait for the
    // workspace, and the transfer's later change to the owner's role would wait for it: a cycle.
    const w = await world()
    await pauseAtRevocations(w)
    const transferring = transferOwnership(P.sql, w.O.id, w.ws, await w.membership(w.M))
    await pg.waitsFor(P, X)
    const inviting = createInvitation(I.sql, w.O.id, w.ws, w.G.email, 'member')
    await pg.waitsFor(I, P)
    await release()

    expect(await transferring).toEqual({ ok: true, revokedInvitations: 1 })
    expect(await inviting).toMatchObject({ ok: true, invitation: { role: 'member' } }) // a Steward may invite Members
    expect(await w.state()).toEqual({ owner: w.M.id, O: 'admin', S: 'admin', M: 'member', G: 'none' })
  })

  it('demotion first: the transfer waits, then hands ownership to the now-Member, whose role it leaves alone', async () => {
    const w = await world()
    await hold('memberships', await w.membership(w.S)) // pauses the demotion at its write
    const demoting = setMemberRole(D.sql, w.O.id, w.ws, await w.membership(w.S), 'member')
    await pg.waitsFor(D, X)
    const transferring = transferOwnership(P.sql, w.O.id, w.ws, await w.membership(w.S))
    await pg.waitsFor(P, D)
    await release()

    expect(await demoting).toMatchObject({ ok: true, role: 'member' })
    expect(await transferring).toEqual({ ok: true, revokedInvitations: 0 })
    expect(await w.state()).toEqual({ owner: w.S.id, O: 'admin', S: 'member', M: 'member', G: 'none' })
  })
})

describe('a Steward invitation accepted at the same time', () => {
  it('transfer first: the acceptance waits, then finds the former owner’s offer withdrawn', async () => {
    const w = await world()
    const offer = await w.invite(w.G.email, w.O, 'admin')
    await pauseAtRevocations(w)
    const transferring = transferOwnership(P.sql, w.O.id, w.ws, await w.membership(w.S))
    await pg.waitsFor(P, X)
    const accepting = acceptInvitation(A.sql, w.G.id, offer)
    await pg.waitsFor(A, P) // the acceptance locks the workspace first
    await release()

    expect(await transferring).toEqual({ ok: true, revokedInvitations: 2 })
    expect(await accepting).toEqual({ ok: false, reason: 'not_pending', status: 'revoked' })
    expect(await w.invitation(offer)).toEqual({ status: 'revoked', revokedBy: w.O.id })
    expect((await w.state()).G).toBe('none')
  })

  it('acceptance first: the transfer waits; the offer was the owner’s when accepted, so the guest is a Steward', async () => {
    const w = await world()
    const offer = await w.invite(w.G.email, w.O, 'admin')
    await hold('invitations', offer) // pauses the acceptance after it locked the workspace
    const accepting = acceptInvitation(A.sql, w.G.id, offer)
    await pg.waitsFor(A, X)
    const transferring = transferOwnership(P.sql, w.O.id, w.ws, await w.membership(w.S))
    await pg.waitsFor(P, A)
    await release()

    expect(await accepting).toEqual({ ok: true, workspaceId: w.ws, joined: true, role: 'admin' })
    expect(await transferring).toEqual({ ok: true, revokedInvitations: 0 })
    expect(await w.state()).toEqual({ owner: w.S.id, O: 'admin', S: 'admin', M: 'member', G: 'admin' })
  })

  it('the recipient accepting the owner’s offer of stewardship, transfer first: the offer is withdrawn; they own it as a Member', async () => {
    const w = await world()
    const offer = await w.invite(w.M.email, w.O, 'admin')
    await pauseAtCommit(await w.membership(w.M))
    const transferring = transferOwnership(P.sql, w.O.id, w.ws, await w.membership(w.M))
    await pg.waitsFor(P, X)
    const accepting = acceptInvitation(A.sql, w.M.id, offer)
    await pg.waitsFor(A, P)
    await release()

    expect(await transferring).toEqual({ ok: true, revokedInvitations: 1 })
    expect(await accepting).toEqual({ ok: false, reason: 'not_pending', status: 'revoked' })
    expect(await w.state()).toEqual({ owner: w.M.id, O: 'admin', S: 'admin', M: 'member', G: 'none' })
  })

  it('the recipient accepting the owner’s offer of stewardship, acceptance first: a Steward, then the owner', async () => {
    const w = await world()
    const offer = await w.invite(w.M.email, w.O, 'admin')
    await hold('invitations', offer)
    const accepting = acceptInvitation(A.sql, w.M.id, offer)
    await pg.waitsFor(A, X)
    const transferring = transferOwnership(P.sql, w.O.id, w.ws, await w.membership(w.M))
    await pg.waitsFor(P, A)
    await release()

    expect(await accepting).toEqual({ ok: true, workspaceId: w.ws, joined: false, role: 'admin' })
    expect(await transferring).toEqual({ ok: true, revokedInvitations: 0 })
    expect(await w.state()).toEqual({ owner: w.M.id, O: 'admin', S: 'admin', M: 'admin', G: 'none' })
  })
})

describe('an invitation declined at the same time', () => {
  it('decline first: the transfer waits for it, then leaves the declined invitation as it is', async () => {
    const w = await world()
    const offer = await w.invite(w.G.email, w.O, 'admin')
    await C.sql`BEGIN` // the decline, in flight (uncommitted)
    expect(await declineInvitation(C.sql, w.G.id, offer)).toEqual({ ok: true })
    const transferring = transferOwnership(P.sql, w.O.id, w.ws, await w.membership(w.S))
    await pg.waitsFor(P, C) // the revocation waits on the invitation being declined
    await C.sql`COMMIT`

    expect(await transferring).toEqual({ ok: true, revokedInvitations: 0 })
    expect(await w.invitation(offer)).toEqual({ status: 'declined', revokedBy: null })
  })

  it('transfer first: the decline waits, then finds the invitation already withdrawn', async () => {
    const w = await world()
    const offer = await w.invite(w.G.email, w.O, 'admin')
    await pauseAtCommit(await w.membership(w.S))
    const transferring = transferOwnership(P.sql, w.O.id, w.ws, await w.membership(w.S))
    await pg.waitsFor(P, X)
    const declining = declineInvitation(C.sql, w.G.id, offer)
    await pg.waitsFor(C, P)
    await release()

    expect(await transferring).toEqual({ ok: true, revokedInvitations: 1 })
    expect(await declining).toEqual({ ok: false, reason: 'not_pending', status: 'revoked' })
    expect(await w.invitation(offer)).toEqual({ status: 'revoked', revokedBy: w.O.id })
  })
})

describe('invitations made or withdrawn at the same time', () => {
  it('the owner offering stewardship from another tab, transfer first: refused, they no longer own it', async () => {
    const w = await world()
    await pauseAtCommit(await w.membership(w.S))
    const transferring = transferOwnership(P.sql, w.O.id, w.ws, await w.membership(w.S))
    await pg.waitsFor(P, X)
    const inviting = createInvitation(I.sql, w.O.id, w.ws, w.G.email, 'admin')
    await pg.waitsFor(I, P)
    await release()

    expect(await transferring).toEqual({ ok: true, revokedInvitations: 0 })
    expect(await inviting).toEqual({ ok: false, reason: 'forbidden' })
    expect(await pg.admin`SELECT 1 FROM orbit.invitations WHERE workspace_id = ${w.ws}`).toHaveLength(0)
  })

  it('the owner offering stewardship first: the transfer waits, then withdraws that offer too', async () => {
    const w = await world()
    // An uncommitted invitation to the same address makes the owner's INSERT wait (one open per address).
    await X.sql`BEGIN`
    await X.sql`INSERT INTO orbit.invitations (workspace_id, email, invited_by, role) VALUES (${w.ws}, ${w.G.email}, ${w.S.id}, 'member')`
    const inviting = createInvitation(I.sql, w.O.id, w.ws, w.G.email, 'admin')
    await pg.waitsFor(I, X)
    const transferring = transferOwnership(P.sql, w.O.id, w.ws, await w.membership(w.S))
    await pg.waitsFor(P, I)
    await release() // the blocking invitation never existed

    const made = await inviting
    expect(made).toMatchObject({ ok: true, invitation: { role: 'admin' } })
    expect(await transferring).toEqual({ ok: true, revokedInvitations: 1 })
    expect(await w.invitation((made as { invitation: { id: string } }).invitation.id)).toEqual({ status: 'revoked', revokedBy: w.O.id })
  })

  it('a steward withdrawing a Member invitation first: it completes; the transfer waits, then keeps it withdrawn', async () => {
    const w = await world()
    const memberInvite = await w.invite(w.G.email, w.O, 'member')
    await hold('invitations', memberInvite) // pauses the withdrawal at its write
    const withdrawing = revokeInvitation(I.sql, w.S.id, memberInvite)
    await pg.waitsFor(I, X)
    const transferring = transferOwnership(P.sql, w.O.id, w.ws, await w.membership(w.M))
    await pg.waitsFor(P, I)
    await release()

    expect(await withdrawing).toMatchObject({ ok: true })
    expect(await transferring).toEqual({ ok: true, revokedInvitations: 0 })
    expect(await w.invitation(memberInvite)).toEqual({ status: 'revoked', revokedBy: w.S.id })
  })

  it('transfer first: a steward’s withdrawal of a Member invitation waits, then completes', async () => {
    const w = await world()
    const memberInvite = await w.invite(w.G.email, w.O, 'member')
    await pauseAtCommit(await w.membership(w.M))
    const transferring = transferOwnership(P.sql, w.O.id, w.ws, await w.membership(w.M))
    await pg.waitsFor(P, X)
    const withdrawing = revokeInvitation(I.sql, w.S.id, memberInvite)
    await pg.waitsFor(I, P)
    await release()

    expect(await transferring).toEqual({ ok: true, revokedInvitations: 0 }) // a Member invitation stays
    expect(await withdrawing).toMatchObject({ ok: true })
    expect(await w.invitation(memberInvite)).toEqual({ status: 'revoked', revokedBy: w.S.id })
  })
})

describe('Option C: a steward removing a Member the owner has offered stewardship to', () => {
  it('refused while the offer is the owner’s; once ownership moves (the steward waiting meanwhile), the offer is withdrawn and removal proceeds', async () => {
    const w = await world()
    await w.invite(w.M.email, w.O, 'admin')
    expect(await removeMember(R.sql, w.S.id, w.ws, await w.membership(w.M))).toEqual({ ok: false, reason: 'stewardship_offered' })

    const third = (await pg.admin<{ id: string }[]>`INSERT INTO orbit.users (auth_subject, email) VALUES (${'third' + k}, ${`third${k}@example.com`}) RETURNING id`)[0]!
    await pg.admin`INSERT INTO orbit.memberships (user_id, workspace_id, role) VALUES (${third.id}, ${w.ws}, 'member')`
    await pauseAtCommit(await w.membership(third))
    const transferring = transferOwnership(P.sql, w.O.id, w.ws, await w.membership(third))
    await pg.waitsFor(P, X)
    const removing = removeMember(R.sql, w.S.id, w.ws, await w.membership(w.M))
    await pg.waitsFor(R, P)
    await release()

    expect(await transferring).toEqual({ ok: true, revokedInvitations: 1 })
    expect(await removing).toEqual({ ok: true, revokedInvitations: 0 })
    expect([await w.ownerId(), await w.roleOf(w.M)]).toEqual([third.id, 'none'])
  })
})

describe('the recipient acting as a Steward during the transfer (lock order)', () => {
  it('recipient first: their removal holds its standing; the transfer waits, then completes', async () => {
    const w = await world()
    await hold('invitations', await w.invite(w.M.email, w.S, 'member')) // pauses S's removal of M mid-way
    const removing = removeMember(R.sql, w.S.id, w.ws, await w.membership(w.M))
    await pg.waitsFor(R, X)
    const transferring = transferOwnership(P.sql, w.O.id, w.ws, await w.membership(w.S))
    await pg.waitsFor(P, R)
    await release()

    expect(await removing).toEqual({ ok: true, revokedInvitations: 1 })
    expect(await transferring).toEqual({ ok: true, revokedInvitations: 0 })
    expect(await w.state()).toEqual({ owner: w.S.id, O: 'admin', S: 'admin', M: 'none', G: 'none' })
  })

  it('transfer first: the recipient’s action holds their own membership while waiting; the transfer still commits (no deadlock), then they act as owner', async () => {
    const w = await world()
    await pauseAtRevocations(w)
    const transferring = transferOwnership(P.sql, w.O.id, w.ws, await w.membership(w.S))
    await pg.waitsFor(P, X)
    const inviting = createInvitation(I.sql, w.S.id, w.ws, w.G.email, 'admin') // a Steward offer: only an owner's
    await pg.waitsFor(I, P) // holding S's own membership FOR SHARE, waiting for the workspace
    await release()

    expect(await transferring).toEqual({ ok: true, revokedInvitations: 1 })
    expect(await inviting).toMatchObject({ ok: true, invitation: { role: 'admin' } }) // decided after the transfer: S owns it
    expect(await w.state()).toEqual({ owner: w.S.id, O: 'admin', S: 'admin', M: 'member', G: 'none' })
  })
})

describe('a transfer that fails partway, with others waiting on it', () => {
  it('rolls back whole; the waiting acceptance then proceeds against the unchanged owner', async () => {
    const w = await world()
    const offer = await w.invite(w.G.email, w.O, 'admin')
    const pause = await w.invite(`pause${k}@example.com`, w.O, 'admin')
    await pg.admin.unsafe(`
      CREATE FUNCTION public.injected_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected failure'; END $$;
      CREATE TRIGGER injected BEFORE UPDATE OF role ON orbit.memberships FOR EACH ROW
        WHEN (NEW.workspace_id = '${w.ws}') EXECUTE FUNCTION public.injected_failure()`)
    try {
      await hold('invitations', pause)
      const transferring = transferOwnership(P.sql, w.O.id, w.ws, await w.membership(w.S)).then(() => 'succeeded', (e: Error) => e.message)
      await pg.waitsFor(P, X)
      const accepting = acceptInvitation(A.sql, w.G.id, offer)
      await pg.waitsFor(A, P)
      await release() // the transfer revokes, moves owner_id, then fails making O a Steward

      expect(await transferring).toBe('injected failure')
      expect(await accepting).toEqual({ ok: true, workspaceId: w.ws, joined: true, role: 'admin' }) // O still owns it
    } finally {
      await pg.admin.unsafe('DROP FUNCTION public.injected_failure() CASCADE')
    }
    expect(await w.state()).toEqual({ owner: w.O.id, O: 'admin', S: 'admin', M: 'member', G: 'admin' })
    expect(await w.invitation(pause)).toEqual({ status: 'pending', revokedBy: null })
  })
})

describe('a known edge: the owner accepting an invitation to their own address during their own transfer', () => {
  it('PostgreSQL detects the lock cycle and rolls one back whole; nothing is left half-done', async () => {
    // The only path that locks the workspace before a membership is acceptance (its row, then the
    // acceptor's own membership). It meets the transfer's order (owner's membership, then the
    // workspace) only when the owner accepts an invitation addressed to themselves meanwhile.
    const w = await world()
    const own = await w.invite(w.O.email, w.S, 'member')
    await hold('invitations', own) // pauses the owner's acceptance after it locked the workspace
    const accepting = codeOf(acceptInvitation(A.sql, w.O.id, own))
    await pg.waitsFor(A, X)
    const transferring = codeOf(transferOwnership(P.sql, w.O.id, w.ws, await w.membership(w.S)))
    await pg.waitsFor(P, A)
    await release()

    const outcomes = await Promise.all([transferring, accepting])
    expect(outcomes.filter((o) => o === '40P01')).toHaveLength(1) // deadlock detected: one aborted
    expect(outcomes.filter((o) => o === 'succeeded')).toHaveLength(1)
    const transferred = outcomes[0] === 'succeeded'
    expect(await w.state()).toEqual({ owner: transferred ? w.S.id : w.O.id, O: 'admin', S: 'admin', M: 'member', G: 'none' })
    expect((await w.invitation(own)).status).toBe(transferred ? 'pending' : 'accepted')
  })
})
