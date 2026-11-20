// Authorization boundaries and the email-code sign-in over real HTTP against a built Orbit server.
// PostgreSQL is an in-process PGlite with the real migrations (test/db.ts); Supabase Auth is a
// local fake (test/fake-supabase.ts). No test sends email or reaches the network.
import { fileURLToPath } from 'node:url'
import { fetch, setup } from '@nuxt/test-utils/e2e'
import { afterAll, describe, expect, it } from 'vitest'
import { SESSION_TTL_MS, createSession, setName, upsertAccount } from '../server/utils/accounts'
import { createWorkspace as createWorkspaceFor } from '../server/utils/workspaces'
import { startTestDatabase } from './db'
import { EMAIL_CAP_REACHED, SEND_FAILS, startFakeSupabase } from './fake-supabase'

const supabase = await startFakeSupabase()
const testDb = await startTestDatabase({ asApp: true }) // the server runs as orbit_app, as on Netlify
afterAll(async () => {
  supabase.close()
  await testDb.close()
})

process.env.NUXT_DATABASE_URL = testDb.url
process.env.NUXT_SUPABASE_URL = supabase.url
process.env.NUXT_SUPABASE_KEY = 'sb_publishable_test'

await setup({ rootDir: fileURLToPath(new URL('..', import.meta.url)), server: true, browser: false })

const db = testDb.sql
const ada = await setName(db, (await upsertAccount(db, 'supabase-ada', 'ada@example.com')).id, 'Ada')
const grace = await setName(db, (await upsertAccount(db, 'supabase-grace', 'grace@example.com')).id, 'Grace')
const adaLaptop = `orbit_session=${await createSession(db, ada.id)}`
const adaPhone = `orbit_session=${await createSession(db, ada.id)}`
const graceLaptop = `orbit_session=${await createSession(db, grace.id)}`

const api = (path: string, cookie?: string, init: RequestInit = {}) =>
  fetch(path, {
    ...init,
    redirect: 'manual',
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...init.headers },
  })
const createWorkspace = (cookie: string | undefined, name: string) =>
  api('/api/workspaces', cookie, { method: 'POST', body: JSON.stringify({ name }) })

describe('signed-out visitors', () => {
  it('cannot create, list or read workspaces', async () => {
    expect((await createWorkspace(undefined, 'Sneaky')).status).toBe(401)
    expect((await api('/api/workspaces')).status).toBe(401)
    expect((await api('/api/workspaces/anything')).status).toBe(401)
    expect(await db`SELECT 1 FROM orbit.workspaces`).toHaveLength(0)
  })

  it('are sent to sign-in from any page, remembering where they were going', async () => {
    for (const [path, location] of [['/', '/sign-in'], ['/w/anything', '/sign-in?next=%2Fw%2Fanything']]) {
      const res = await api(path)
      expect(res.status).toBe(302)
      expect(res.headers.get('location')).toBe(location)
    }
    expect((await api('/sign-in')).status).toBe(200)
  })

  it('are rejected with a forged or expired session', async () => {
    const expired = `orbit_session=${await createSession(db, ada.id, Date.now() - SESSION_TTL_MS - 1)}`
    for (const cookie of ['orbit_session=forged', expired]) {
      expect((await api('/api/workspaces', cookie)).status).toBe(401)
    }
  })
})

describe('signed-in accounts', () => {
  it('make their creator the admin, linked to the authenticated account', async () => {
    const res = await createWorkspace(adaLaptop, 'Analytical Engines')
    expect(res.status).toBe(201)
    const workspace = await res.json()
    expect(workspace.role).toBe('admin')

    expect([...await db`SELECT user_id, role FROM orbit.memberships WHERE workspace_id = ${workspace.id}`])
      .toEqual([{ user_id: ada.id, role: 'admin' }])
  })

  it('reach the same workspace from another browser', async () => {
    const [mine] = await (await api('/api/workspaces', adaLaptop)).json()
    expect(await (await api('/api/workspaces', adaPhone)).json()).toEqual([mine])
    expect((await api(`/api/workspaces/${mine.id}`, adaPhone)).status).toBe(200)
  })

  it('cannot reach another account’s workspace by its URL', async () => {
    const [adas] = await (await api('/api/workspaces', adaLaptop)).json()
    expect((await api(`/api/workspaces/${adas.id}`, graceLaptop)).status).toBe(404)
    expect(await (await api('/api/workspaces', graceLaptop)).json()).toEqual([])
    const page = await api(`/w/${adas.id}`, graceLaptop, { headers: { accept: 'text/html' } })
    expect(page.status).toBe(404)
    const html = await page.text()
    expect(html).not.toContain('Analytical Engines')
    expect(html).toContain('This workspace is out of reach') // a confirmed 404 still says so
  })

  it('sign out one browser without affecting the other', async () => {
    const res = await api('/api/auth/sign-out', adaLaptop, { method: 'POST' })
    expect(res.status).toBe(204)
    expect(res.headers.get('set-cookie')).toMatch(/orbit_session=;/)
    expect((await api('/api/workspaces', adaLaptop)).status).toBe(401)
    expect((await api('/api/workspaces', adaPhone)).status).toBe(200)
  })
})

/** Minimal per-browser cookie jar: keeps the cookies a response sets. */
class Browser {
  readonly jar = new Map<string, string>()
  get cookie() {
    return [...this.jar].map(([k, v]) => `${k}=${v}`).join('; ') || undefined
  }

  async request(path: string, init: RequestInit = {}) {
    const res = await api(path, this.cookie, init)
    for (const line of res.headers.getSetCookie()) {
      const [pair, ...attrs] = line.split(';')
      const [name, value] = [pair!.slice(0, pair!.indexOf('=')), pair!.slice(pair!.indexOf('=') + 1)]
      const expired = !value || attrs.some((a) => /max-age=0\b/i.test(a.trim()))
      expired ? this.jar.delete(name) : this.jar.set(name, value)
    }
    return res
  }

