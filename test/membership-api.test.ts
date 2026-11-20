// The membership and role-aware invitation API over real HTTP against a built Orbit server, as
// orbit_app. The authority rules themselves are tested in membership-authority.test.ts (domain)
// and test/concurrency (real sessions); this tests the boundary: request contracts, how each
// domain outcome is answered, what each answer reveals, and the public invitation preview.
import { fileURLToPath } from 'node:url'
import { fetch, setup } from '@nuxt/test-utils/e2e'
import { afterAll, describe, expect, it } from 'vitest'
import { createSession, setName, upsertAccount } from '../server/utils/accounts'
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
async function person(name: string) {
  const email = `${name.toLowerCase()}${++n}@example.com`
  const account = await setName(db, (await upsertAccount(db, `supabase-${email}`, email)).id, name)
  const token = await createSession(db, account.id)
  return { id: account.id, email, token, cookie: `orbit_session=${token}` }
}
type Person = Awaited<ReturnType<typeof person>>
/** A workspace with its owner, a steward, a member (Alex), and an outsider; one at a time (PGlite is one session). */
async function world() {
  const owner = await person('Olive')
  const steward = await person('Sam')
  const alex = await person('Alex')
  const outsider = await person('Stan')
  const ws = await createWorkspace(db, owner.id, `Place ${n}`)
  await db`INSERT INTO orbit.memberships (user_id, workspace_id, role) VALUES (${steward.id}, ${ws.id}, 'admin'), (${alex.id}, ${ws.id}, 'member')`
  const mid = async (p: Person) => (await db`SELECT id FROM orbit.memberships WHERE user_id = ${p.id} AND workspace_id = ${ws.id}`)[0]?.id as string
  return { ws, owner, steward, alex, outsider, mid }
}

const api = (path: string, who?: Person, init: RequestInit = {}) =>
  fetch(path, { ...init, redirect: 'manual', headers: { 'content-type': 'application/json', ...(who ? { cookie: who.cookie } : {}), ...init.headers } })
const send = (method: string, path: string, who?: Person, body?: unknown) =>
  api(path, who, { method, ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }) })
const invite = (wsId: string, who: Person | undefined, email: string, role: unknown) => send('POST', `/api/workspaces/${wsId}/invitations`, who, { email, role })
async function invited(wsId: string, by: Person, email: string, role: 'member' | 'admin') {
  const res = await invite(wsId, by, email, role)
  expect(res.status).toBe(201)
  return (await res.json()) as { id: string; role: string }
}
const member = (wsId: string, memberId: string) => `/api/workspaces/${wsId}/members/${memberId}`
const failure = async (res: Response) => ({ http: res.status, ...(await res.json()).data })
const roleOf = async (p: Person, wsId: string) =>
  ((await db`SELECT role FROM orbit.memberships WHERE user_id = ${p.id} AND workspace_id = ${wsId}`)[0]?.role ?? null) as string | null
const ownerOf = async (wsId: string) => (await db`SELECT owner_id FROM orbit.workspaces WHERE id = ${wsId}`)[0]!.owner_id as string
async function asSuperuser<T>(fn: () => Promise<T>): Promise<T> {
  await db.unsafe('RESET ROLE')
  try { return await fn() } finally { await db.unsafe('SET ROLE orbit_app') }
}
const NOBODY = '00000000-0000-0000-0000-000000000000'

