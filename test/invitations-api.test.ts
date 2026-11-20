// The invitation API over real HTTP against a built Orbit server, running as orbit_app. The
// domain rules themselves are tested in invitations.test.ts; this tests the boundary: who may
// call what, what each answer reveals, and that answers match the domain's results exactly.
import { fileURLToPath } from 'node:url'
import { fetch, setup } from '@nuxt/test-utils/e2e'
import { afterAll, describe, expect, it } from 'vitest'
import { createSession, setName, upsertAccount } from '../server/utils/accounts'
import { createInvitation, declineInvitation, revokeInvitation } from '../server/utils/invitations'
import { createWorkspace } from '../server/utils/workspaces'
import { startTestDatabase } from './db'
import { startFakeSupabase } from './fake-supabase'

const supabase = await startFakeSupabase()
const testDb = await startTestDatabase({ asApp: true })
afterAll(async () => {
  supabase.close()
  await testDb.close()
})
process.env.NUXT_DATABASE_URL = testDb.url
process.env.NUXT_SUPABASE_URL = supabase.url
process.env.NUXT_SUPABASE_KEY = 'sb_publishable_test'
await setup({ rootDir: fileURLToPath(new URL('..', import.meta.url)), server: true, browser: false })

const db = testDb.sql
let n = 0
/** A signed-in person: their account, address and a session cookie, as sign-in leaves them. */
async function person(name: string) {
  const email = `${name.toLowerCase()}${++n}@example.com`
  const account = await setName(db, (await upsertAccount(db, `supabase-${email}`, email)).id, name)
  const token = await createSession(db, account.id)
  return { id: account.id, email, token, cookie: `orbit_session=${token}` }
}
/** A workspace with its owner, a steward, a member, and someone to invite. */
async function world() {
  // One at a time, here and throughout: PGlite has a single backend session, shared by these
  // queries and the server's, so they must never overlap.
  const owner = await person('Olive')
  const steward = await person('Sam')
  const member = await person('Mia')
  const guest = await person('Gus')
  const outsider = await person('Stan')
  const ws = await createWorkspace(db, owner.id, `Place ${n}`)
  await db`INSERT INTO orbit.memberships (user_id, workspace_id, role) VALUES (${steward.id}, ${ws.id}, 'admin'), (${member.id}, ${ws.id}, 'member')`
  return { ws, owner, steward, member, guest, outsider }
}
type Person = Awaited<ReturnType<typeof person>>

const api = (path: string, who?: Person, init: RequestInit = {}) =>
  fetch(path, {
    ...init,
    redirect: 'manual',
    headers: { 'content-type': 'application/json', ...(who ? { cookie: who.cookie } : {}), ...init.headers },
  })
const post = (path: string, who?: Person, body?: unknown) =>
  api(path, who, { method: 'POST', ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }) })
const invite = (wsId: string, who: Person | undefined, email: unknown) => post(`/api/workspaces/${wsId}/invitations`, who, { email })
/** An invitation made through the API, by someone allowed to. */
async function invited(wsId: string, by: Person, email: string) {
  const res = await invite(wsId, by, email)
  expect(res.status).toBe(201)
  return (await res.json()) as { id: string; email: string; status: string }
}
/** An error's status and its data: the domain's reason, and status where there is one. */
const failure = async (res: Response) => ({ http: res.status, ...(await res.json()).data })

const membership = async (userId: string, workspaceId: string) =>
  (await db`SELECT role FROM orbit.memberships WHERE user_id = ${userId} AND workspace_id = ${workspaceId}`)[0]?.role ?? null
const invitationRows = async () => (await db`SELECT count(*)::int AS n FROM orbit.invitations`)[0]!.n as number
/** Outside the application's role, to do what only time could otherwise do. */
async function ageInvitation(id: string) {
  await db.unsafe('RESET ROLE')
  try {
    await db`UPDATE orbit.invitations SET created_at = created_at - interval '15 days', expires_at = expires_at - interval '15 days' WHERE id = ${id}`
  } finally {
    await db.unsafe('SET ROLE orbit_app')
  }
}
const NOBODY = '00000000-0000-0000-0000-000000000000'