  requestCode(email: string) {
    return this.request('/api/auth/code', { method: 'POST', body: JSON.stringify({ email }) })
  }

  verify(email: string, code: string | undefined) {
    return this.request('/api/auth/verify', { method: 'POST', body: JSON.stringify({ email, code }) })
  }
}

const statusMessage = async (res: Response) => (await res.json()).statusMessage as string

describe('requesting a code', () => {
  it('validates the email before contacting Supabase', async () => {
    const res = await new Browser().requestCode('nope')
    expect(res.status).toBe(422)
  })

  it('explains the resend cooldown and says how long to wait', async () => {
    const browser = new Browser()
    expect((await browser.requestCode('cooldown@example.com')).status).toBe(204)
    const again = await browser.requestCode('cooldown@example.com')
    expect(again.status).toBe(429)
    const body = await again.json()
    expect(body.statusMessage).toMatch(/^Please wait \d+ seconds before asking for another code\.$/)
    expect(body.data.retryAfter).toBeGreaterThan(0)
  })

  it('explains when Orbit has hit its email sending limit', async () => {
    const res = await new Browser().requestCode(EMAIL_CAP_REACHED)
    expect(res.status).toBe(429)
    expect(await statusMessage(res)).toMatch(/sent a lot of emails/)
  })

  it('reports a friendly error when sending fails', async () => {
    const res = await new Browser().requestCode(SEND_FAILS)
    expect(res.status).toBe(502)
    expect(await statusMessage(res)).toMatch(/couldn’t send a code/)
  })

  it('signs no one in by itself', async () => {
    const browser = new Browser()
    await browser.requestCode('lurker@example.com')
    expect(browser.cookie).toBeUndefined()
  })
})

describe('verifying a code', () => {
  it('signs a new person up, then lets them return from another browser', async () => {
    const laptop = new Browser()
    await laptop.requestCode('linus@example.com')
    const verified = await laptop.verify('Linus@Example.com ', supabase.codeFor('linus@example.com'))
    expect(verified.status).toBe(200)
    expect(await verified.json()).toEqual({ email: 'linus@example.com', name: null })
    expect(laptop.cookie).toMatch(/^orbit_session=/)
    expect(await (await laptop.request('/api/workspaces')).json()).toEqual([]) // → create workspace

    const created = await (await laptop.request('/api/workspaces', {
      method: 'POST',
      body: JSON.stringify({ name: 'Kernel' }),
    })).json()
    expect(created.role).toBe('admin')

    supabase.skipCooldown('linus@example.com')
    const desktop = new Browser()
    await desktop.requestCode('linus@example.com')
    await desktop.verify('linus@example.com', supabase.codeFor('linus@example.com'))
    expect(await (await desktop.request('/api/workspaces')).json()).toEqual([created])
    expect(await db`SELECT 1 FROM orbit.users WHERE email = 'linus@example.com'`).toHaveLength(1)
  })

  it('accepts a code only once', async () => {
    const browser = new Browser()
    await browser.requestCode('once@example.com')
    const code = supabase.codeFor('once@example.com')
    expect((await browser.verify('once@example.com', code)).status).toBe(200)
    const reused = await new Browser().verify('once@example.com', code)
    expect(reused.status).toBe(400)
  })

  it('rejects a wrong code without signing in, and accepts the right one afterwards', async () => {
    const browser = new Browser()
    await browser.requestCode('typo@example.com')
    const right = supabase.codeFor('typo@example.com')!
    const wrong = right === '000000' ? '111111' : '000000'

    const res = await browser.verify('typo@example.com', wrong)
    expect(res.status).toBe(400)
    expect(await statusMessage(res)).toBe('That code is incorrect or has expired. Check it, or send a new one.')
    expect(browser.cookie).toBeUndefined()

    expect((await browser.verify('typo@example.com', right)).status).toBe(200)
  })

  it('does not accept a code for a different address', async () => {
    const browser = new Browser()
    await browser.requestCode('owner@example.com')
    const res = await browser.verify('intruder@example.com', supabase.codeFor('owner@example.com'))
    expect(res.status).toBe(400)
    expect(browser.cookie).toBeUndefined()
  })

  it('validates the shape of the code before contacting Supabase', async () => {
    for (const code of ['', 'abc', '123', '12345678901']) {
      expect((await new Browser().verify('ada@example.com', code)).status).toBe(422)
    }
  })
})