describe('role-aware invitations', () => {
  it('lets the owner offer Steward or Member, a steward Member only, and a member nothing', async () => {
    const { ws, owner, steward, alex } = await world()
    expect(await invited(ws.id, owner, 'future-steward@example.com', 'admin')).toMatchObject({ role: 'admin', acceptable: true })
    expect(await invited(ws.id, owner, 'future-member@example.com', 'member')).toMatchObject({ role: 'member' })
    expect(await failure(await invite(ws.id, steward, 'nope@example.com', 'admin'))).toEqual({ http: 403, reason: 'forbidden' })
    expect(await invited(ws.id, steward, 'by-steward@example.com', 'member')).toMatchObject({ role: 'member' })
    expect(await failure(await invite(ws.id, alex, 'nope2@example.com', 'member'))).toEqual({ http: 403, reason: 'forbidden' })
  })

  it('requires the role, exactly member or admin, and never assumes one', async () => {
    const { ws, owner } = await world()
    const missing = await send('POST', `/api/workspaces/${ws.id}/invitations`, owner, { email: 'r@example.com' })
    expect(await failure(missing)).toEqual({ http: 422, reason: 'invalid_role', field: 'role' })
    for (const forged of ['owner', 'Owner', 'steward', 'ADMIN', '', null, 1, ['admin'], { role: 'admin' }]) {
      expect(await failure(await invite(ws.id, owner, 'r@example.com', forged)), JSON.stringify(forged)).toEqual({ http: 422, reason: 'invalid_role', field: 'role' })
    }
    expect(await db`SELECT 1 FROM orbit.invitations WHERE workspace_id = ${ws.id}`).toHaveLength(0)
  })

  it('lets a steward revoke Member invitations but not Steward invitations; the owner revokes either', async () => {
    const { ws, owner, steward } = await world()
    const toSteward = await invited(ws.id, owner, 'stw@example.com', 'admin')
    const toMember = await invited(ws.id, owner, 'mbr@example.com', 'member')
    expect(await failure(await send('POST', `/api/invitations/${toSteward.id}/revoke`, steward))).toEqual({ http: 403, reason: 'forbidden' })
    expect((await send('POST', `/api/invitations/${toMember.id}/revoke`, steward)).status).toBe(200)
    const res = await send('POST', `/api/invitations/${toSteward.id}/revoke`, owner)
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ role: 'admin', status: 'revoked', acceptable: false })
  })

  it('accepts a Steward invitation into the offered role, upgrade-only, and says so', async () => {
    const { ws, owner, alex } = await world()
    const offer = await invited(ws.id, owner, alex.email, 'admin')
    const res = await send('POST', `/api/invitations/${offer.id}/accept`, alex)
    expect(await res.json()).toEqual({ workspaceId: ws.id, joined: false, role: 'admin' })
    expect(await roleOf(alex, ws.id)).toBe('admin')
  })

  it('answers a Steward invitation that no longer stands with 409 no_longer_valid, and keeps it pending', async () => {
    const { ws, owner, steward } = await world()
    const guest = await person('Gus')
    const offer = await invited(ws.id, owner, guest.email, 'admin')
    await asSuperuser(() => db`UPDATE orbit.workspaces SET owner_id = ${steward.id} WHERE id = ${ws.id}`) // a future transfer
    expect(await failure(await send('POST', `/api/invitations/${offer.id}/accept`, guest))).toEqual({ http: 409, reason: 'no_longer_valid' })
    expect(await (await api(`/api/invitations/${offer.id}`, guest)).json()).toMatchObject({ status: 'pending', acceptable: false, role: 'admin' })
  })

  it('refuses any body on revoke, accept and decline; absent, empty or {} is fine', async () => {
    const { ws, owner, alex } = await world()
    const offer = await invited(ws.id, owner, alex.email, 'member')
    for (const action of ['revoke', 'accept', 'decline']) {
      for (const body of ['{"role":"admin"}', '[]', '"x"', 'null', '1', '{not json']) {
        expect(await failure(await send('POST', `/api/invitations/${offer.id}/${action}`, action === 'revoke' ? owner : alex, body)), `${action} ${body}`)
          .toEqual({ http: 422, reason: 'unexpected_body' })
      }
    }
    expect((await send('POST', `/api/invitations/${offer.id}/decline`, alex, '{}')).status).toBe(204)
    const again = await invited(ws.id, owner, alex.email, 'member')
    expect((await send('POST', `/api/invitations/${again.id}/accept`, alex, '')).status).toBe(200)
  })
})

