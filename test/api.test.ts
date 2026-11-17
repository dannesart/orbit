// Authorization boundaries and the email-link flow over real HTTP against a built Orbit server.
// Supabase Auth is replaced by a local fake (test/fake-supabase.ts) that enforces PKCE,
// so no test sends email or reaches the network.
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { fetch, setup } from '@nuxt/test-utils/e2e'
import { afterAll, describe, expect, it } from 'vitest'
import { SESSION_TTL_MS, createSession, upsertAccount } from '../server/utils/accounts'
import { openDb } from '../server/utils/db'
import { startFakeSupabase } from './fake-supabase'

const supabase = await startFakeSupabase()
afterAll(() => supabase.close())

const dbPath = join(mkdtempSync(join(tmpdir(), 'orbit-api-')), 'orbit.sqlite')
process.env.NUXT_DB_PATH = dbPath
process.env.NUXT_SUPABASE_URL = supabase.url
process.env.NUXT_SUPABASE_KEY = 'sb_publishable_test'

await setup({ rootDir: fileURLToPath(new URL('..', import.meta.url)), server: true, browser: false })

const db = openDb(dbPath)
const ada = upsertAccount(db, 'supabase-ada', 'ada@example.com')
const grace = upsertAccount(db, 'supabase-grace', 'grace@example.com')
const adaLaptop = `orbit_session=${createSession(db, ada.id)}`
const adaPhone = `orbit_session=${createSession(db, ada.id)}`
const graceLaptop = `orbit_session=${createSession(db, grace.id)}`

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
    expect(db.prepare('SELECT COUNT(*) AS n FROM workspaces').get()).toEqual({ n: 0 })
  })

  it('are sent to sign-in from any page', async () => {
    for (const path of ['/', '/w/anything']) {
      const res = await api(path)
      expect(res.status).toBe(302)
      expect(res.headers.get('location')).toBe('/sign-in')
    }
    expect((await api('/sign-in')).status).toBe(200)
  })

  it('are rejected with a forged or expired session', async () => {
    const expired = `orbit_session=${createSession(db, ada.id, Date.now() - SESSION_TTL_MS - 1)}`
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

    expect(db.prepare('SELECT user_id, role FROM memberships WHERE workspace_id = ?').all(workspace.id))
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
    const page = await api(`/w/${adas.id}`, graceLaptop)
    expect(page.status).toBe(404)
    expect(await page.text()).not.toContain('Analytical Engines')
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
  private jar = new Map<string, string>()
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

  requestLink(email: string) {
    return this.request('/api/auth/link', { method: 'POST', body: JSON.stringify({ email }) })
  }
}

describe('sign-in links', () => {
  it('validate the email before contacting Supabase', async () => {
    expect((await new Browser().requestLink('nope')).status).toBe(422)
    expect(supabase.outbox).toHaveLength(0)
  })

  it('report a friendly error when Supabase fails to send', async () => {
    const res = await new Browser().requestLink('down@example.com')
    expect(res.status).toBe(502)
    expect((await res.json()).statusMessage).toMatch(/couldn’t send a link/)
  })

  it('sign a new person up, then let them return from another browser', async () => {
    const laptop = new Browser()
    expect((await laptop.requestLink('linus@example.com')).status).toBe(204)
    const firstLink = supabase.outbox.at(-1)!
    expect(firstLink.callbackPath).toMatch(/^\/auth\/callback\?code=/)
    expect(laptop.cookie).not.toContain('orbit_session') // requesting a link signs no one in

    const landed = await laptop.request(firstLink.callbackPath)
    expect(landed.status).toBe(303)
    expect(landed.headers.get('location')).toBe('/') // → create workspace, since they have none
    expect(laptop.cookie).toContain('orbit_session=')
    expect(laptop.cookie).not.toMatch(/code-verifier/) // verifier cleared once used
    expect(await (await laptop.request('/api/me')).json()).toEqual({ email: 'linus@example.com' })
    expect(await (await laptop.request('/api/workspaces')).json()).toEqual([])

    const created = await (await laptop.request('/api/workspaces', { method: 'POST', body: JSON.stringify({ name: 'Kernel' }) })).json()

    // The same link cannot be used twice.
    const reused = await new Browser().request(firstLink.callbackPath)
    expect(reused.headers.get('location')).toBe('/sign-in?error=browser')

    // Returning from a second browser: same Orbit account, same workspace.
    const desktop = new Browser()
    await desktop.requestLink('linus@example.com')
    await desktop.request(supabase.outbox.at(-1)!.callbackPath)
    expect(await (await desktop.request('/api/workspaces')).json()).toEqual([created])
    expect(db.prepare('SELECT COUNT(*) AS n FROM users WHERE email = ?').get('linus@example.com')).toEqual({ n: 1 })
  })

  it('only complete in the browser that requested the link', async () => {
    const requester = new Browser()
    await requester.requestLink('margaret@example.com')
    const link = supabase.outbox.at(-1)!

    const elsewhere = new Browser()
    const res = await elsewhere.request(link.callbackPath)
    expect(res.headers.get('location')).toBe('/sign-in?error=browser')
    expect(elsewhere.cookie).toBeUndefined()

    // The requester can still use it afterwards.
    expect((await requester.request(link.callbackPath)).headers.get('location')).toBe('/')
  })

  it('accept only the newest link when several were requested', async () => {
    const browser = new Browser()
    await browser.requestLink('katherine@example.com')
    const first = supabase.outbox.at(-1)!
    await browser.requestLink('katherine@example.com')
    const newest = supabase.outbox.at(-1)!
    expect((await browser.request(first.callbackPath)).headers.get('location')).toBe('/sign-in?error=invalid')
    expect(browser.cookie).not.toContain('orbit_session')
    expect((await browser.request(newest.callbackPath)).headers.get('location')).toBe('/')
  })
})

describe('email link callback', () => {
  const callback = async (query: string, cookie?: string) => {
    const res = await api(`/auth/callback${query}`, cookie)
    expect(res.status).toBe(303)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(res.headers.get('set-cookie') ?? '').not.toMatch(/orbit_session=[^;]/)
    return res.headers.get('location')
  }

  it('sends expired or reused links back to sign-in', async () => {
    expect(await callback('?error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired'))
      .toBe('/sign-in?error=expired')
  })

  it('rejects callbacks without a code, or with another error', async () => {
    expect(await callback('')).toBe('/sign-in?error=invalid')
    expect(await callback('?error=server_error&code=abc')).toBe('/sign-in?error=invalid')
  })

  it('refuses a link opened in a browser that did not request it', async () => {
    expect(await callback('?code=11111111-2222-3333-4444-555555555555')).toBe('/sign-in?error=browser')
  })

  it('does not sign anyone in, even with an existing session cookie, when the link fails', async () => {
    expect(await callback('?error_code=otp_expired', adaPhone)).toBe('/sign-in?error=expired')
    expect((await api('/api/workspaces', adaPhone)).status).toBe(200) // existing session untouched
  })
})