describe('what should we call you?', () => {
  const putName = (browser: Browser, name: unknown) =>
    browser.request('/api/me', { method: 'PUT', body: JSON.stringify({ name }) })
  const signIn = async (email: string) => {
    const browser = new Browser()
    await browser.requestCode(email)
    await browser.verify(email, supabase.codeFor(email))
    return browser
  }
  const location = async (browser: Browser, path: string) => {
    const res = await browser.request(path)
    return res.status === 302 ? res.headers.get('location') : res.status
  }

  it('is asked once, right after the first sign-in, before any workspace', async () => {
    const browser = await signIn('newcomer@example.com')
    expect(await (await browser.request('/api/me')).json()).toEqual({ email: 'newcomer@example.com', name: null })
    expect(await location(browser, '/')).toBe('/welcome')
    expect(await location(browser, '/w/anything')).toBe('/welcome?back=%2Fw%2Fanything')
    expect(await location(browser, '/welcome')).toBe(200)

    const saved = await putName(browser, '  Linnea  ')
    expect(saved.status).toBe(200)
    expect(await saved.json()).toEqual({ email: 'newcomer@example.com', name: 'Linnea' })

    expect(await location(browser, '/welcome')).toBe('/') // never asked again
    expect(await location(browser, '/')).toBe(200) // → create workspace
    const home = await (await browser.request('/')).text()
    expect(home).toContain('Create your workspace') // a confirmed-empty list still offers it
    expect(home).not.toContain('We couldn’t reach your workspaces')
  })

  it('is skipped by returning people who already answered, in any browser', async () => {
    await putName(await signIn('regular@example.com'), 'Signe')
    supabase.skipCooldown('regular@example.com')
    const otherBrowser = await signIn('regular@example.com')
    expect(await (await otherBrowser.request('/api/me')).json()).toEqual({ email: 'regular@example.com', name: 'Signe' })
    expect(await location(otherBrowser, '/')).toBe(200)
  })

  it('is asked of existing people without a name, keeping their workspace and role', async () => {
    const veteran = await upsertAccount(db, 'supabase-veteran', 'veteran@example.com')
    const workspace = await createWorkspaceFor(db, veteran.id, 'Before Names')
    const browser = new Browser()
    browser.jar.set('orbit_session', await createSession(db, veteran.id))

    expect(await location(browser, `/w/${workspace.id}`)).toBe(`/welcome?back=%2Fw%2F${workspace.id}`)
    await putName(browser, 'Veteran')
    expect(await location(browser, `/w/${workspace.id}`)).toBe(200)
    expect(await (await browser.request(`/api/workspaces/${workspace.id}`)).json())
      .toEqual({ ...workspace, members: [{ id: expect.any(String), name: 'Veteran', you: true, role: 'admin', owner: true, actions: [] }], invitationRoles: ['member', 'admin'] })
  })

  it('only ever changes the signed-in person’s own name', async () => {
    const browser = await signIn('own@example.com')
    await putName(browser, 'Own')
    expect((await db`SELECT display_name FROM orbit.users WHERE id = ${grace.id}`)[0]!.display_name).toBe('Grace')
  })

  it('requires a session and a usable name', async () => {
    expect((await api('/api/me', undefined, { method: 'PUT', body: JSON.stringify({ name: 'Nobody' }) })).status).toBe(401)

    const browser = await signIn('picky@example.com')
    for (const name of ['', '   ', 'a'.repeat(81), 42]) {
      const res = await putName(browser, name)
      expect(res.status).toBe(422)
    }
    expect(await (await browser.request('/api/me')).json()).toEqual({ email: 'picky@example.com', name: null })
  })
})

// The sign-in page and the name question navigate to the remembered destination in the browser;
// here, the server-rendered middleware is checked to carry and honour it the same way.
describe('returning after sign-in', () => {
  const html = { headers: { accept: 'text/html' } }
  const location = async (browser: Browser | undefined, path: string) => {
    const res = browser ? await browser.request(path, html) : await api(path, undefined, html)
    return res.status === 302 ? res.headers.get('location') : res.status
  }
  const signIn = async (email: string) => {
    const browser = new Browser()
    await browser.requestCode(email)
    await browser.verify(email, supabase.codeFor(email))
    return browser
  }
  const giveName = (browser: Browser, name: string) => browser.request('/api/me', { method: 'PUT', body: JSON.stringify({ name }) })
  const named = async (email: string, name: string) => {
    const browser = await signIn(email)
    await giveName(browser, name)
    return browser
  }

  it('brings a returning person back to the page they opened, path and query intact', async () => {
    const person = await named('returner@example.com', 'Rhea')
    const [{ id }] = await db<{ id: string }[]>`SELECT id FROM orbit.users WHERE email = 'returner@example.com'`
    const ws = await createWorkspaceFor(db, id!, 'Return Trip')
    const destination = `/w/${ws.id}/people?tab=stewards&q=caf%C3%A9`

    const signInAt = await location(undefined, destination)
    expect(signInAt).toBe(`/sign-in?next=${encodeURIComponent(destination)}`)
    expect(new URL(signInAt as string, 'http://orbit.test').searchParams.get('next')).toBe(destination)

    expect(await location(person, signInAt as string)).toBe(destination)
    expect(await location(person, destination)).toBe(200) // and nothing else in the way
  })

  it('keeps it through the name question for someone new, then returns there, which still has to let them in', async () => {
    const host = await upsertAccount(db, 'supabase-return-host', 'return-host@example.com')
    const ws = await createWorkspaceFor(db, host.id, 'Somewhere Else')
    const destination = `/w/${ws.id}?from=link`
    const signInAt = await location(undefined, destination)

    const newcomer = await signIn('first-timer@example.com')
    const welcomeAt = await location(newcomer, signInAt as string)
    expect(welcomeAt).toBe(`/welcome?back=${encodeURIComponent(destination)}`)
    expect(await location(newcomer, destination)).toBe(welcomeAt) // the same from the page itself
    expect(await location(newcomer, welcomeAt as string)).toBe(200)

    await giveName(newcomer, 'Fia')
    expect(await location(newcomer, welcomeAt as string)).toBe(destination)

    // Arriving is not belonging: the destination is authorized on its own, as always
    expect(await location(newcomer, destination)).toBe(404)
    expect((await newcomer.request(`/api/workspaces/${ws.id}`)).status).toBe(404)
  })

  it('leaves signing in directly, and changing your name, exactly as they were', async () => {
    expect(await location(undefined, '/sign-in')).toBe(200)
    expect(await location(undefined, '/')).toBe('/sign-in')
    expect(await location(undefined, '/welcome?back=%2Fw%2Fx')).toBe('/sign-in')

    const person = await named('direct@example.com', 'Dara')
    expect(await location(person, '/sign-in')).toBe('/')
    expect(await location(person, '/welcome')).toBe('/')
    expect(await location(person, '/welcome?change=1&back=%2Fw%2Fx')).toBe(200)

    const newcomer = await signIn('direct-new@example.com')
    expect(await location(newcomer, '/sign-in')).toBe('/welcome')
    expect(await location(newcomer, '/')).toBe('/welcome')
  })

  it('never sends anyone outside Orbit, whatever the link says', async () => {
    const person = await named('careful@example.com', 'Cato')
    const newcomer = await signIn('careful-new@example.com')
    const attempts = [
      'https://evil.example', '//evil.example', '/\\evil.example', '\\\\evil.example', '/%2F%2Fevil.example',
      '/%5Cevil.example', 'javascript:alert(1)', '/w/%zz', ' /w/x', '/w/x\r\nSet-Cookie: a=b',
    ]
    for (const attempt of attempts) {
      const q = encodeURIComponent(attempt)
      expect(await location(undefined, `/sign-in?next=${q}`), attempt).toBe(200) // the page works; it just won't follow it
      expect(await location(person, `/sign-in?next=${q}`), attempt).toBe('/')
      expect(await location(person, `/welcome?back=${q}`), attempt).toBe('/')
      expect(await location(newcomer, `/sign-in?next=${q}`), attempt).toBe('/welcome')
    }
    expect(await location(person, '/sign-in?next=%2Fnew&next=%2Fw%2Fx'), 'two destinations').toBe('/')
  })

  it('never loops through sign-in or the name question', async () => {
    const person = await named('loop@example.com', 'Lo')
    const newcomer = await signIn('loop-new@example.com')
    for (const step of ['/sign-in', '/sign-in?next=%2Fw%2Fx', '/welcome', '/welcome?back=%2Fsign-in', '/SIGN-IN/', '/w/../sign-in']) {
      const q = encodeURIComponent(step)
      expect(await location(undefined, `/sign-in?next=${q}`), step).toBe(200)
      expect(await location(person, `/sign-in?next=${q}`), step).toBe('/')
      expect(await location(person, `/welcome?back=${q}`), step).toBe('/')
      expect(await location(newcomer, `/sign-in?next=${q}`), step).toBe('/welcome')
      expect(await location(newcomer, `/welcome?back=${q}`), step).toBe(200)
    }
  })
})