describe('the public invitation preview: GET /api/invitations/:id/preview', () => {
  const PRIVATE_HEADERS = { 'cache-control': 'private, no-store', 'x-robots-tag': 'noindex', 'referrer-policy': 'no-referrer' }
  const headersOf = (res: Response) => Object.fromEntries(Object.keys(PRIVATE_HEADERS).map((h) => [h, res.headers.get(h)]))

  it('shows anyone, signed in or not, only the workspace name and the offered role', async () => {
    const { ws, owner, outsider } = await world()
    await db`UPDATE orbit.workspaces SET description = 'Private purpose' WHERE id = ${ws.id}`
    const offer = await invited(ws.id, owner, 'recipient@example.com', 'admin')
    for (const who of [undefined, outsider, owner]) {
      const res = await api(`/api/invitations/${offer.id}/preview`, who)
      expect(res.status).toBe(200)
      expect(headersOf(res)).toEqual(PRIVATE_HEADERS)
      const body = await res.json()
      expect(body).toEqual({ workspaceName: ws.name, role: 'admin' })
      const text = JSON.stringify(body)
      for (const secret of ['recipient@example.com', owner.email, owner.id, ws.id, 'Private purpose', 'Olive', offer.id]) expect(text).not.toContain(secret)
    }
  })

  it('answers every invitation that can’t be accepted with the same 404, revealing nothing', async () => {
    const { ws, owner, steward, alex } = await world()
    const declined = await invited(ws.id, owner, 'd@example.com', 'member')
    const decliner = await person('Dee'); await db`UPDATE orbit.users SET email = 'd@example.com' WHERE id = ${decliner.id}`
    await send('POST', `/api/invitations/${declined.id}/decline`, decliner)
    const revoked = await invited(ws.id, owner, 'r@example.com', 'member'); await send('POST', `/api/invitations/${revoked.id}/revoke`, owner)
    const accepted = await invited(ws.id, owner, alex.email, 'member'); await send('POST', `/api/invitations/${accepted.id}/accept`, alex)
    const expired = await invited(ws.id, owner, 'e@example.com', 'member')
    await asSuperuser(() => db`UPDATE orbit.invitations SET created_at = created_at - interval '15 days', expires_at = expires_at - interval '15 days' WHERE id = ${expired.id}`)
    const stale = await invited(ws.id, owner, 's@example.com', 'admin')
    await asSuperuser(() => db`UPDATE orbit.workspaces SET owner_id = ${steward.id} WHERE id = ${ws.id}`)

    const answers = []
    for (const id of [NOBODY, 'not-an-id', declined.id, revoked.id, accepted.id, expired.id, stale.id]) {
      const res = await api(`/api/invitations/${encodeURIComponent(id)}/preview`)
      const { url: _url, ...body } = await res.json()
      answers.push({ status: res.status, headers: headersOf(res), body })
    }
    expect(answers[0]).toEqual({ status: 404, headers: PRIVATE_HEADERS, body: expect.objectContaining({ statusMessage: 'Invitation not found', data: { reason: 'not_found' } }) })
    for (const answer of answers) expect(answer).toEqual(answers[0])
  })
})

describe('the member list: GET /api/workspaces/:id', () => {
  it('gives every member a membership id and what the asking person may do to each, from the authority model', async () => {
    const { ws, owner, steward, alex, mid } = await world()
    const actionsSeenBy = async (viewer: Person) => {
      const res = await api(`/api/workspaces/${ws.id}`, viewer)
      expect(res.headers.get('cache-control')).toBe('private, no-store')
      const { members } = await res.json() as { members: { id: string; name: string; actions: string[] }[] }
      return Object.fromEntries(members.map((m) => [m.name, m.actions]))
    }
    expect(await actionsSeenBy(owner)).toEqual({ Olive: [], Sam: ['demote', 'remove'], Alex: ['promote', 'remove'] })
    expect(await actionsSeenBy(steward)).toEqual({ Olive: [], Sam: [], Alex: ['remove'] })
    expect(await actionsSeenBy(alex)).toEqual({ Olive: [], Sam: [], Alex: [] })
    // The owner's offer of stewardship to Alex takes removal away from stewards, not from the owner.
    await invited(ws.id, owner, alex.email, 'admin')
    expect((await actionsSeenBy(steward)).Alex).toEqual([])
    expect((await actionsSeenBy(owner)).Alex).toEqual(['promote', 'remove'])

    const { members } = await (await api(`/api/workspaces/${ws.id}`, alex)).json()
    expect(members.map((m: { id: string }) => m.id).sort()).toEqual([await mid(owner), await mid(steward), await mid(alex)].sort())
    expect(Object.keys(members[0]).sort()).toEqual(['actions', 'id', 'name', 'owner', 'role', 'transferable', 'you'])
    const text = JSON.stringify(members)
    for (const secret of [owner.id, steward.id, alex.id, owner.email, alex.email]) expect(text).not.toContain(secret) // no account ids, no addresses
  })
})

