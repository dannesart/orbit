// A tiny stand-in for Supabase Auth's email-link endpoints, enforcing real PKCE:
// a code is only redeemed with the verifier whose S256 challenge requested it.
import { createHash, randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'

export interface SentLink {
  email: string
  /** The Orbit callback path the email link would land on, including the code. */
  callbackPath: string
}

export async function startFakeSupabase() {
  const pending = new Map<string, { email: string; challenge: string }>()
  const outbox: SentLink[] = []

  const server = createServer(async (req, res) => {
    const url = new URL(req.url!, 'http://fake')
    let raw = ''
    for await (const chunk of req) raw += chunk
    const body = raw ? JSON.parse(raw) : {}
    const reply = (status: number, json?: object) => {
      res.writeHead(status, { 'content-type': 'application/json' }).end(json ? JSON.stringify(json) : undefined)
    }

    if (url.pathname === '/auth/v1/otp') {
      if (body.email === 'down@example.com') {
        return reply(500, { code: 500, error_code: 'unexpected_failure', msg: 'Error sending magic link email' })
      }
      const code = randomUUID()
      pending.set(code, { email: body.email, challenge: body.code_challenge })
      const redirect = new URL(url.searchParams.get('redirect_to')!)
      redirect.searchParams.set('code', code)
      outbox.push({ email: body.email, callbackPath: redirect.pathname + redirect.search })
      return reply(200, {})
    }

    if (url.pathname === '/auth/v1/token' && url.searchParams.get('grant_type') === 'pkce') {
      const flow = pending.get(body.auth_code)
      const challenge = createHash('sha256').update(body.code_verifier ?? '').digest('base64url')
      if (!flow || flow.challenge !== challenge) {
        return reply(400, { code: 400, error_code: 'flow_state_not_found', msg: 'invalid flow state' })
      }
      pending.delete(body.auth_code)
      const now = Math.floor(Date.now() / 1000)
      return reply(200, {
        access_token: 'fake-access-token',
        refresh_token: 'fake-refresh-token',
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: now + 3600,
        user: { id: `supabase-${flow.email}`, email: flow.email, aud: 'authenticated', created_at: new Date().toISOString() },
      })
    }

    if (url.pathname === '/auth/v1/logout') return reply(204)
    reply(404, { msg: 'not found' })
  })

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  return { url: `http://127.0.0.1:${port}`, outbox, close: () => server.close() }
}
