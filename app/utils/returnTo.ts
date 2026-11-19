/**
 * Where someone was going when Orbit first had to ask who they are: kept through sign-in and the
 * name question, so that establishing identity never replaces the reason they came.
 *
 * A destination only ever says where to go next. It grants nothing: the page it leads to is
 * authorized by the server like any other visit.
 */

const MAX_LENGTH = 2048
const ORIGIN = 'http://orbit.invalid' // a stand-in origin, only to let URL resolve and normalise a path

/**
 * The steps of signing in themselves are never destinations (returning there would loop), nor is
 * the API, which has no pages. Compared case- and trailing-slash-insensitively, like the router.
 */
const isAuthStepOrApi = (path: string) =>
  ['/sign-in', '/welcome'].includes(path) || path === '/api' || path.startsWith('/api/')

/**
 * Returns the destination as a path within Orbit (path, query and hash, normalised), or null when
 * it isn't one we would send anybody to. Only a single leading slash is accepted: never a full or
 * protocol-relative URL, never a backslash (browsers read "\" as "/", so "/\evil.com" leaves the
 * site), never whitespace or control characters a browser might strip, never malformed
 * percent-encoding. "/" is null too: it is where everyone goes anyway.
 */
export function safeDestination(input: unknown): string | null {
  if (typeof input !== 'string' || input.length === 0 || input.length > MAX_LENGTH) return null
  if (!input.startsWith('/') || input.startsWith('//')) return null
  if (/[\\\s\p{Cc}]/u.test(input)) return null

  let url: URL
  let path: string
  try {
    url = new URL(input, ORIGIN)
    path = decodeURIComponent(url.pathname) // also rejects malformed percent-encoding
    decodeURIComponent(url.search)
  } catch {
    return null
  }
  if (url.origin !== ORIGIN) return null
  // Encoded tricks ("/%2F%2Fevil.com", "/%5Cevil.com") stay paths here, but are never meaningful.
  if (path.startsWith('//') || /[\\\p{Cc}]/u.test(path)) return null

  const route = path.toLowerCase().replace(/\/+$/, '') || '/'
  if (route === '/' || isAuthStepOrApi(route)) return null
  return url.pathname + url.search + url.hash
}

/** Sign-in, remembering where the visitor was going (if anywhere worth remembering). */
export function signInPath(destination?: unknown): string {
  const next = safeDestination(destination)
  return next ? `/sign-in?next=${encodeURIComponent(next)}` : '/sign-in'
}

/** The first-time name question, remembering where the person was going. */
export function welcomePath(destination?: unknown): string {
  const back = safeDestination(destination)
  return back ? `/welcome?back=${encodeURIComponent(back)}` : '/welcome'
}