describe('changing a role: PATCH /api/workspaces/:id/members/:memberId', () => {
  it('lets the owner promote a member and demote a steward', async () => {
    const { ws, owner, steward, alex, mid } = await world()
    const res = await send('PATCH', member(ws.id, await mid(alex)), owner, { role: 'admin' })
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('private, no-store')
    expect(await res.json()).toEqual({ id: await mid(alex), role: 'admin' })
    expect(await (await send('PATCH', member(ws.id, await mid(steward)), owner, { role: 'member' })).json()).toEqual({ id: await mid(steward), role: 'member' })
    expect([await roleOf(alex, ws.id), await roleOf(steward, ws.id)]).toEqual(['admin', 'member'])
    // Asking for the role someone already has: changes nothing, and succeeds for the owner.
    expect(await (await send('PATCH', member(ws.id, await mid(alex)), owner, { role: 'admin' })).json()).toEqual({ id: await mid(alex), role: 'admin' })
    expect(await ownerOf(ws.id)).toBe(owner.id)
  })

  it('refuses stewards, members, self-changes and the owner as a target (403); outsiders and other workspaces get 404', async () => {
    const { ws, owner, steward, alex, outsider, mid } = await world()
    const other = await world()
    const cases: [Person, string, string, unknown][] = [
      [steward, await mid(alex), 'admin', { http: 403, reason: 'forbidden' }],
      [steward, await mid(alex), 'member', { http: 403, reason: 'forbidden' }], // even a no-op: not theirs to decide
      [alex, await mid(steward), 'member', { http: 403, reason: 'forbidden' }],
      [owner, await mid(owner), 'member', { http: 403, reason: 'forbidden' }], // nobody changes their own role
      [steward, await mid(steward), 'member', { http: 403, reason: 'forbidden' }],
      [steward, await mid(owner), 'member', { http: 403, reason: 'forbidden' }],
      [outsider, await mid(alex), 'admin', { http: 404, reason: 'not_found' }],
      [owner, await other.mid(other.alex), 'admin', { http: 404, reason: 'not_found' }], // another workspace's membership
      [owner, NOBODY, 'admin', { http: 404, reason: 'not_found' }],
      [owner, 'not-an-id', 'admin', { http: 404, reason: 'not_found' }],
    ]
    for (const [who, target, role, expected] of cases) {
      expect(await failure(await send('PATCH', member(ws.id, target), who, { role }))).toEqual(expected)
    }
    expect([await roleOf(alex, ws.id), await roleOf(steward, ws.id), await roleOf(owner, ws.id), await roleOf(other.alex, other.ws.id)]).toEqual(['member', 'admin', 'admin', 'member'])
    expect(await ownerOf(ws.id)).toBe(owner.id)
  })

  it('takes exactly { role }, member or admin', async () => {
    const { ws, owner, alex, mid } = await world()
    const path = member(ws.id, await mid(alex))
    expect(await failure(await send('PATCH', path, owner, {}))).toEqual({ http: 422, reason: 'invalid_role', field: 'role' })
    for (const forged of ['owner', 'Owner', 'steward', null, 1, ['admin']]) {
      expect(await failure(await send('PATCH', path, owner, { role: forged }))).toEqual({ http: 422, reason: 'invalid_role', field: 'role' })
    }
    expect(await failure(await send('PATCH', path, owner, { role: 'admin', owner: true }))).toEqual({ http: 422, reason: 'unexpected_property', field: 'owner' })
    expect(await failure(await send('PATCH', path, owner, { role: 'admin', userId: owner.id }))).toEqual({ http: 422, reason: 'unexpected_property', field: 'userId' })
    for (const body of ['[]', '"admin"', 'null', '{not json', '']) {
      expect(await failure(await send('PATCH', path, owner, body)), body).toEqual({ http: 422, reason: 'invalid_body' })
    }
    expect(await roleOf(alex, ws.id)).toBe('member')
  })
})