describe('workspace arrival', () => {
  it('shows who is actually here, by name only, to members only', async () => {
    const owner = await setName(db, (await upsertAccount(db, 'supabase-host', 'host@example.com')).id, 'Host')
    const guest = await setName(db, (await upsertAccount(db, 'supabase-guest', 'guest@example.com')).id, 'Guest')
    const outsider = await setName(db, (await upsertAccount(db, 'supabase-outsider', 'outsider@example.com')).id, 'Outsider')
    const ws = await createWorkspaceFor(db, owner.id, 'Observatory')
    const ownerCookie = `orbit_session=${await createSession(db, owner.id)}`

    const alone = await (await api(`/api/workspaces/${ws.id}`, ownerCookie)).json()
    expect(alone.members).toEqual([{ id: expect.any(String), name: 'Host', you: true, role: 'admin', owner: true, actions: [] }])

    await db`INSERT INTO orbit.memberships (user_id, workspace_id, role) VALUES (${guest.id}, ${ws.id}, 'member')`
    const together = await (await api(`/api/workspaces/${ws.id}`, ownerCookie)).json()
    expect(together.members).toEqual([{ id: expect.any(String), name: 'Host', you: true, role: 'admin', owner: true, actions: [] }, { id: expect.any(String), name: 'Guest', you: false, role: 'member', owner: false, actions: ['promote', 'remove'] }])
    expect(JSON.stringify(together)).not.toContain('@') // no emails

    const outsiderCookie = `orbit_session=${await createSession(db, outsider.id)}`
    expect((await api(`/api/workspaces/${ws.id}`, outsiderCookie)).status).toBe(404)
  })

  it('lets the owner and stewards change the purpose in a dialog that stays closed, and members only read it', async () => {
    const owner = await setName(db, (await upsertAccount(db, 'supabase-purpose-owner', 'purpose-owner@example.com')).id, 'Pia')
    const steward = await setName(db, (await upsertAccount(db, 'supabase-purpose-steward', 'purpose-steward@example.com')).id, 'Sol')
    const member = await setName(db, (await upsertAccount(db, 'supabase-purpose-member', 'purpose-member@example.com')).id, 'Max')
    const ws = await createWorkspaceFor(db, owner.id, 'Purposeful')
    await db`INSERT INTO orbit.memberships (user_id, workspace_id, role) VALUES (${member.id}, ${ws.id}, 'member'), (${steward.id}, ${ws.id}, 'admin')`
    const arrival = async (userId: string) =>
      (await api(`/w/${ws.id}`, `orbit_session=${await createSession(db, userId)}`, { headers: { accept: 'text/html' } })).text()
    const dialogs = (html: string) => [...html.matchAll(/<dialog([^>]*)>/g)].map(([, attrs]) => attrs!)

    // No purpose yet: the owner and stewards are invited to give one, members see nothing at all
    for (const editor of [owner, steward]) {
      const html = await arrival(editor.id)
      expect(html).toMatch(/<button[^>]*aria-haspopup="dialog"[^>]*>\s*What’s this place for\?\s*<\/button>/)
      expect(dialogs(html)).toHaveLength(1)
      expect(dialogs(html)[0]).toContain('aria-labelledby="purpose-title"')
      expect(dialogs(html)[0]).not.toMatch(/\bopen\b/) // closed: Arrival renders exactly as before
    }
    let asMember = await arrival(member.id)
    expect(asMember).not.toContain('What’s this place for')
    expect(dialogs(asMember)).toHaveLength(0)

    // With a purpose: everyone reads it; only those who can change it get the pencil, dialog closed
    await db`UPDATE orbit.workspaces SET description = 'Planning the spring launch' WHERE id = ${ws.id}`
    const asOwner = await arrival(owner.id)
    expect(asOwner).toContain('Planning the spring launch')
    expect(asOwner).toMatch(/<button[^>]*aria-haspopup="dialog"[^>]*aria-label="Edit what this place is for"/)
    expect(dialogs(asOwner)).toHaveLength(1)
    expect(dialogs(asOwner)[0]).not.toMatch(/\bopen\b/)
    expect(asOwner).not.toContain('>Remove<') // clearing is saving it empty, not a separate action
    asMember = await arrival(member.id)
    expect(asMember).toContain('Planning the spring launch')
    expect(asMember).not.toContain('Edit what this place is for')
    expect(dialogs(asMember)).toHaveLength(0)
  })

  it('lets named people reach "Change name", but sends them past the first-time question', async () => {
    const change = await api('/welcome?change=1', adaPhone) // adaLaptop was signed out above
    expect([change.status, change.headers.get('location')]).toEqual([200, null])
    const plain = await api('/welcome', adaPhone)
    expect(plain.status).toBe(302)
    expect(plain.headers.get('location')).toBe('/')
  })
})

