import type { H3Event } from 'h3'

/**
 * Strict request bodies for the endpoints that act on invitations and memberships. Nothing a
 * client sends is ever quietly ignored: a request either says exactly what the endpoint takes,
 * or is refused (422, with data.reason), before anything is looked up or decided. This is about
 * the shape of a request only; what may be done is decided by the domain (authority.ts).
 */

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

async function parsed(event: H3Event): Promise<{ empty: true } | { empty: false; value: unknown } | null> {
  const raw = await readRawBody(event, 'utf8').catch(() => undefined)
  if (raw === undefined || raw.trim() === '') return { empty: true }
  try {
    return { empty: false, value: JSON.parse(raw) }
  } catch {
    return null
  }
}

/**
 * For actions that take nothing (accept, decline, revoke, remove): no body, an empty one, or
 * `{}`. Anything else, such as a role or someone's identity, is refused, so no client can
 * believe it chose something it didn't.
 */
export async function requireNoBody(event: H3Event): Promise<void> {
  const body = await parsed(event)
  if (body?.empty || (body && isPlainObject(body.value) && Object.keys(body.value).length === 0)) return
  throw createError({ statusCode: 422, statusMessage: 'This takes no request body.', data: { reason: 'unexpected_body' } })
}

/**
 * A JSON object with only the properties `allowed` names. Missing properties are left for the
 * domain to refuse; unknown ones are refused here, naming the first.
 */
export async function readStrictObject<K extends string>(event: H3Event, allowed: readonly K[]): Promise<Partial<Record<K, unknown>>> {
  const body = await parsed(event)
  if (!body || body.empty || !isPlainObject(body.value)) {
    throw createError({ statusCode: 422, statusMessage: `Send a JSON object with ${allowed.join(' and ')}.`, data: { reason: 'invalid_body' } })
  }
  const unknown = Object.keys(body.value).find((key) => !(allowed as readonly string[]).includes(key))
  if (unknown !== undefined) {
    throw createError({ statusCode: 422, statusMessage: `Unexpected property: ${unknown.slice(0, 64)}.`, data: { reason: 'unexpected_property', field: unknown.slice(0, 64) } })
  }
  return body.value as Partial<Record<K, unknown>>
}