describe('removing someone: DELETE /api/workspaces/:id/members/:memberId', () => {
  it('lets a steward remove a member, who then no longer reaches the workspace', async () => {
    const { ws, steward, alex, mid } = await world()
    const res = await send('DELETE', member(ws.id, await mid(alex)), steward)
    expect(res.status).toBe(204)
    expect(await res.text()).toBe('')
    expect(await roleOf(alex, ws.id)).toBeNull()
    expect((await api(`/api/workspaces/${ws.id}`, alex)).status).toBe(404)
  })

  it('lets the owner remove a steward; refuses self-removal, the owner as a target, and stewards removing stewards', async () => {
    const { ws, owner, steward, alex, mid } = await world()
    const second = await person('Second')
    await db`INSERT INTO orbit.memberships (user_id, workspace_id, role) VALUES (${second.id}, ${ws.id}, 'admin')`
    for (const [who, target] of [[steward, second], [steward, owner], [owner, owner], [steward, steward], [alex, alex], [alex, steward]] as const) {
      expect(await failure(await send('DELETE', member(ws.id, await mid(target)), who)), `${who.email} removes ${target.email}`).toEqual({ http: 403, reason: 'forbidden' })
    }
    expect((await send('DELETE', member(ws.id, await mid(second)), owner)).status).toBe(204)
    expect([await roleOf(owner, ws.id), await roleOf(steward, ws.id), await roleOf(alex, ws.id), await roleOf(second, ws.id)]).toEqual(['admin', 'admin', 'member', null])
    expect(await ownerOf(ws.id)).toBe(owner.id)
  })

  it('answers a steward removing a member the owner has offered stewardship to with 409; the owner can, withdrawing the offer', async () => {
    const { ws, owner, steward, alex, mid } = await world()
    const offer = await invited(ws.id, owner, alex.email, 'admin')
    expect(await failure(await send('DELETE', member(ws.id, await mid(alex)), steward))).toEqual({ http: 409, reason: 'stewardship_offered' })
    expect(await roleOf(alex, ws.id)).toBe('member')
    expect((await db`SELECT revoked_at FROM orbit.invitations WHERE id = ${offer.id}`)[0]!.revoked_at).toBeNull() // untouched

    expect((await send('DELETE', member(ws.id, await mid(alex)), owner)).status).toBe(204)
    expect(await roleOf(alex, ws.id)).toBeNull()
    expect((await db`SELECT revoked_by FROM orbit.invitations WHERE id = ${offer.id}`)[0]!.revoked_by).toBe(owner.id)
    expect(await failure(await send('POST', `/api/invitations/${offer.id}/accept`, alex))).toEqual({ http: 409, reason: 'not_pending', status: 'revoked' })
  })

  it('takes no body, and reveals nothing to outsiders or across workspaces', async () => {
    const { ws, steward, alex, outsider, mid } = await world()
    const other = await world()
    const path = member(ws.id, await mid(alex))
    for (const body of ['{"userId":"x"}', '[]', '1', '{not json']) {
      expect(await failure(await send('DELETE', path, steward, body)), body).toEqual({ http: 422, reason: 'unexpected_body' })
    }
    const notFound = { http: 404, reason: 'not_found' }
    expect(await failure(await send('DELETE', path, outsider))).toEqual(notFound)
    expect(await failure(await send('DELETE', member(other.ws.id, await other.mid(other.alex)), steward))).toEqual(notFound)
    expect(await failure(await send('DELETE', member(ws.id, await other.mid(other.alex)), steward))).toEqual(notFound)
    expect(await failure(await send('DELETE', member(NOBODY, await mid(alex)), steward))).toEqual(notFound)
    expect([await roleOf(alex, ws.id), await roleOf(other.alex, other.ws.id)]).toEqual(['member', 'member'])
  })
})