describe('every invitation endpoint', () => {
  it('requires a signed-in account, and changes nothing without one', async () => {
    const { ws, owner, guest } = await world()
    const invitation = await invited(ws.id, owner, guest.email)
    const before = await invitationRows()
    const forged = { ...guest, cookie: 'orbit_session=forged' }

    for (const who of [undefined, forged]) {
      for (const call of [
        () => invite(ws.id, who, 'someone@example.com'),
        () => api(`/api/workspaces/${ws.id}/invitations`, who),
        () => post(`/api/invitations/${invitation.id}/revoke`, who),
        () => api('/api/invitations', who),
        () => api(`/api/invitations/${invitation.id}`, who),
        () => post(`/api/invitations/${invitation.id}/accept`, who),
        () => post(`/api/invitations/${invitation.id}/decline`, who),
      ]) {
        const res = await call()
        expect(res.status).toBe(401)
        expect(res.headers.get('cache-control')).toBe('private, no-store')
      }
    }
    expect(await invitationRows()).toBe(before)
    expect(await membership(guest.id, ws.id)).toBeNull()
    expect((await api(`/api/invitations/${invitation.id}`, guest)).status).toBe(200) // still pending, untouched
  })

  it('is never stored by a cache, whatever the answer: every endpoint, collections and errors included', async () => {
    const { ws, owner, member, guest, outsider } = await world()
    const pending = await invited(ws.id, owner, guest.email)
    const toRevoke = await invited(ws.id, owner, 'revoke-me@example.com')
    const toDecline = await invited(ws.id, owner, 'decliner@example.com')
    const decliner = await person('Dee')
    await db`UPDATE orbit.users SET email = 'decliner@example.com' WHERE id = ${decliner.id}`
    const wsPath = `/api/workspaces/${ws.id}/invitations`

    // [endpoint, expected status, request], one at a time (see world())
    const matrix: [string, number, () => Promise<Response>][] = [
      ['POST workspace invitations', 401, () => invite(ws.id, undefined, 'x@example.com')],
      ['POST workspace invitations', 403, () => invite(ws.id, member, 'x@example.com')],
      ['POST workspace invitations', 404, () => invite(ws.id, outsider, 'x@example.com')],
      ['POST workspace invitations', 409, () => invite(ws.id, owner, guest.email)],
      ['POST workspace invitations', 422, () => invite(ws.id, owner, 'nope')],
      ['POST workspace invitations', 201, () => invite(ws.id, owner, 'fresh@example.com')],
      ['GET workspace invitations', 200, () => api(wsPath, owner)],
      ['GET workspace invitations', 401, () => api(wsPath)],
      ['GET workspace invitations', 403, () => api(wsPath, member)],
      ['GET workspace invitations', 404, () => api(wsPath, outsider)],
      ['POST revoke', 401, () => post(`/api/invitations/${toRevoke.id}/revoke`)],
      ['POST revoke', 403, () => post(`/api/invitations/${toRevoke.id}/revoke`, member)],
      ['POST revoke', 404, () => post(`/api/invitations/${toRevoke.id}/revoke`, outsider)],
      ['POST revoke', 200, () => post(`/api/invitations/${toRevoke.id}/revoke`, owner)],
      ['GET invitations', 200, () => api('/api/invitations', guest)],
      ['GET invitations', 401, () => api('/api/invitations')],
      ['GET invitation', 200, () => api(`/api/invitations/${pending.id}`, guest)],
      ['GET invitation', 401, () => api(`/api/invitations/${pending.id}`)],
      ['GET invitation', 404, () => api(`/api/invitations/${pending.id}`, outsider)],
      ['GET invitation', 404, () => api(`/api/invitations/${NOBODY}`, guest)],
      ['POST decline', 401, () => post(`/api/invitations/${toDecline.id}/decline`)],
      ['POST decline', 404, () => post(`/api/invitations/${toDecline.id}/decline`, outsider)],
      ['POST decline', 204, () => post(`/api/invitations/${toDecline.id}/decline`, decliner)],
      ['POST accept', 401, () => post(`/api/invitations/${pending.id}/accept`)],
      ['POST accept', 404, () => post(`/api/invitations/${pending.id}/accept`, outsider)],
      ['POST accept', 200, () => post(`/api/invitations/${pending.id}/accept`, guest)],
      ['POST accept', 409, () => post(`/api/invitations/${pending.id}/accept`, guest)],
    ]
    const observed: string[] = []
    for (const [endpoint, _status, request] of matrix) {
      const res = await request()
      observed.push(`${endpoint} ${res.status} → ${res.headers.get('cache-control')}`)
    }
    expect(observed).toEqual(matrix.map(([endpoint, status]) => `${endpoint} ${status} → private, no-store`))

    // Also a path under the rule that matches no endpoint at all (Nitro's own 404).
    expect((await api('/api/invitations/a/b/c', guest)).headers.get('cache-control')).toBe('private, no-store')
    // Only routes with a rule are affected: other errors keep Nitro's defaults.
    expect((await api(`/api/workspaces/${NOBODY}`, guest)).headers.get('cache-control')).toBe('no-cache')
  })
})