describe('workspace settings', () => {
  const patch = (id: string, cookie: string | undefined, body: unknown) =>
    api(`/api/workspaces/${id}`, cookie, { method: 'PATCH', body: JSON.stringify(body) })

  it('lets the admin rename and describe, changing only what was sent', async () => {
    const admin = await setName(db, (await upsertAccount(db, 'supabase-settings-admin', 'sadmin@example.com')).id, 'Admin')
    const ws = await createWorkspaceFor(db, admin.id, 'Old name')
    const cookie = `orbit_session=${await createSession(db, admin.id)}`

    const described = await patch(ws.id, cookie, { description: '  A place for   planning ' })
    expect(described.status).toBe(200)
    expect(await described.json()).toMatchObject({ name: 'Old name', description: 'A place for planning' })

    const renamed = await (await patch(ws.id, cookie, { name: 'New name' })).json()
    expect(renamed).toMatchObject({ name: 'New name', description: 'A place for planning' })

    // Reflected wherever the workspace is read
    expect(await (await api(`/api/workspaces/${ws.id}`, cookie)).json()).toMatchObject({ name: 'New name', description: 'A place for planning' })
    expect((await (await api('/api/workspaces', cookie)).json())[0]).toMatchObject({ name: 'New name' })

    // Deliberate clearing, both ways, and what is actually stored is NULL, never ''
    const stored = async () => (await db`SELECT description FROM orbit.workspaces WHERE id = ${ws.id}`)[0]!.description
    expect(await (await patch(ws.id, cookie, { description: null })).json()).toMatchObject({ description: null })
    expect(await stored()).toBeNull()
    await patch(ws.id, cookie, { description: 'Back again' })
    expect(await stored()).toBe('Back again')
    expect(await (await patch(ws.id, cookie, { description: '' })).json()).toMatchObject({ description: null, name: 'New name' })
    expect(await stored()).toBeNull()
    expect((await patch(ws.id, cookie, { description: '   ' })).status).toBe(200)
    expect(await stored()).toBeNull()

    // And the database itself refuses an empty description, whatever the code does
    await expect(db`UPDATE orbit.workspaces SET description = '' WHERE id = ${ws.id}`).rejects.toMatchObject({ code: '23514' })
  })

  it('rejects unusable input without changing anything', async () => {
    const admin = await upsertAccount(db, 'supabase-settings-picky', 'picky-admin@example.com')
    const ws = await createWorkspaceFor(db, admin.id, 'Steady')
    const cookie = `orbit_session=${await createSession(db, admin.id)}`
    for (const body of [{ name: '' }, { name: 'a'.repeat(65) }, { description: 'a'.repeat(281) }, { description: 42 }, [], 'nope']) {
      expect((await patch(ws.id, cookie, body)).status).toBe(422)
    }
    expect(await (await api(`/api/workspaces/${ws.id}`, cookie)).json()).toMatchObject({ name: 'Steady', description: null })
  })

  it('is enforced on the server: members 403, outsiders 404, signed out 401', async () => {
    const admin = await upsertAccount(db, 'supabase-settings-owner', 'owner2@example.com')
    const member = await upsertAccount(db, 'supabase-settings-member', 'member2@example.com')
    const outsider = await upsertAccount(db, 'supabase-settings-outsider', 'outsider2@example.com')
    const ws = await createWorkspaceFor(db, admin.id, 'Guarded')
    await db`INSERT INTO orbit.memberships (user_id, workspace_id, role) VALUES (${member.id}, ${ws.id}, 'member')`
    await db`UPDATE orbit.workspaces SET description = 'For the guards' WHERE id = ${ws.id}`
    const memberCookie = `orbit_session=${await createSession(db, member.id)}`

    expect((await patch(ws.id, memberCookie, { name: 'Taken' })).status).toBe(403)
    expect((await patch(ws.id, `orbit_session=${await createSession(db, outsider.id)}`, { name: 'Taken' })).status).toBe(404)
    expect((await patch(ws.id, undefined, { name: 'Taken' })).status).toBe(401)

    // Members can still see it all
    const seen = await (await api(`/api/workspaces/${ws.id}`, memberCookie)).json()
    expect(seen).toMatchObject({ name: 'Guarded', description: 'For the guards', role: 'member' })
  })
  it('names the page honestly: admins get settings, members get "About this workspace"', async () => {
    const admin = await setName(db, (await upsertAccount(db, 'supabase-about-admin', 'about-admin@example.com')).id, 'Ada')
    const member = await setName(db, (await upsertAccount(db, 'supabase-about-member', 'about-member@example.com')).id, 'Grace')
    const ws = await createWorkspaceFor(db, admin.id, 'Honest Words')
    await db`INSERT INTO orbit.memberships (user_id, workspace_id, role) VALUES (${member.id}, ${ws.id}, 'member')`
    const html = async (userId: string) => {
      const res = await api(`/w/${ws.id}/settings`, `orbit_session=${await createSession(db, userId)}`, { headers: { accept: 'text/html' } })
      expect(res.status).toBe(200)
      return res.text()
    }

    const asAdmin = await html(admin.id)
    expect(asAdmin).toMatch(/<h1[^>]*>Workspace settings<\/h1>/)
    expect(asAdmin).toContain('<title>Settings · Honest Words · Orbit</title>')

    const asMember = await html(member.id)
    expect(asMember).toMatch(/<h1[^>]*>About this workspace<\/h1>/)
    expect(asMember).toContain('<title>About · Honest Words · Orbit</title>')
    expect(asMember).not.toContain('Workspace settings')
  })

  it('belongs to the owner as owner: with a member role, they still manage, on the server and on the page', async () => {
    const owner = await setName(db, (await upsertAccount(db, 'supabase-owner-as-member', 'owner-member@example.com')).id, 'Olu')
    const ws = await createWorkspaceFor(db, owner.id, 'Owned Outright')
    await db`UPDATE orbit.memberships SET role = 'member' WHERE user_id = ${owner.id} AND workspace_id = ${ws.id}`
    const cookie = `orbit_session=${await createSession(db, owner.id)}`

    expect(await (await api(`/api/workspaces/${ws.id}`, cookie)).json()).toMatchObject({ role: 'member', canManage: true })
    const saved = await patch(ws.id, cookie, { name: 'Still Owned' })
    expect(saved.status).toBe(200)
    expect(await saved.json()).toMatchObject({ name: 'Still Owned', role: 'member', canManage: true })

    const settings = await (await api(`/w/${ws.id}/settings`, cookie, { headers: { accept: 'text/html' } })).text()
    expect(settings).toMatch(/<h1[^>]*>Workspace settings<\/h1>/)
    expect(settings).toMatch(/<form[^>]*>/) // the editing form, not the read-only view
    expect(settings).not.toContain('Only the owner and stewards can change these')
  })
})