describe('transferring ownership: POST /api/workspaces/:id/members/:memberId/ownership', () => {
  const ownership = (wsId: string, memberId: string) => `${member(wsId, memberId)}/ownership`
  type Seen = { name: string; owner: boolean; role: string; actions: string[]; transferable: boolean }
  const membersSeenBy = async (wsId: string, viewer: Person) =>
    Object.fromEntries(((await (await api(`/api/workspaces/${wsId}`, viewer)).json()).members as Seen[]).map((m) => [m.name, m]))

  it('offers the choice from the server: transferable only in the owner’s view, for everyone else', async () => {
    const { ws, owner, steward, alex } = await world()
    const transferableSeenBy = async (viewer: Person) =>
      Object.fromEntries(Object.entries(await membersSeenBy(ws.id, viewer)).map(([name, m]) => [name, m.transferable]))
    expect(await transferableSeenBy(owner)).toEqual({ Olive: false, Sam: true, Alex: true })
    expect(await transferableSeenBy(steward)).toEqual({ Olive: false, Sam: false, Alex: false })
    expect(await transferableSeenBy(alex)).toEqual({ Olive: false, Sam: false, Alex: false })
    // The actions vocabulary is unchanged: no new value for browsers that already interpret it.
    expect((await membersSeenBy(ws.id, owner)).Alex!.actions).toEqual(['promote', 'remove'])
  })

  it('moves ownership at once: 200 { revokedInvitations }, private, and People shows it', async () => {
    const { ws, owner, steward, alex, mid } = await world()
    await invited(ws.id, owner, 'future-steward@example.com', 'admin')
    const memberInvite = await invited(ws.id, owner, 'future-member@example.com', 'member')
    const ids = [await mid(owner), await mid(steward), await mid(alex)]

    const res = await send('POST', ownership(ws.id, await mid(alex)), owner)
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('private, no-store')
    expect(await res.json()).toEqual({ revokedInvitations: 1 })

    expect([await ownerOf(ws.id), await roleOf(owner, ws.id), await roleOf(alex, ws.id)]).toEqual([alex.id, 'admin', 'member'])
    expect([await mid(owner), await mid(steward), await mid(alex)]).toEqual(ids)
    const seen = await membersSeenBy(ws.id, alex)
    expect(seen.Alex).toMatchObject({ owner: true, role: 'member', transferable: false })
    expect(seen.Olive).toMatchObject({ owner: false, role: 'admin', actions: ['demote', 'remove'], transferable: true })
    expect((await membersSeenBy(ws.id, owner)).Alex).toMatchObject({ owner: true, actions: [], transferable: false })
    // The Member invitation is still pending and acceptable.
    const listed = await (await api(`/api/workspaces/${ws.id}/invitations`, alex)).json() as { id: string; status: string; acceptable: boolean }[]
    expect(listed.find((i) => i.id === memberInvite.id)).toMatchObject({ status: 'pending', acceptable: true })
    expect(listed.filter((i) => i.status === 'pending')).toHaveLength(1)
  })

  it('refuses anyone but the owner, the owner naming themselves, and a stale former owner (403)', async () => {
    const { ws, owner, steward, alex, mid } = await world()
    const forbidden = { http: 403, reason: 'forbidden' }
    expect(await failure(await send('POST', ownership(ws.id, await mid(alex)), steward))).toEqual(forbidden)
    expect(await failure(await send('POST', ownership(ws.id, await mid(steward)), alex))).toEqual(forbidden)
    expect(await failure(await send('POST', ownership(ws.id, await mid(owner)), owner))).toEqual(forbidden)
    expect(await ownerOf(ws.id)).toBe(owner.id)

    expect((await send('POST', ownership(ws.id, await mid(steward)), owner)).status).toBe(200)
    const stale = await send('POST', ownership(ws.id, await mid(alex)), owner) // a page from before the transfer
    expect(stale.headers.get('cache-control')).toBe('private, no-store')
    expect(await failure(stale)).toEqual(forbidden)
    expect(await failure(await send('POST', ownership(ws.id, await mid(steward)), owner))).toEqual(forbidden) // a retry
    expect(await ownerOf(ws.id)).toBe(steward.id)
  })

  it('answers 404 for outsiders, unknown workspaces and memberships that aren’t here, revealing nothing', async () => {
    const { ws, owner, alex, outsider, mid } = await world()
    const other = await world()
    const notFound = { http: 404, reason: 'not_found' }
    const cases: [Person, string][] = [
      [outsider, ownership(ws.id, await mid(alex))],
      [owner, ownership(ws.id, await other.mid(other.alex))], // another workspace's member
      [owner, ownership(other.ws.id, await other.mid(other.alex))], // a workspace they aren't in
      [owner, ownership(NOBODY, await mid(alex))],
      [owner, ownership(ws.id, NOBODY)],
      [owner, ownership(ws.id, 'not-an-id')],
    ]
    for (const [who, path] of cases) {
      const res = await send('POST', path, who)
      expect(res.headers.get('cache-control'), path).toBe('private, no-store')
      const text = await res.text()
      expect({ http: res.status, ...JSON.parse(text).data }, path).toEqual(notFound)
      for (const secret of ['Alex', alex.email, alex.id, ws.name, other.ws.name]) expect(text).not.toContain(secret)
    }
    // A recipient removed in the meantime.
    const gone = await mid(alex)
    expect((await send('DELETE', member(ws.id, gone), owner)).status).toBe(204)
    expect(await failure(await send('POST', ownership(ws.id, gone), owner))).toEqual(notFound)
    expect([await ownerOf(ws.id), await ownerOf(other.ws.id)]).toEqual([owner.id, other.owner.id])
  })

  it('takes no body (422), whatever it says', async () => {
    const { ws, owner, alex, mid } = await world()
    for (const body of ['{"membershipId":"x"}', '{"role":"owner"}', '[]', '"x"', 'null', '1', '{not json']) {
      expect(await failure(await send('POST', ownership(ws.id, await mid(alex)), owner, body)), body).toEqual({ http: 422, reason: 'unexpected_body' })
    }
    expect(await ownerOf(ws.id)).toBe(owner.id)
    // Absent, empty or {} are all "no body".
    expect((await send('POST', ownership(ws.id, await mid(alex)), owner, '{}')).status).toBe(200)
    expect(await ownerOf(ws.id)).toBe(alex.id)
  })
})