describe('creating an invitation: POST /api/workspaces/:id/invitations', () => {
  it('lets the owner and stewards invite an address, which creates an offer and no membership', async () => {
    const { ws, owner, steward, guest } = await world()
    const res = await invite(ws.id, owner, `  ${guest.email.toUpperCase()} `)
    expect(res.status).toBe(201)
    const invitation = await res.json()
    expect(invitation).toEqual({
      id: expect.any(String),
      workspaceId: ws.id,
      email: guest.email, // normalised
      role: 'member',
      status: 'pending',
      acceptable: true,
      invitedBy: 'Olive',
      createdAt: expect.any(String),
      expiresAt: expect.any(String),
      closedAt: null,
    })
    expect((Date.parse(invitation.expiresAt) - Date.parse(invitation.createdAt)) / 86_400_000).toBe(14)
    expect((await invite(ws.id, steward, 'friend-of-sam@example.com')).status).toBe(201)

    // An offer, not a membership: the guest still can't see the workspace
    expect(await membership(guest.id, ws.id)).toBeNull()
    expect((await api(`/api/workspaces/${ws.id}`, guest)).status).toBe(404)
  })

  it('takes the inviter from the session and the dates from the database, whatever the body says', async () => {
    const { ws, steward, owner } = await world()
    const res = await post(`/api/workspaces/${ws.id}/invitations`, steward, {
      email: 'ignored-fields@example.com', invited_by: owner.id, invitedBy: owner.id, expires_at: '2099-01-01', status: 'accepted',
    })
    expect(res.status).toBe(201)
    const invitation = await res.json()
    expect(invitation).toMatchObject({ invitedBy: 'Sam', status: 'pending', closedAt: null })
    const [row] = await db`SELECT invited_by, expires_at - created_at = interval '14 days' AS fourteen FROM orbit.invitations WHERE id = ${invitation.id}`
    expect(row).toEqual({ invited_by: steward.id, fourteen: true })
  })

  it('refuses members (403) and outsiders (404, as if the workspace didn’t exist)', async () => {
    const { ws, member, outsider } = await world()
    expect(await failure(await invite(ws.id, member, 'x@example.com'))).toEqual({ http: 403, reason: 'forbidden' })
    const asOutsider = await invite(ws.id, outsider, 'x@example.com')
    const nonexistent = await invite(NOBODY, outsider, 'x@example.com')
    expect(await failure(asOutsider)).toEqual({ http: 404, reason: 'not_found' })
    expect(await failure(nonexistent)).toEqual({ http: 404, reason: 'not_found' })
    expect(await failure(await invite('not-an-id', member, 'x@example.com'))).toEqual({ http: 404, reason: 'not_found' })
    expect(await db`SELECT 1 FROM orbit.invitations WHERE workspace_id = ${ws.id}`).toHaveLength(0)
  })

  it('refuses a second pending invitation for the same address (409)', async () => {
    const { ws, owner, steward, guest } = await world()
    await invited(ws.id, owner, guest.email)
    const res = await invite(ws.id, steward, guest.email.toUpperCase())
    expect(res.status).toBe(409)
    expect((await res.json()).data).toEqual({ reason: 'already_invited' })
  })

  it('refuses malformed bodies and addresses (422) without leaking internals', async () => {
    const { ws, owner } = await world()
    for (const body of ['{not json', '[]', '"guest@example.com"', 'null', '42']) {
      const res = await post(`/api/workspaces/${ws.id}/invitations`, owner, body)
      expect(await failure(res)).toEqual({ http: 422, reason: 'invalid_body' })
    }
    for (const email of [undefined, '', 'nope', 'a@b', 42, null, ['x@example.com'], { email: 'x@example.com' }]) {
      const res = await invite(ws.id, owner, email)
      const body = await res.json()
      expect(res.status).toBe(422)
      expect(body.data).toEqual({ reason: 'invalid_email', field: 'email' })
      expect(body.statusMessage).toBe('That doesn’t look like an email address.')
      expect(Object.keys(body).sort()).toEqual(['data', 'error', 'message', 'statusCode', 'statusMessage', 'url']) // no stack
      expect(JSON.stringify(body)).not.toMatch(/postgres|orbit\.|select |insert /i)
    }
    expect(await db`SELECT 1 FROM orbit.invitations WHERE workspace_id = ${ws.id}`).toHaveLength(0)
  })
})

