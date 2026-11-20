// The People page and an invitation's page, as rendered by a built Orbit server for each kind of
// visitor (server-side rendering; no browser), and the server-derived facts they rely on
// (invitationRoles, revocable). The journey's actions are the existing API, tested over HTTP.
import { fileURLToPath } from 'node:url'
import { fetch, setup } from '@nuxt/test-utils/e2e'
import { afterAll, describe, expect, it } from 'vitest'
import { membershipRequest, ownershipRequest } from '../app/utils/memberActions'
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
async function person(name: string | null, email = `p${++n}@example.com`) {
  const account = await upsertAccount(db, `supabase-${email}`, email)
  if (name) await setName(db, account.id, name)
  const token = await createSession(db, account.id)
  return { id: account.id, email, name, cookie: `orbit_session=${token}` }
}
type Person = Awaited<ReturnType<typeof person>>
async function world() {
  const owner = await person('Olive')
  const steward = await person('Sam')
  const member = await person('Mia')
  const ws = await createWorkspace(db, owner.id, `Harbour ${n}`)
  await db`UPDATE orbit.workspaces SET description = 'Secret purpose' WHERE id = ${ws.id}`
  await db`INSERT INTO orbit.memberships (user_id, workspace_id, role) VALUES (${steward.id}, ${ws.id}, 'admin'), (${member.id}, ${ws.id}, 'member')`
  return { ws, owner, steward, member }
}
const api = (path: string, who?: Person, init: RequestInit = {}) =>
  fetch(path, { ...init, redirect: 'manual', headers: { 'content-type': 'application/json', ...(who ? { cookie: who.cookie } : {}), ...init.headers } })
const page = async (path: string, who?: Person) => {
  const res = await api(path, who, { headers: { accept: 'text/html' } })
  return { status: res.status, location: res.headers.get('location'), headers: res.headers, html: await res.text() }
}
async function invite(wsId: string, by: Person, email: string, role: 'member' | 'admin') {
  const res = await api(`/api/workspaces/${wsId}/invitations`, by, { method: 'POST', body: JSON.stringify({ email, role }) })
  expect(res.status).toBe(201)
  return (await res.json()) as { id: string }
}
/** Text of the rendered page, tags removed (what a reader would see, roughly). */
const textOf = (html: string) => html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&#39;/g, '\'').replace(/\s+/g, ' ')

describe('what the server tells the page', () => {
  it('says which roles each person may offer: the owner both, a steward Member, a member none', async () => {
    const { ws, owner, steward, member } = await world()
    const rolesOf = async (p: Person) => (await (await api(`/api/workspaces/${ws.id}`, p)).json()).invitationRoles
    expect([await rolesOf(owner), await rolesOf(steward), await rolesOf(member)]).toEqual([['member', 'admin'], ['member'], []])
  })

  it('says which invitations each manager may withdraw: a steward not the owner’s Steward invitations', async () => {
    const { ws, owner, steward } = await world()
    await invite(ws.id, owner, 'future-steward@example.com', 'admin')
    await invite(ws.id, owner, 'future-member@example.com', 'member')
    const revocable = async (p: Person) => Object.fromEntries(
      (await (await api(`/api/workspaces/${ws.id}/invitations`, p)).json()).map((i: { email: string; revocable: boolean }) => [i.email, i.revocable]))
    expect(await revocable(owner)).toEqual({ 'future-steward@example.com': true, 'future-member@example.com': true })
    expect(await revocable(steward)).toEqual({ 'future-steward@example.com': false, 'future-member@example.com': true })
  })
})

