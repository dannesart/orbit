// A tiny stand-in for Supabase Auth's email-code endpoints, so tests never send real email.
// It mimics the responses Orbit relies on: codes are single-use, a resend within 60 seconds
// is refused with Supabase's cooldown message, and one address simulates the email cap.
import { randomInt } from 'node:crypto'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'

export const SEND_FAILS = 'down@example.com'
export const EMAIL_CAP_REACHED = 'cap@example.com'

export async function startFakeSupabase() {
  /** The latest code "emailed" to each address. */
  const inbox = new Map<string, string>()
  const lastSent = new Map<string, number>()

  const server = createServer(async (req, res) => {
    const url = new URL(req.url!, 'http://fake')
    let raw = ''
    for await (const chunk of req) raw += chunk
    const body = raw ? JSON.parse(raw) : {}
    const reply = (status: number, json?: object) => {
      res.writeHead(status, { 'content-type': 'application/json' }).end(json ? JSON.stringify(json) : undefined)
    }
    const fail = (status: number, error_code: string, msg: string) => reply(status, { code: status, error_code, msg })

    if (url.pathname === '/auth/v1/otp') {
      const email: string = body.email
      if (email === SEND_FAILS) return fail(500, 'unexpected_failure', 'Error sending magic link email')
      if (email === EMAIL_CAP_REACHED) return fail(429, 'over_email_send_rate_limit', 'email rate limit exceeded')
      const waited = (Date.now() - (lastSent.get(email) ?? 0)) / 1000
      if (waited < 60) {
        const left = Math.ceil(60 - waited)
        return fail(429, 'over_email_send_rate_limit', `For security purposes, you can only request this after ${left} seconds.`)
      }
      lastSent.set(email, Date.now())
      inbox.set(email, String(randomInt(0, 1_000_000)).padStart(6, '0'))
      return reply(200, {})
    }

    if (url.pathname === '/auth/v1/verify' && req.method === 'POST') {
      const email: string = body.email
      if (body.type !== 'email' || !inbox.has(email) || inbox.get(email) !== body.token) {
        return fail(403, 'otp_expired', 'Token has expired or is invalid')
      }
      inbox.delete(email) // single use
      const now = Math.floor(Date.now() / 1000)
      return reply(200, {
        access_token: 'fake-access-token',
        refresh_token: 'fake-refresh-token',
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: now + 3600,
        user: { id: `supabase-${email}`, email, aud: 'authenticated', created_at: new Date().toISOString() },
      })
    }

    if (url.pathname === '/auth/v1/logout') return reply(204)
    reply(404, { msg: 'not found' })
  })

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  return {
    url: `http://127.0.0.1:${port}`,
    /** Read the code the last email to this address contained. */
    codeFor: (email: string) => inbox.get(email),
    /** Pretend the 60-second resend cooldown has passed. */
    skipCooldown: (email: string) => lastSent.delete(email),
    close: () => server.close(),
  }
}
