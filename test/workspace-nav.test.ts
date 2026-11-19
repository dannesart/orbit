import { describe, expect, it } from 'vitest'
import { placeOf, workspacePlaces } from '../app/utils/workspaceNav'

describe('workspacePlaces', () => {
  it('lists Home, People and Settings for the workspace, in that order', () => {
    expect(workspacePlaces('abc', true)).toEqual([
      { key: 'home', label: 'Home', to: '/w/abc' },
      { key: 'people', label: 'People', to: '/w/abc/people' },
      { key: 'settings', label: 'Settings', to: '/w/abc/settings' },
    ])
  })

  it('calls Settings “About” for people who can only read it', () => {
    expect(workspacePlaces('abc', false).map((p) => p.label)).toEqual(['Home', 'People', 'About'])
  })
})

describe('placeOf', () => {
  it('recognises each place, with or without a trailing slash, query or hash', () => {
    expect(placeOf('/w/abc', 'abc')).toBe('home')
    expect(placeOf('/w/abc/', 'abc')).toBe('home')
    expect(placeOf('/w/abc/people', 'abc')).toBe('people')
    expect(placeOf('/w/abc/people/', 'abc')).toBe('people')
    expect(placeOf('/w/abc/settings?x=1', 'abc')).toBe('settings')
    expect(placeOf('/w/abc/settings#name', 'abc')).toBe('settings')
  })

  it('treats anything else in the workspace as Home', () => {
    expect(placeOf('/w/abc/peoples', 'abc')).toBe('home')
    expect(placeOf('/w/abc?welcome=1', 'abc')).toBe('home')
  })
})