describe('autofill', () => {
  /** The opening tag of the element with this id, from rendered HTML. */
  const tagOf = (html: string, pattern: RegExp) => html.match(pattern)?.[0] ?? ''

  it('never offers your own details for the person you invite, with standard signals only', async () => {
    const { ws, owner } = await world()
    const { html } = await page(`/w/${ws.id}/people`, owner)
    const input = tagOf(html, /<input[^>]*id="invite-email"[^>]*>/)
    expect(input).toContain('autocomplete="off"')
    expect(input).toContain('name="invitee"') // not "email": not matched to your own address
    expect(input).toContain('type="email"') // still an email keyboard and validation
    expect(input).toContain('autocapitalize="none"')
    expect(input).toContain('spellcheck="false"')
    expect(tagOf(html, /<form[^>]*>(?=\s*<h2 id="invite-title")/)).toContain('autocomplete="off"')
    expect(textOf(html)).toContain('Their email address')
  })

  it('keeps helpful autofill where it is your own: signing in and your name', async () => {
    const signIn = await page('/sign-in')
    expect(tagOf(signIn.html, /<input[^>]*id="email"[^>]*>/)).toContain('autocomplete="email"')
    const newcomer = await person(null)
    const welcome = await page('/welcome', newcomer)
    expect(tagOf(welcome.html, /<input[^>]*id="name"[^>]*>/)).toContain('autocomplete="name"')
  })
})