describe('a workspace’s invitations: GET /api/workspaces/:id/invitations', () => {
  it('shows the owner and stewards every invitation, newest first, with what became of it', async () => {
    const { ws, owner, steward, guest } = await world()
    const expired = await invited(ws.id, owner, 'expired@example.com')
    await ageInvitation(expired.id)
    const declined = await invited(ws.id, owner, guest.email)
    expect((await post(`/api/invitations/${declined.id}/decline`, guest)).status).toBe(204)
    const revoked = await invited(ws.id, steward, 'revoked@example.com')
    expect((await post(`/api/invitations/${revoked.id}/revoke`, owner)).status).toBe(200)
    const pending = await invited(ws.id, steward, 'pending@example.com')

    for (const manager of [owner, steward]) {
      const res = await api(`/api/workspaces/${ws.id}/invitations`, manager)
      expect(res.status).toBe(200)
      const list = await res.json()
      expect(list.map((i: { id: string; status: string }) => [i.id, i.status])).toEqual([
        [pending.id, 'pending'], [revoked.id, 'revoked'], [declined.id, 'declined'], [expired.id, 'expired'],
      ])
      expect(list[0]).toMatchObject({ email: 'pending@example.com', invitedBy: 'Sam', closedAt: null })
      expect(list[1].closedAt).toEqual(expect.any(String))
      expect(list[3].closedAt).toBeNull() // expired: nobody closed it, its expiresAt says when
    }
  })

  it('refuses members (403) and outsiders (404)', async () => {
    const { ws, owner, member, outsider, guest } = await world()
    await invited(ws.id, owner, guest.email)
    expect(await failure(await api(`/api/workspaces/${ws.id}/invitations`, member))).toEqual({ http: 403, reason: 'forbidden' })
    expect(await failure(await api(`/api/workspaces/${ws.id}/invitations`, outsider))).toEqual({ http: 404, reason: 'not_found' })
    expect(await failure(await api(`/api/workspaces/${ws.id}/invitations`, guest))).toEqual({ http: 404, reason: 'not_found' })
    expect(await failure(await api('/api/workspaces/not-an-id/invitations', owner))).toEqual({ http: 404, reason: 'not_found' })
  })
})

