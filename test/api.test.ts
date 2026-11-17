// Authorization boundaries and the email-code sign-in over real HTTP against a built Orbit server.
// PostgreSQL is an in-process PGlite with the real migrations (test/db.ts); Supabase Auth is a
// local fake (test/fake-supabase.ts). No test sends email or reaches the network.
import { fileURLToPath } from 'node:url'
import { fetch, setup } from '@nuxt/test-utils/e2e'
import { afterAll, describe, expect, it } from 'vitest'
import { SESSION_TTL_MS, createSession, upsertAccount } from '../server/utils/accounts'
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
const ada = await upsertAccount(db, 'supabase-ada', 'ada@example.com')
const grace = await upsertAccount(db, 'supabase-grace', 'grace@example.com')
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

  it('are sent to sign-in from any page', async () => {
    for (const path of ['/', '/w/anything']) {
      const res = await api(path)
      expect(res.status).toBe(302)
      expect(res.headers.get('location')).toBe('/sign-in')
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
    expect(await verified.json()).toEqual({ email: 'linus@example.com' })
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
