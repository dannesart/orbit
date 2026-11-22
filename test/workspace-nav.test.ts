import { describe, expect, it } from 'vitest'
import { placeOf, workspacePlaces } from '../app/utils/workspaceNav'
import { workflowsPlace } from '../app/dev/workspace/place'

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

describe('the Workflows place (only where the workflow designer experiment exists)', () => {
  it('is off unless given: production has exactly Home, People and Settings', () => {
    expect(workspacePlaces('abc', true).map((p) => p.key)).toEqual(['home', 'people', 'settings'])
    expect(placeOf('/w/abc/workflows', 'abc')).toBe('home')
  })

  it('sits before Settings when the build has the experiment', () => {
    const extra = [workflowsPlace('abc')]
    expect(workspacePlaces('abc', false, extra)).toEqual([
      { key: 'home', label: 'Home', to: '/w/abc' },
      { key: 'people', label: 'People', to: '/w/abc/people' },
      { key: 'workflows', label: 'Workflows', to: '/w/abc/workflows' },
      { key: 'settings', label: 'About', to: '/w/abc/settings' },
    ])
    expect(placeOf('/w/abc/workflows/', 'abc', extra)).toBe('workflows')
    expect(placeOf('/w/abc/workflows?x=1', 'abc', extra)).toBe('workflows')
    expect(placeOf('/w/abc/workflowsx', 'abc', extra)).toBe('home')
  })
})