describe('revoking: POST /api/invitations/:id/revoke', () => {
  it('lets the owner or any steward withdraw a pending invitation', async () => {
    const { ws, owner, steward, guest } = await world()
    const invitation = await invited(ws.id, owner, guest.email)
    const res = await post(`/api/invitations/${invitation.id}/revoke`, steward)
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ id: invitation.id, status: 'revoked', invitedBy: 'Olive', closedAt: expect.any(String) })
    // The recipient can no longer answer it, and is told why
    expect(await failure(await post(`/api/invitations/${invitation.id}/accept`, guest)))
      .toEqual({ http: 409, reason: 'not_pending', status: 'revoked' })
  })

  it('refuses members, outsiders and the recipient, and anything no longer pending', async () => {
    const { ws, owner, member, outsider, guest } = await world()
    const invitation = await invited(ws.id, owner, guest.email)
    expect(await failure(await post(`/api/invitations/${invitation.id}/revoke`, member))).toEqual({ http: 403, reason: 'forbidden' })
    for (const who of [outsider, guest]) {
      expect(await failure(await post(`/api/invitations/${invitation.id}/revoke`, who))).toEqual({ http: 404, reason: 'not_found' })
    }
    for (const id of [NOBODY, 'not-an-id']) {
      expect(await failure(await post(`/api/invitations/${id}/revoke`, owner))).toEqual({ http: 404, reason: 'not_found' })
    }

    expect((await post(`/api/invitations/${invitation.id}/revoke`, owner)).status).toBe(200)
    expect(await failure(await post(`/api/invitations/${invitation.id}/revoke`, owner)))
      .toEqual({ http: 409, reason: 'not_pending', status: 'revoked' })
    const late = await invited(ws.id, owner, 'late@example.com')
    await ageInvitation(late.id)
    expect(await failure(await post(`/api/invitations/${late.id}/revoke`, owner)))
      .toEqual({ http: 409, reason: 'not_pending', status: 'expired' })
  })
})

describe('the recipient: GET /api/invitations and GET /api/invitations/:id', () => {
  it('lists only pending invitations to their own address, with no addresses or account ids', async () => {
    const { ws, owner, guest, outsider } = await world()
    await db`UPDATE orbit.workspaces SET description = 'Planning the spring launch' WHERE id = ${ws.id}`
    const invitation = await invited(ws.id, owner, guest.email)
    const other = await world()
    const gone = await invited(other.ws.id, other.owner, guest.email)
    await ageInvitation(gone.id)

    const res = await api('/api/invitations', guest)
    expect(res.status).toBe(200)
    const list = await res.json()
    expect(list).toEqual([{
      id: invitation.id,
      workspace: { id: ws.id, name: ws.name, description: 'Planning the spring launch' },
      role: 'member',
      invitedBy: 'Olive',
      expiresAt: expect.any(String),
    }])
    const text = JSON.stringify(list)
    for (const secret of [owner.email, guest.email, owner.id, guest.id, owner.token, guest.token]) expect(text).not.toContain(secret)

    expect(await (await api('/api/invitations', outsider)).json()).toEqual([])
    expect(await membership(guest.id, ws.id)).toBeNull() // discovering is not joining
  })

  it('shows one invitation to its recipient, with its real status, and changes nothing by looking', async () => {
    const { ws, owner, guest } = await world()
    const invitation = await invited(ws.id, owner, guest.email)
    const res = await api(`/api/invitations/${invitation.id}`, guest)
    expect(res.status).toBe(200)
    const seen = await res.json()
    expect(seen).toEqual({
      id: invitation.id,
      workspace: { id: ws.id, name: ws.name, description: null },
      role: 'member',
      invitedBy: 'Olive',
      expiresAt: expect.any(String),
      status: 'pending',
      acceptable: true,
      closedAt: null,
    })
    for (const secret of [owner.email, guest.email, owner.id, guest.id, owner.token]) expect(JSON.stringify(seen)).not.toContain(secret)
    await api(`/api/invitations/${invitation.id}`, guest)
    expect(await membership(guest.id, ws.id)).toBeNull()
    expect((await db`SELECT num_nonnulls(accepted_at, declined_at, revoked_at) AS n FROM orbit.invitations WHERE id = ${invitation.id}`)[0]!.n).toBe(0)
  })

  it('tells the recipient honestly when their invitation expired, was answered or withdrawn', async () => {
    const { ws, owner, guest } = await world()
    const statusOf = async (id: string) => (await (await api(`/api/invitations/${id}`, guest)).json()).status

    const expired = await invited(ws.id, owner, guest.email)
    await ageInvitation(expired.id)
    expect(await statusOf(expired.id)).toBe('expired')
    const declined = await invited(ws.id, owner, guest.email)
    await post(`/api/invitations/${declined.id}/decline`, guest)
    expect(await statusOf(declined.id)).toBe('declined')
    const revoked = await invited(ws.id, owner, guest.email)
    await post(`/api/invitations/${revoked.id}/revoke`, owner)
    expect(await statusOf(revoked.id)).toBe('revoked')
    const accepted = await invited(ws.id, owner, guest.email)
    await post(`/api/invitations/${accepted.id}/accept`, guest)
    const seen = await (await api(`/api/invitations/${accepted.id}`, guest)).json()
    expect(seen).toMatchObject({ status: 'accepted', closedAt: expect.any(String), workspace: { id: ws.id } })
    // None of them is offered as pending any more
    expect(await (await api('/api/invitations', guest)).json()).toEqual([])
  })

  it('answers anyone else holding the link exactly as for an invitation that doesn’t exist', async () => {
    const { ws, owner, steward, member, guest, outsider } = await world()
    const invitation = await invited(ws.id, owner, guest.email)
    const shape = async (res: Response) => {
      const { url: _url, ...body } = await res.json()
      return { status: res.status, body }
    }
    const nonexistent = await shape(await api(`/api/invitations/${NOBODY}`, outsider))
    expect(nonexistent).toEqual({ status: 404, body: expect.objectContaining({ statusMessage: 'Invitation not found', data: { reason: 'not_found' } }) })
    // Even those who manage the workspace: this is the recipient's view, not theirs
    for (const who of [outsider, member, steward, owner]) {
      expect(await shape(await api(`/api/invitations/${invitation.id}`, who))).toEqual(nonexistent)
    }
    for (const id of ['not-an-id', "1'; DROP TABLE orbit.invitations; --", 'x'.repeat(5000)]) {
      expect(await shape(await api(`/api/invitations/${encodeURIComponent(id)}`, guest))).toEqual(nonexistent)
    }
  })
})