describe('signed-out visitors and outsiders', () => {
  it('need to sign in for everything but the preview, and learn nothing private either way', async () => {
    const { ws, owner, alex, outsider, mid } = await world()
    const offer = await invited(ws.id, owner, 'someone@example.com', 'admin')
    for (const [method, path, body] of [
      ['PATCH', member(ws.id, await mid(alex)), { role: 'admin' }],
      ['DELETE', member(ws.id, await mid(alex)), undefined],
      ['POST', `${member(ws.id, await mid(alex))}/ownership`, undefined],
      ['POST', `/api/workspaces/${ws.id}/invitations`, { email: 'x@example.com', role: 'member' }],
      ['GET', `/api/workspaces/${ws.id}`, undefined],
    ] as const) {
      const signedOut = await send(method, path, undefined, body)
      expect(signedOut.status, `${method} ${path}`).toBe(401)
      expect(signedOut.headers.get('cache-control')).toBe('private, no-store')
      const asOutsider = await send(method, path, outsider, body)
      expect(asOutsider.status, `${method} ${path} as outsider`).toBe(404)
      for (const res of [signedOut, asOutsider]) {
        const text = await res.text()
        for (const secret of ['Olive', 'Alex', owner.email, alex.email, alex.id, ws.name]) expect(text).not.toContain(secret)
      }
    }
    expect((await api(`/api/invitations/${offer.id}/preview`)).status).toBe(200) // the one public read
    expect(await roleOf(alex, ws.id)).toBe('member')
  })
})