describe('moving between workspaces', () => {
  const html = { headers: { accept: 'text/html' } }
  /** A signed-in browser for a named person, with its own cookie jar. */
  async function browserFor(subject: string, name: string) {
    const person = await setName(db, (await upsertAccount(db, subject, `${subject}@example.com`)).id, name)
    const browser = new Browser()
    browser.jar.set('orbit_session', await createSession(db, person.id))
    return { person, browser }
  }
  const location = (res: Response) => [res.status, res.headers.get('location')]

  it('takes a person with one workspace straight to it', async () => {
    const { person, browser } = await browserFor('supabase-solo', 'Solo')
    const only = await createWorkspaceFor(db, person.id, 'Only One')
    expect(location(await browser.request('/', html))).toEqual([302, `/w/${only.id}`])
  })

  it('lets a person with a workspace create another, through the same journey and API', async () => {
    const { person, browser } = await browserFor('supabase-second', 'Second')
    const first = await createWorkspaceFor(db, person.id, 'First Place')

    const page = await browser.request('/new', html)
    expect(page.status).toBe(200) // not sent away, although they already have a workspace
    const markup = await page.text()
    expect(markup).toContain('Create another workspace')
    expect(markup).toContain('Workspace name')
    expect(markup).toContain('A new place for you and your people.')
    expect(markup).not.toContain('administrator') // no promise of a role Orbit hasn't modelled yet

    const created = await browser.request('/api/workspaces', { method: 'POST', body: JSON.stringify({ name: 'Second Place' }) })
    expect(created.status).toBe(201)
    const second = await created.json()
    expect(second.role).toBe('admin')

    const listed = await (await browser.request('/api/workspaces')).json()
    expect(listed.map((w: { id: string }) => w.id)).toEqual([second.id, first.id])
    expect([...await db`SELECT workspace_id, role FROM orbit.memberships WHERE user_id = ${person.id} ORDER BY created_at`])
      .toEqual([{ workspace_id: first.id, role: 'admin' }, { workspace_id: second.id, role: 'admin' }])
  })

  it('returns to the workspace last visited in this browser, and follows each switch', async () => {
    const { person, browser } = await browserFor('supabase-lin', 'Lin')
    const launch = await createWorkspaceFor(db, person.id, 'Launch')
    const garden = await createWorkspaceFor(db, person.id, 'Garden') // the most recent

    expect(location(await browser.request('/', html))).toEqual([302, `/w/${garden.id}`])

    // Switching is simply going there; the workspace page checks membership as always.
    expect((await browser.request(`/w/${launch.id}`, html)).status).toBe(200)
    expect(browser.jar.get('orbit_last_workspace')).toBe(launch.id)
    expect(location(await browser.request('/', html))).toEqual([302, `/w/${launch.id}`])

    expect((await browser.request(`/w/${garden.id}/settings`, html)).status).toBe(200)
    expect(location(await browser.request('/', html))).toEqual([302, `/w/${garden.id}`])

    // Per device: another of Lin's browsers keeps its own memory.
    const phone = new Browser()
    phone.jar.set('orbit_session', browser.jar.get('orbit_session')!)
    phone.jar.set('orbit_last_workspace', launch.id)
    expect(location(await phone.request('/', html))).toEqual([302, `/w/${launch.id}`])
  })

  it('falls back to a workspace you belong to when the remembered one is out of reach', async () => {
    const { person, browser } = await browserFor('supabase-moved', 'Moved')
    const { person: other } = await browserFor('supabase-elsewhere', 'Elsewhere')
    const theirs = await createWorkspaceFor(db, other.id, 'Not Yours')
    const left = await createWorkspaceFor(db, other.id, 'Left Behind') // someone else's, joined as a member
    await db`INSERT INTO orbit.memberships (user_id, workspace_id, role) VALUES (${person.id}, ${left.id}, 'member')`
    const stays = await createWorkspaceFor(db, person.id, 'Still Here')
    const home = `/w/${stays.id}`

    // Lost membership: remembered, then removed. (An owner's own membership can't be removed.)
    await browser.request(`/w/${left.id}`, html)
    expect(browser.jar.get('orbit_last_workspace')).toBe(left.id)
    await db`DELETE FROM orbit.memberships WHERE user_id = ${person.id} AND workspace_id = ${left.id}`
    expect(location(await browser.request('/', html))).toEqual([302, home])
    expect((await browser.request(`/w/${left.id}`, html)).status).toBe(404)

    // A remembered workspace never grants a way in: someone else's, unknown or malformed.
    for (const remembered of [theirs.id, '00000000-0000-0000-0000-000000000000', 'not-a-uuid']) {
      browser.jar.set('orbit_last_workspace', remembered)
      expect(location(await browser.request('/', html)), remembered).toEqual([302, home])
    }
    expect((await browser.request(`/w/${theirs.id}`, html)).status).toBe(404)
  })

  it('offers someone with no workspace their first, whatever is remembered', async () => {
    const { person: other } = await browserFor('supabase-stranger', 'Stranger')
    const theirs = await createWorkspaceFor(db, other.id, 'Theirs')
    const { browser } = await browserFor('supabase-newcomer', 'Newcomer')
    browser.jar.set('orbit_last_workspace', theirs.id)

    const res = await browser.request('/', html)
    expect(res.status).toBe(200)
    const markup = await res.text()
    expect(markup).toContain('Create your workspace')
    expect(markup).toContain('A new place for you and your people. Nothing else to set up.')
    expect(markup).not.toContain('administrator')
  })

  it('sends signed-out visitors to sign in, remembered workspace or not', async () => {
    const [ws] = await db<{ id: string }[]>`SELECT id FROM orbit.workspaces LIMIT 1`
    for (const [path, signIn] of [['/', '/sign-in'], ['/new', '/sign-in?next=%2Fnew']]) {
      const res = await api(path, `orbit_last_workspace=${ws!.id}`, html)
      expect(location(res), path).toEqual([302, signIn])
    }
  })
})

