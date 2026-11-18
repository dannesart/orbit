// NAVIGATION PLAYGROUND (exploration branch only): the playground opens without an account and
// with no database at all, while every real page stays behind sign-in exactly as before.
import { fileURLToPath } from 'node:url'
import { fetch, setup } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'

process.env.NUXT_DATABASE_URL = 'postgres://nobody:nothing@127.0.0.1:9/none' // unreachable on purpose
await setup({ rootDir: fileURLToPath(new URL('..', import.meta.url)), server: true, browser: false })
const get = (path: string) => fetch(path, { redirect: 'manual', headers: { accept: 'text/html' } })

describe('navigation playground', () => {
  it('serves every concept and place without signing in or touching the database', async () => {
    expect((await get('/playground/navigation')).status).toBe(200)
    for (const concept of ['a', 'b', 'c', 'd', 'e1', 'e2']) {
      for (const place of ['', '/people', '/settings']) {
        const res = await get(`/playground/navigation/${concept}${place}`)
        expect(res.status, `${concept}${place}`).toBe(200)
        const html = await res.text()
        expect(html).toContain('Northwind')
        // D adds nothing to Arrival: its places appear only when the workspace menu opens.
        if (concept === 'd' && !place) expect(html).not.toContain('aria-current="page"')
        else expect(html).toContain('aria-current="page"')
      }
    }
  })

  it('refuses concepts and places that don’t exist', async () => {
    expect((await get('/playground/navigation/e')).status).toBe(404)
    expect((await get('/playground/navigation/e3')).status).toBe(404)
    expect((await get('/playground/navigation/a/billing')).status).toBe(404)
  })

  it('leaves every real page behind sign-in', async () => {
    for (const path of ['/', '/new', '/welcome', '/w/00000000-0000-0000-0000-000000000000', '/playground']) {
      const res = await get(path)
      expect(res.status, path).toBe(302)
      expect(res.headers.get('location'), path).toBe('/sign-in')
    }
  })
})
