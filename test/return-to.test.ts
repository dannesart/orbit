import { describe, expect, it } from 'vitest'
import { safeDestination, signInPath, welcomePath } from '../app/utils/returnTo'

describe('safeDestination', () => {
  it('keeps a path within Orbit, with its query and hash', () => {
    expect(safeDestination('/w/abc')).toBe('/w/abc')
    expect(safeDestination('/w/abc/people?tab=stewards&sort=name')).toBe('/w/abc/people?tab=stewards&sort=name')
    expect(safeDestination('/w/abc/settings#name')).toBe('/w/abc/settings#name')
    expect(safeDestination('/new')).toBe('/new')
    expect(safeDestination('/w/abc?q=caf%C3%A9%20au%20lait')).toBe('/w/abc?q=caf%C3%A9%20au%20lait') // encoding kept as is
    expect(safeDestination('/invitations/9b63fe45-aff7-4a3e-9219-5389c72387b2')).toBe('/invitations/9b63fe45-aff7-4a3e-9219-5389c72387b2')
  })

  it('normalises dot segments, so the result is the path that will actually open', () => {
    expect(safeDestination('/w/abc/./people/../settings')).toBe('/w/abc/settings')
  })

  it('refuses anything that would leave Orbit', () => {
    for (const input of [
      'https://evil.example', 'http://evil.example/w/abc', 'HTTPS://evil.example',
      '//evil.example', '//evil.example/w/abc', '///evil.example',
      '/\\evil.example', '\\\\evil.example', '\\/evil.example', '/\\/evil.example',
      'javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,hi', 'mailto:a@b.c',
      '/%2F%2Fevil.example', '/%2f/evil.example', '/%5Cevil.example', '/%5c%5cevil.example',
      'evil.example', 'w/abc', '?next=/w/abc', '#/w/abc',
    ]) expect(safeDestination(input), input).toBeNull()
  })

  it('refuses whitespace and control characters a browser might strip or reinterpret', () => {
    for (const input of [' /w/abc', '/w/abc ', '\t//evil.example', '/\t/evil.example', '/w/abc\n', '/w/\r\nabc', '/w/\u0000abc', '/%00/w', '/w/%0d%0aSet-Cookie:x'])
      expect(safeDestination(input), JSON.stringify(input)).toBeNull()
  })

  it('refuses encoded control characters in the path, the query and the hash alike', () => {
    for (const input of [
      '/w/%0a', '/w/%7F', '/w/%C2%85',
      '/w/abc?q=%0d%0a', '/w/abc?q=%00', '/w/abc?q=ok&r=%09', '/w/abc?q=%C2%85',
      '/w/abc#%0a', '/w/abc#%00', '/w/abc#top%7F', '/w/abc?q=ok#%C2%9F',
    ]) expect(safeDestination(input), input).toBeNull()
  })

  it('still keeps real queries and anchors: Unicode, emoji, and slashes or backslashes as data', () => {
    for (const input of [
      '/w/abc?q=caf%C3%A9#R%C3%A9sum%C3%A9', '/w/abc?q=%F0%9F%AA%90', '/w/abc#%F0%9F%AA%90',
      '/w/abc?from=%2Fw%2Fdef', '/w/abc?q=a%5Cb', '/w/abc?q=a%20b&r=1', '/w/abc#section-2',
    ]) expect(safeDestination(input), input).toBe(input)
  })

  it('refuses malformed paths', () => {
    for (const input of ['', '/%', '/w/%zz', '/w/abc?q=%E0%A4%A', '/w/abc#%zz', '/w/abc#50%', '/' + 'a'.repeat(2048)]) expect(safeDestination(input), input.slice(0, 20)).toBeNull()
  })

  it('refuses anything that isn’t one plain string', () => {
    for (const input of [undefined, null, 42, {}, ['/w/abc'], ['/w/abc', '/w/def']]) expect(safeDestination(input)).toBeNull()
  })

  it('never returns to a step of signing in, however it is written, so nothing can loop', () => {
    for (const input of [
      '/sign-in', '/sign-in/', '/SIGN-IN', '/sign-in?next=/w/abc', '/sign-in?next=%2Fsign-in',
      '/welcome', '/Welcome/', '/welcome?back=/w/abc', '/welcome?change=1',
      '/w/../sign-in', '/w/abc/../../welcome', '/%73ign-in',
    ]) expect(safeDestination(input), input).toBeNull()
  })

  it('treats "/" and the API as no destination at all', () => {
    for (const input of ['/', '/?x=1', '/api', '/api/me', '/API/workspaces']) expect(safeDestination(input), input).toBeNull()
  })
})

describe('signInPath and welcomePath', () => {
  it('carry a safe destination as one encoded parameter', () => {
    expect(signInPath('/w/abc/people?tab=x&y=1')).toBe('/sign-in?next=%2Fw%2Fabc%2Fpeople%3Ftab%3Dx%26y%3D1')
    expect(welcomePath('/w/abc/people?tab=x&y=1')).toBe('/welcome?back=%2Fw%2Fabc%2Fpeople%3Ftab%3Dx%26y%3D1')
    // Read back by the router, the parameter is exactly the destination
    expect(new URL(signInPath('/w/abc?q=a%20b#top'), 'http://x').searchParams.get('next')).toBe('/w/abc?q=a%20b#top')
  })

  it('stay plain when there is nothing worth carrying', () => {
    for (const input of [undefined, '/', '//evil.example', '/sign-in?next=/w/abc', '/welcome']) {
      expect(signInPath(input)).toBe('/sign-in')
      expect(welcomePath(input)).toBe('/welcome')
    }
  })
})