describe('people', () => {
  const html = { headers: { accept: 'text/html' } }
  const person = async (subject: string, name: string | null) => {
    const account = await upsertAccount(db, subject, `${subject}@example.com`)
    return name ? setName(db, account.id, name) : account
  }
  const cookieFor = async (userId: string) => `orbit_session=${await createSession(db, userId)}`
  const page = async (path: string, cookie?: string) => {
    const res = await api(path, cookie, html)
    return { status: res.status, location: res.headers.get('location'), text: await res.text() }
  }

  it('shows everyone in the workspace with their place in it, to every member alike', async () => {
    const owner = await person('supabase-people-owner', 'Yusuf')
    const steward = await person('supabase-people-steward', 'Bea')
    const member = await person('supabase-people-member', 'Ada')
    const ws = await createWorkspaceFor(db, owner.id, 'Commons')
    await db`INSERT INTO orbit.memberships (user_id, workspace_id, role) VALUES (${steward.id}, ${ws.id}, 'admin')`
    await db`INSERT INTO orbit.memberships (user_id, workspace_id, role) VALUES (${member.id}, ${ws.id}, 'member')`

    for (const viewer of [owner, steward, member]) {
      const res = await page(`/w/${ws.id}/people`, await cookieFor(viewer.id))
      expect(res.status, viewer.name!).toBe(200)
      expect(res.text).toContain('<title>People · Commons · Orbit</title>')
      expect(res.text).toContain('3 people belong here.')
      // By name, never by responsibility, each with their standing beside it, and only the viewer as "you".
      // (Each row starts with its avatar's initial, which is hidden from assistive technology.)
      // (Only the People card's own list: the page also carries the workspace navigation.)
      const start = res.text.indexOf('aria-labelledby="people"')
      const card = res.text.slice(start, res.text.indexOf('</section>', start))
      const rows = [...card.matchAll(/<li(?:\s[^>]*)?>([\s\S]*?)<\/li>/g)].map((m) => m[1]!.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
      expect(rows).toEqual([
        `A Ada ${viewer === member ? '(you) ' : ''}Member`,
        `B Bea ${viewer === steward ? '(you) ' : ''}Steward`,
        `Y Yusuf ${viewer === owner ? '(you) ' : ''}Owner`,
      ])
      // Other people's emails stay private (your own appears only in your account menu).
      for (const other of [owner, steward, member].filter((p) => p !== viewer)) expect(res.text).not.toContain(other.email)
    }
  })

  it('is honest when you’re the only one here, and when someone hasn’t chosen a name', async () => {
    const solo = await person('supabase-people-solo', 'Solo')
    const ws = await createWorkspaceFor(db, solo.id, 'Hermitage')
    const alone = await page(`/w/${ws.id}/people`, await cookieFor(solo.id))
    expect(alone.text).toContain('Just you, for now.')
    expect(alone.text).toMatch(/Solo\s*<\/span>\s*<span[^>]*>\(you\)/)

    const unnamed = await person('supabase-people-unnamed', null)
    await db`INSERT INTO orbit.memberships (user_id, workspace_id, role) VALUES (${unnamed.id}, ${ws.id}, 'member')`
    expect((await page(`/w/${ws.id}/people`, await cookieFor(solo.id))).text).toContain('No name yet')
  })

  it('never shows people to anyone outside the workspace, nor people from another workspace', async () => {
    const insider = await person('supabase-people-insider', 'Insider')
    const outsider = await person('supabase-people-outsider', 'Outsider')
    const ws = await createWorkspaceFor(db, insider.id, 'Walled Garden')
    const theirs = await createWorkspaceFor(db, outsider.id, 'Next Door')

    const blocked = await page(`/w/${ws.id}/people`, await cookieFor(outsider.id))
    expect(blocked.status).toBe(404)
    expect(blocked.text).not.toContain('Insider')
    expect((await api(`/api/workspaces/${ws.id}`, await cookieFor(outsider.id))).status).toBe(404)

    const own = await page(`/w/${theirs.id}/people`, await cookieFor(outsider.id))
    expect(own.text).toContain('Outsider')
    expect(own.text).not.toContain('Insider')

    expect(await page(`/w/${ws.id}/people`)).toMatchObject({ status: 302, location: `/sign-in?next=%2Fw%2F${ws.id}%2Fpeople` })
  })

  it('is reached from “Who’s here” on the arrival page', async () => {
    const host = await person('supabase-people-host', 'Host')
    const ws = await createWorkspaceFor(db, host.id, 'Front Door')
    const arrival = await page(`/w/${ws.id}`, await cookieFor(host.id))
    expect(arrival.text).toMatch(new RegExp(`<a[^>]+href="/w/${ws.id}/people"[^>]*>See everyone</a>`))
  })
})

describe('workspace navigation', () => {
  const html = { headers: { accept: 'text/html' } }
  const cookieFor = async (userId: string) => `orbit_session=${await createSession(db, userId)}`
  const page = async (path: string, cookie?: string) => {
    const res = await api(path, cookie, html)
    return { status: res.status, location: res.headers.get('location'), text: await res.text() }
  }
  /** Each workspace navigation on the page (the rail and the pill; CSS shows one), as its links. */
  const navs = (text: string) =>
    [...text.matchAll(/<nav[^>]*aria-label="Workspace"[^>]*>([\s\S]*?)<\/nav>/g)].map(([, inner]) =>
      [...inner!.matchAll(/<a([^>]*)>([\s\S]*?)<\/a>/g)].map(([, attrs, label]) => ({
        href: attrs!.match(/href="([^"]+)"/)?.[1],
        label: label!.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
        current: /aria-current="page"/.test(attrs!),
      })))

  it('offers Home, People and Settings on every page, marking where you are', async () => {
    const steward = await setName(db, (await upsertAccount(db, 'supabase-nav-steward', 'nav-steward@example.com')).id, 'Nia')
    const ws = await createWorkspaceFor(db, steward.id, 'Wayfinding')
    const cookie = await cookieFor(steward.id)
    for (const [path, here] of [[`/w/${ws.id}`, 'Home'], [`/w/${ws.id}/people`, 'People'], [`/w/${ws.id}/settings`, 'Settings']] as const) {
      const res = await page(path, cookie)
      expect(res.status, path).toBe(200)
      const found = navs(res.text)
      expect(found, path).toHaveLength(2) // the rail and the pill
      for (const links of found) {
        expect(links, path).toEqual([
          { href: `/w/${ws.id}`, label: 'Home', current: here === 'Home' },
          { href: `/w/${ws.id}/people`, label: 'People', current: here === 'People' },
          { href: `/w/${ws.id}/settings`, label: 'Settings', current: here === 'Settings' },
        ])
      }
      expect(res.text, path).not.toContain('Back to Wayfinding') // the navigation replaces the Back links
    }
    // Arrival keeps its own way to People, in context.
    expect((await page(`/w/${ws.id}`, cookie)).text).toMatch(new RegExp(`<a[^>]+href="/w/${ws.id}/people"[^>]*>See everyone</a>`))
  })

  it('names Settings for what members can do there: About', async () => {
    const owner = await upsertAccount(db, 'supabase-nav-owner', 'nav-owner@example.com')
    const member = await setName(db, (await upsertAccount(db, 'supabase-nav-member', 'nav-member@example.com')).id, 'Mo')
    const ws = await createWorkspaceFor(db, owner.id, 'Reading Room')
    await db`INSERT INTO orbit.memberships (user_id, workspace_id, role) VALUES (${member.id}, ${ws.id}, 'member')`
    const res = await page(`/w/${ws.id}/settings`, await cookieFor(member.id))
    for (const links of navs(res.text)) {
      expect(links.map((l) => l.label)).toEqual(['Home', 'People', 'About'])
      expect(links[2]).toMatchObject({ href: `/w/${ws.id}/settings`, current: true })
    }
    expect(res.text).toMatch(/<h1[^>]*>About this workspace<\/h1>/)
  })

  it('appears only inside a workspace you belong to', async () => {
    const insider = await upsertAccount(db, 'supabase-nav-insider', 'nav-insider@example.com')
    const outsider = await setName(db, (await upsertAccount(db, 'supabase-nav-outsider', 'nav-outsider@example.com')).id, 'Otto')
    const ws = await createWorkspaceFor(db, insider.id, 'Members Only')
    const blocked = await page(`/w/${ws.id}/people`, await cookieFor(outsider.id))
    expect(blocked.status).toBe(404)
    expect(navs(blocked.text)).toHaveLength(0)
    expect(await page(`/w/${ws.id}/settings`)).toMatchObject({ status: 302, location: `/sign-in?next=%2Fw%2F${ws.id}%2Fsettings` })
  })
})