describe('answering: POST /api/invitations/:id/accept and /decline', () => {
  it('makes the recipient a Member only when they accept, and says a membership was created', async () => {
    const { ws, owner, guest } = await world()
    const invitation = await invited(ws.id, owner, guest.email)
    await api('/api/invitations', guest)
    await api(`/api/invitations/${invitation.id}`, guest)
    expect(await membership(guest.id, ws.id)).toBeNull() // invited, listed, opened: still not a member

    const res = await post(`/api/invitations/${invitation.id}/accept`, guest)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ workspaceId: ws.id, joined: true })
    expect(await membership(guest.id, ws.id)).toBe('member')
    expect((await api(`/api/workspaces/${ws.id}`, guest)).status).toBe(200)

    expect(await failure(await post(`/api/invitations/${invitation.id}/accept`, guest)))
      .toEqual({ http: 409, reason: 'not_pending', status: 'accepted' })
  })

  it('takes who accepts from the session, never from the request', async () => {
    const { ws, owner, guest, outsider } = await world()
    const invitation = await invited(ws.id, owner, guest.email)
    // Someone else holding the link, claiming to be the recipient in every way a body could
    const res = await post(`/api/invitations/${invitation.id}/accept`, outsider, {
      userId: guest.id, accepted_by: guest.id, email: guest.email,
    })
    expect(await failure(res)).toEqual({ http: 404, reason: 'not_found' })
    expect(await membership(outsider.id, ws.id)).toBeNull()
    expect(await membership(guest.id, ws.id)).toBeNull()
    expect(await failure(await post(`/api/invitations/${invitation.id}/decline`, outsider, { email: guest.email })))
      .toEqual({ http: 404, reason: 'not_found' })
    expect((await api(`/api/invitations/${invitation.id}`, guest)).status).toBe(200) // still theirs to answer
    expect((await (await api(`/api/invitations/${invitation.id}`, guest)).json()).status).toBe('pending')
  })

  it('keeps someone’s existing place and role when they accept, and says so', async () => {
    const { ws, owner, steward } = await world()
    const invitation = await invited(ws.id, owner, steward.email) // the steward was invited anyway
    const res = await post(`/api/invitations/${invitation.id}/accept`, steward)
    expect(await res.json()).toEqual({ workspaceId: ws.id, joined: false })
    expect(await membership(steward.id, ws.id)).toBe('admin') // still a steward, never demoted
  })

  it('declines without making anyone a member', async () => {
    const { ws, owner, guest } = await world()
    const invitation = await invited(ws.id, owner, guest.email)
    const res = await post(`/api/invitations/${invitation.id}/decline`, guest)
    expect(res.status).toBe(204)
    expect(await res.text()).toBe('')
    expect(await membership(guest.id, ws.id)).toBeNull()
    expect(await failure(await post(`/api/invitations/${invitation.id}/accept`, guest)))
      .toEqual({ http: 409, reason: 'not_pending', status: 'declined' })
    expect(await failure(await post(`/api/invitations/${invitation.id}/decline`, guest)))
      .toEqual({ http: 409, reason: 'not_pending', status: 'declined' })
  })

  it('refuses to answer an expired or withdrawn invitation as if it were pending', async () => {
    const { ws, owner, guest } = await world()
    const expired = await invited(ws.id, owner, guest.email)
    await ageInvitation(expired.id)
    const revoked = await invited(ws.id, owner, guest.email)
    await post(`/api/invitations/${revoked.id}/revoke`, owner)

    for (const [id, status] of [[expired.id, 'expired'], [revoked.id, 'revoked']] as const) {
      for (const answer of ['accept', 'decline']) {
        const res = await post(`/api/invitations/${id}/${answer}`, guest)
        expect(await failure(res)).toEqual({ http: 409, reason: 'not_pending', status })
      }
    }
    expect(await membership(guest.id, ws.id)).toBeNull()
  })

  it('treats malformed and unknown ids as not found', async () => {
    const { guest } = await world()
    for (const id of [NOBODY, 'not-an-id', '%00', 'x'.repeat(5000)]) {
      for (const answer of ['accept', 'decline']) {
        expect(await failure(await post(`/api/invitations/${id}/${answer}`, guest))).toEqual({ http: 404, reason: 'not_found' })
      }
    }
  })
})

