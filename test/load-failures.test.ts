// Regression: a failure to load workspaces must never look like "you have no workspaces" or
// "this workspace is out of reach". Recreates the incident: sessions work, but reading
// workspaces fails (here: orbit_app loses SELECT on orbit.workspaces), while the person
// genuinely owns a workspace.
import { fileURLToPath } from 'node:url'
import { fetch, setup } from '@nuxt/test-utils/e2e'
import { afterAll, describe, expect, it } from 'vitest'
import { createSession, setName, upsertAccount } from '../server/utils/accounts'
import { createWorkspace } from '../server/utils/workspaces'
import { startTestDatabase } from './db'

let cookie = ''
let workspaceId = ''
const testDb = await startTestDatabase({
  asApp: true,
  prepare: async (sql) => {
    const owner = await upsertAccount(sql, 'supabase-sweden', 'sweden@example.com')
    await setName(sql, owner.id, 'Daniel')
    workspaceId = (await createWorkspace(sql, owner.id, 'Sweden')).id
    cookie = `orbit_session=${await createSession(sql, owner.id)}`
    await sql`REVOKE SELECT ON orbit.workspaces FROM orbit_app`
  },
})
afterAll(() => testDb.close())

process.env.NUXT_DATABASE_URL = testDb.url
process.env.NUXT_SUPABASE_URL = 'http://127.0.0.1:9'
process.env.NUXT_SUPABASE_KEY = 'sb_publishable_test'
await setup({ rootDir: fileURLToPath(new URL('..', import.meta.url)), server: true, browser: false })

// Ask for HTML like a browser does (Nuxt answers error pages as JSON otherwise).
const get = (path: string) => fetch(path, { headers: { cookie, accept: 'text/html' }, redirect: 'manual' })

describe('when workspaces cannot be loaded', () => {
  it('the API reports a server error, not an empty list', async () => {
    expect((await get('/api/workspaces')).status).toBe(500)
    expect((await get(`/api/workspaces/${workspaceId}`)).status).toBe(500)
  })

  it('the home page says so honestly and never offers to create a workspace', async () => {
    const res = await get('/')
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('We couldn’t reach your workspaces')
    expect(html).toContain('Try again')
    expect(html).not.toContain('Create your workspace')
    expect(html).not.toContain('Workspace name')
  })

  it('the workspace page reports a failure, not "out of reach"', async () => {
    const res = await get(`/w/${workspaceId}`)
    expect(res.status).toBe(503)
    const html = await res.text()
    expect(html).toContain('We couldn’t open this workspace right now')
    expect(html).toContain('Try again')
    expect(html).not.toContain('out of reach')
  })
})