describe('the People page', () => {
  it('lets the owner invite as Member or Steward, and shows their pending invitations with links and withdrawal', async () => {
    const { ws, owner } = await world()
    await invite(ws.id, owner, 'pending@example.com', 'admin')
    const { status, html } = await page(`/w/${ws.id}/people`, owner)
    expect(status).toBe(200)
    const text = textOf(html)
    expect(text).toContain('Invite someone')
    expect(text).toContain('Create invitation')
    expect(html).toMatch(/name="invite-role"[^>]*value="admin"/) // the Steward choice is offered
    expect(text).toContain('Invited')
    expect(text).toContain('pending@example.com Steward')
    expect(text).toContain('Copy link')
    expect(text).toContain('Withdraw')
    expect(text).not.toMatch(/email (was|has been) sent|we('|’)ve emailed/i) // Orbit sends no email
  })

  it('lets a steward invite Members only, and withdraw only what they may', async () => {
    const { ws, owner, steward } = await world()
    await invite(ws.id, owner, 'owners-steward@example.com', 'admin')
    const { html } = await page(`/w/${ws.id}/people`, steward)
    const text = textOf(html)
    expect(text).toContain('Invite someone')
    expect(html).not.toMatch(/name="invite-role"/)
    expect(text).toContain('They’ll join as a Member.')
    expect(text).toContain('owners-steward@example.com Steward')
    expect(text).not.toContain('Withdraw') // the owner's Steward invitation isn't theirs to withdraw
  })

  it('shows members no invitation action and no pending invitations at all', async () => {
    const { ws, owner, member } = await world()
    await invite(ws.id, owner, 'hidden@example.com', 'member')
    const { status, html } = await page(`/w/${ws.id}/people`, member)
    expect(status).toBe(200)
    const text = textOf(html)
    expect(text).not.toContain('Invite someone')
    expect(text).not.toContain('Invited')
    expect(html).not.toContain('hidden@example.com')
    expect(text).toContain('Everyone here belongs equally.')
  })
})

describe('an invitation’s page', () => {
  it('shows a signed-out visitor only the workspace’s name and the offered role, with a way to sign in that comes back here', async () => {
    const { ws, owner } = await world()
    const { id } = await invite(ws.id, owner, 'recipient@example.com', 'admin')
    const res = await page(`/invitations/${id}`)
    expect(res.status).toBe(200) // not sent to sign-in first
    expect(res.headers.get('cache-control')).toBe('private, no-store')
    expect(res.headers.get('x-robots-tag')).toBe('noindex')
    expect(res.headers.get('referrer-policy')).toBe('no-referrer')
    const text = textOf(res.html)
    expect(text).toContain(`You’ve been invited to join ${ws.name}`)
    expect(text).toMatch(/as a Steward ?\. You’ll belong here, take part and help look after it\./)
    // One clear way on, which keeps the link through sign-in
    expect(res.html).toMatch(new RegExp(`href="/sign-in\\?next=${encodeURIComponent(`/invitations/${id}`)}"[^>]*>\\s*Continue\\s*<`))
    expect(text).toContain('with the email address this invitation was sent to')
    // Nothing private, anywhere in the page (its data payload included)
    for (const secret of ['recipient@example.com', owner.email, 'Olive', 'Secret purpose', ws.id]) expect(res.html).not.toContain(secret)
  })

  it('shows anything that can’t be accepted the same way to a signed-out visitor, naming nothing', async () => {
    const { ws, owner } = await world()
    const { id } = await invite(ws.id, owner, 'gone@example.com', 'member')
    await api(`/api/invitations/${id}/revoke`, owner, { method: 'POST' })
    const pages = []
    for (const target of [id, '00000000-0000-0000-0000-000000000000', 'not-an-id']) {
      const res = await page(`/invitations/${target}`)
      expect(res.status).toBe(200)
      expect(res.html).not.toContain(ws.name)
      pages.push(textOf(res.html).match(/This invitation isn’t available[^<]*?happened\./)?.[0])
    }
    expect(pages[0]).toBeTruthy()
    expect(new Set(pages).size).toBe(1)
  })

  it('lets the recipient accept or decline; someone else is told it was sent to another address, nothing more', async () => {
    const { ws, owner } = await world()
    const recipient = await person('Rae', 'rae@example.com')
    const other = await person('Oz', 'oz@example.com')
    const { id } = await invite(ws.id, owner, recipient.email, 'member')

    const mine = textOf((await page(`/invitations/${id}`, recipient)).html)
    expect(mine).toContain(`You’re ready to join ${ws.name}`)
    expect(mine).toMatch(/as a Member ?\. You’ll belong here and take part\./) // the same words as before signing in
    expect(mine).toContain('Accept')
    expect(mine).toContain('Decline')
    expect(mine).not.toContain('You’ve been invited') // the next step, not the same screen again
    // Arriving signed in never answers it: still pending, and the recipient isn't a member
    const [row] = await db`SELECT accepted_at, declined_at FROM orbit.invitations WHERE id = ${id}`
    expect(row).toEqual({ accepted_at: null, declined_at: null })
    expect(await db`SELECT 1 FROM orbit.memberships WHERE user_id = ${recipient.id} AND workspace_id = ${ws.id}`).toHaveLength(0)

    const theirs = await page(`/invitations/${id}`, other)
    const text = textOf(theirs.html)
    expect(text).toContain('sent to a different email address')
    expect(text).toContain('Sign in with another address')
    expect(text).not.toContain('Accept')
    for (const secret of [recipient.email, 'Secret purpose', 'Olive']) expect(theirs.html).not.toContain(secret)
  })

  it('tells the recipient honestly when it was accepted, declined, withdrawn, expired or no longer stands', async () => {
    const { ws, owner, steward } = await world()
    const recipient = await person('Rex')
    const textFor = async (id: string) => textOf((await page(`/invitations/${id}`, recipient)).html)

    const declined = await invite(ws.id, owner, recipient.email, 'member')
    await api(`/api/invitations/${declined.id}/decline`, recipient, { method: 'POST' })
    expect(await textFor(declined.id)).toContain('You declined this invitation.')

    const revoked = await invite(ws.id, owner, recipient.email, 'member')
    await api(`/api/invitations/${revoked.id}/revoke`, owner, { method: 'POST' })
    expect(await textFor(revoked.id)).toContain('This invitation was withdrawn.')

    const expired = await invite(ws.id, owner, recipient.email, 'member')
    await db.unsafe('RESET ROLE')
    await db`UPDATE orbit.invitations SET created_at = created_at - interval '15 days', expires_at = expires_at - interval '15 days' WHERE id = ${expired.id}`
    await db.unsafe('SET ROLE orbit_app')
    expect(await textFor(expired.id)).toContain('This invitation has expired.')

    const stale = await invite(ws.id, owner, recipient.email, 'admin')
    await db.unsafe('RESET ROLE')
    await db`UPDATE orbit.workspaces SET owner_id = ${steward.id} WHERE id = ${ws.id}` // a future transfer
    await db.unsafe('SET ROLE orbit_app')
    expect(await textFor(stale.id)).toContain('can no longer be accepted as it was offered')
    await api(`/api/invitations/${stale.id}/decline`, recipient, { method: 'POST' })

    const accepted = await invite(ws.id, steward, recipient.email, 'member')
    await api(`/api/invitations/${accepted.id}/accept`, recipient, { method: 'POST' })
    const text = await textFor(accepted.id)
    expect(text).toContain(`You’ve accepted this invitation, so you belong to ${ws.name}.`)
    expect(text).toContain(`Open ${ws.name}`)
  })

  it('keeps the link through the name question for someone new, and through sign-in', async () => {
    const { ws, owner } = await world()
    const newcomer = await person(null, 'new@example.com')
    const { id } = await invite(ws.id, owner, newcomer.email, 'member')
    const path = `/invitations/${id}`

    const asked = await page(path, newcomer)
    expect([asked.status, asked.location]).toEqual([302, `/welcome?back=${encodeURIComponent(path)}`])
    // Once signed in (here: a named account opening sign-in with the link), sign-in leads back to it.
    const named = await person('Nia')
    const back = await page(`/sign-in?next=${encodeURIComponent(path)}`, named)
    expect([back.status, back.location]).toEqual([302, path])
  })
})

describe('the whole journey, over HTTP', () => {
  it('invite → open → accept → appear in People', async () => {
    const { ws, owner } = await world()
    const recipient = await person('Ines', 'ines@example.com')
    const { id } = await invite(ws.id, owner, recipient.email, 'admin')
    expect((await page(`/invitations/${id}`)).status).toBe(200) // the link, opened signed out

    const accepted = await api(`/api/invitations/${id}/accept`, recipient, { method: 'POST' })
    expect(await accepted.json()).toEqual({ workspaceId: ws.id, joined: true, role: 'admin' })

    const people = textOf((await page(`/w/${ws.id}/people`, recipient)).html)
    expect(people).toContain('Ines (you) Steward')
    expect(people).toContain('Olive Owner')
    // …and the invitation has left the owner's pending list
    expect(textOf((await page(`/w/${ws.id}/people`, owner)).html)).not.toContain('ines@example.com')
  })
})

describe('changing someone’s place from People', () => {
  const menusOf = (html: string) => [...html.matchAll(/aria-label="Options for ([^"]+)"/g)].map((m) => m[1])
  /** Sends exactly what the page sends (membershipRequest), as `who`. */
  const act = async (who: Person, wsId: string, memberId: string, action: 'promote' | 'demote' | 'remove') => {
    const request = membershipRequest(wsId, memberId, action)
    return api(request.path, who, { method: request.method, ...(request.body ? { body: JSON.stringify(request.body) } : {}) })
  }
  const membershipOf = async (p: Person, wsId: string) =>
    (await db`SELECT id FROM orbit.memberships WHERE user_id = ${p.id} AND workspace_id = ${wsId}`)[0]?.id as string

  it('offers a menu only where the server offers an action: never for yourself or the owner, never to members', async () => {
    const { ws, owner, steward, member } = await world()
    expect(menusOf((await page(`/w/${ws.id}/people`, owner)).html).sort()).toEqual(['Mia', 'Sam'])
    expect(menusOf((await page(`/w/${ws.id}/people`, steward)).html)).toEqual(['Mia'])
    expect(menusOf((await page(`/w/${ws.id}/people`, member)).html)).toEqual([])
    // A member the owner has offered stewardship to: the steward's menu for them disappears
    await invite(ws.id, owner, member.email, 'admin')
    expect(menusOf((await page(`/w/${ws.id}/people`, steward)).html)).toEqual([])
  })

  it('makes someone a Steward or a Member with exactly the page’s requests, and People shows it after', async () => {
    const { ws, owner, steward, member } = await world()
    expect((await act(owner, ws.id, await membershipOf(member, ws.id), 'promote')).status).toBe(200)
    expect((await act(owner, ws.id, await membershipOf(steward, ws.id), 'demote')).status).toBe(200)
    const text = textOf((await page(`/w/${ws.id}/people`, owner)).html)
    expect(text).toContain('Mia Steward')
    expect(text).toContain('Sam Member')
    expect(text).toContain('Olive (you) Owner') // the owner is untouched
  })

  it('removes someone, who then no longer appears; their pending invitation here is withdrawn', async () => {
    const { ws, owner, steward, member } = await world()
    const { id } = await invite(ws.id, owner, member.email, 'member')
    const res = await act(steward, ws.id, await membershipOf(member, ws.id), 'remove')
    expect(res.status).toBe(204)
    expect(textOf((await page(`/w/${ws.id}/people`, owner)).html)).not.toContain('Mia')
    expect((await db`SELECT revoked_by FROM orbit.invitations WHERE id = ${id}`)[0]!.revoked_by).toBe(steward.id)
    expect((await page(`/w/${ws.id}/people`, member)).status).toBe(404) // and they can no longer reach it
  })

  it('answers stale or conflicting changes with the reasons the page explains, changing nothing', async () => {
    const { ws, owner, steward, member } = await world()
    const mia = await membershipOf(member, ws.id)
    const reason = async (res: Response) => ({ status: res.status, reason: (await res.json()).data?.reason })

    await invite(ws.id, owner, member.email, 'admin') // offered stewardship after the steward's page loaded
    expect(await reason(await act(steward, ws.id, mia, 'remove'))).toEqual({ status: 409, reason: 'stewardship_offered' })

    await db`UPDATE orbit.memberships SET role = 'admin' WHERE id = ${mia}` // became a steward meanwhile
    expect(await reason(await act(steward, ws.id, mia, 'remove'))).toEqual({ status: 403, reason: 'forbidden' }) // stewards never remove stewards

    await db`UPDATE orbit.memberships SET role = 'member' WHERE user_id = ${steward.id} AND workspace_id = ${ws.id}` // the steward lost the role
    expect(await reason(await act(steward, ws.id, await membershipOf(owner, ws.id), 'remove'))).toEqual({ status: 403, reason: 'forbidden' })

    expect((await act(owner, ws.id, mia, 'remove')).status).toBe(204)
    expect(await reason(await act(owner, ws.id, mia, 'remove'))).toEqual({ status: 404, reason: 'not_found' }) // already gone
    expect((await db`SELECT owner_id FROM orbit.workspaces WHERE id = ${ws.id}`)[0]!.owner_id).toBe(owner.id) // ownership never moves
  })
})

describe('handing ownership on from People', () => {
  const menusOf = (html: string) => [...html.matchAll(/aria-label="Options for ([^"]+)"/g)].map((m) => m[1])
  const membershipOf = async (p: Person, wsId: string) =>
    (await db`SELECT id FROM orbit.memberships WHERE user_id = ${p.id} AND workspace_id = ${wsId}`)[0]?.id as string
  /** Sends exactly what the page sends (ownershipRequest): a POST with no body. */
  const transfer = (who: Person, wsId: string, memberId: string) => {
    const request = ownershipRequest(wsId, memberId)
    expect(request.body).toBeUndefined()
    return api(request.path, who, { method: request.method })
  }
  const membersAs = async (who: Person, wsId: string) =>
    (await (await api(`/api/workspaces/${wsId}`, who)).json()).members as { name: string | null; transferable: boolean; actions: string[] }[]

  it('is offered to the owner only, for everyone else (transferable), and nowhere else', async () => {
    const { ws, owner, steward, member } = await world()
    const transferableFor = async (who: Person) => Object.fromEntries((await membersAs(who, ws.id)).map((m) => [m.name, m.transferable]))
    expect(await transferableFor(owner)).toEqual({ Olive: false, Sam: true, Mia: true })
    expect(await transferableFor(steward)).toEqual({ Olive: false, Sam: false, Mia: false })
    expect(await transferableFor(member)).toEqual({ Olive: false, Sam: false, Mia: false })
  })

  it('moves ownership with exactly the page’s request; People then shows the new owner, and each person’s menus follow', async () => {
    const { ws, owner, member } = await world()
    await invite(ws.id, owner, 'future-steward@example.com', 'admin')
    const keep = await invite(ws.id, owner, 'future-member@example.com', 'member')

    const res = await transfer(owner, ws.id, await membershipOf(member, ws.id))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ revokedInvitations: 1 }) // what the page tells the former owner

    // As the former owner now sees People: Mia owns it, they are a Steward, and they manage no one.
    const asFormer = await page(`/w/${ws.id}/people`, owner)
    expect(textOf(asFormer.html)).toContain('Olive (you) Steward')
    expect(textOf(asFormer.html)).toContain('Mia Owner')
    expect(menusOf(asFormer.html)).toEqual([])
    // As the new owner sees it: menus for everyone else, the former owner included.
    const asOwner = await page(`/w/${ws.id}/people`, member)
    expect(textOf(asOwner.html)).toContain('Mia (you) Owner')
    expect(menusOf(asOwner.html).sort()).toEqual(['Olive', 'Sam'])
    expect((await membersAs(member, ws.id)).filter((m) => m.transferable).map((m) => m.name).sort()).toEqual(['Olive', 'Sam'])
    // The Member invitation is still pending; the Steward invitation is gone from the list.
    const pending = ((await (await api(`/api/workspaces/${ws.id}/invitations`, member)).json()) as { id: string; status: string }[])
      .filter((i) => i.status === 'pending').map((i) => i.id)
    expect(pending).toEqual([keep.id])
  })

  it('answers a stale page and a recipient who has left with the reasons the page explains', async () => {
    const { ws, owner, steward, member } = await world()
    const reason = async (res: Response) => ({ status: res.status, reason: (await res.json()).data?.reason })
    const mia = await membershipOf(member, ws.id)
    expect((await transfer(owner, ws.id, await membershipOf(steward, ws.id))).status).toBe(200)
    expect(await reason(await transfer(owner, ws.id, mia))).toEqual({ status: 403, reason: 'forbidden' }) // a page from before
    expect((await api(`/api/workspaces/${ws.id}/members/${mia}`, steward, { method: 'DELETE' })).status).toBe(204)
    expect(await reason(await transfer(steward, ws.id, mia))).toEqual({ status: 404, reason: 'not_found' }) // gone meanwhile
  })

  it('shows someone without a name as People always has, and can still hand them ownership', async () => {
    const { ws, owner } = await world()
    const unnamed = await person(null)
    await db`INSERT INTO orbit.memberships (user_id, workspace_id, role) VALUES (${unnamed.id}, ${ws.id}, 'member')`
    const before = await page(`/w/${ws.id}/people`, owner)
    expect(textOf(before.html)).toContain('No name yet Member')
    expect(menusOf(before.html)).toContain('this person')
    expect(before.html).not.toContain(unnamed.email) // never an address instead
    expect((await transfer(owner, ws.id, await membershipOf(unnamed, ws.id))).status).toBe(200)
    expect(textOf((await page(`/w/${ws.id}/people`, owner)).html)).toContain('No name yet Owner')
  })

  it('shows two people with the same name alike, as People always has: only their role can tell them apart', async () => {
    const { ws, owner } = await world()
    const [samA, samB] = [await person('Sam'), await person('Sam')]
    await db`INSERT INTO orbit.memberships (user_id, workspace_id, role) VALUES (${samA.id}, ${ws.id}, 'member'), (${samB.id}, ${ws.id}, 'member')`
    const html = (await page(`/w/${ws.id}/people`, owner)).html
    expect(menusOf(html).filter((name) => name === 'Sam')).toHaveLength(3) // the steward Sam, and two Member Sams
    for (const p of [samA, samB]) expect(html).not.toContain(p.email)
    // The page names the membership whose menu was opened, so the right Sam receives ownership.
    expect((await transfer(owner, ws.id, await membershipOf(samB, ws.id))).status).toBe(200)
    expect((await db`SELECT owner_id FROM orbit.workspaces WHERE id = ${ws.id}`)[0]!.owner_id).toBe(samB.id)
  })
})
