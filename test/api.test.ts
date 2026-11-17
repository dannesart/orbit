// Authorization boundaries over real HTTP against a built Orbit server.
// Sessions are seeded directly: the Supabase code exchange itself needs a live project.
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { fetch, setup } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'
import { SESSION_TTL_MS, createSession, upsertAccount } from '../server/utils/accounts'
import { openDb } from '../server/utils/db'

const dbPath = join(mkdtempSync(join(tmpdir(), 'orbit-api-')), 'orbit.sqlite')
process.env.NUXT_DB_PATH = dbPath
process.env.NUXT_SUPABASE_URL = ''
process.env.NUXT_SUPABASE_KEY = ''

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

describe('sign-in endpoints', () => {
  it('validate input before contacting Supabase', async () => {
    const code = await api('/api/auth/code', undefined, { method: 'POST', body: JSON.stringify({ email: 'nope' }) })
    expect(code.status).toBe(422)
    const verify = await api('/api/auth/verify', undefined, {
      method: 'POST',
      body: JSON.stringify({ email: 'ada@example.com', code: 'abc' }),
    })
    expect(verify.status).toBe(422)
  })

  it('report clearly when Supabase is not configured', async () => {
    const res = await api('/api/auth/code', undefined, {
      method: 'POST',
      body: JSON.stringify({ email: 'ada@example.com' }),
    })
    expect(res.status).toBe(503)
  })
})