describe('the API and the domain', () => {
  it('give the same answer for the same situation', async () => {
    const { ws, owner, member, guest, outsider } = await world()
    const invitation = await invited(ws.id, owner, guest.email)
    const answered = await invited(ws.id, owner, 'answered@example.com')
    await post(`/api/invitations/${answered.id}/revoke`, owner)
    const without = ({ ok: _ok, ...rest }: { ok: false }) => rest

    // None of these domain calls changes anything: each is refused.
    const cases: [() => Promise<{ ok: boolean }>, () => Promise<Response>][] = [
      [() => createInvitation(db, member.id, ws.id, 'x@example.com'), () => invite(ws.id, member, 'x@example.com')],
      [() => createInvitation(db, outsider.id, ws.id, 'x@example.com'), () => invite(ws.id, outsider, 'x@example.com')],
      [() => createInvitation(db, owner.id, ws.id, 'nope'), () => invite(ws.id, owner, 'nope')],
      [() => createInvitation(db, owner.id, ws.id, guest.email), () => invite(ws.id, owner, guest.email)],
      [() => revokeInvitation(db, member.id, invitation.id), () => post(`/api/invitations/${invitation.id}/revoke`, member)],
      [() => revokeInvitation(db, guest.id, invitation.id), () => post(`/api/invitations/${invitation.id}/revoke`, guest)],
      [() => revokeInvitation(db, owner.id, answered.id), () => post(`/api/invitations/${answered.id}/revoke`, owner)],
      [() => declineInvitation(db, outsider.id, invitation.id), () => post(`/api/invitations/${invitation.id}/decline`, outsider)],
    ]
    for (const [domain, http] of cases) {
      const result = await domain()
      expect(result.ok).toBe(false)
      const { http: _status, field: _field, ...data } = await failure(await http())
      expect(data).toEqual(without(result as { ok: false }))
    }
    expect(await membership(guest.id, ws.id)).toBeNull()
  })
})
