import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
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

describe('The rail (wide screens): compact icons, each named and explained', () => {
  const nav = readFileSync(join(import.meta.dirname, '../app/components/WorkspaceNav.vue'), 'utf8')
  const rail = nav.slice(nav.indexOf("v-if=\"variant === 'rail'\""), nav.indexOf('<!-- Pill'))
  const icons = readFileSync(join(import.meta.dirname, '../app/components/WorkspaceNavIcon.vue'), 'utf8')

  it('names every place, marks the current one, and shows a visible focus ring', () => {
    expect(rail).toContain(':aria-label="p.label"')
    expect(rail).toContain(":aria-current=\"p.key === current ? 'page' : undefined\"")
    expect(rail).toMatch(/focus-visible:ring-2 focus-visible:ring-accent-500/)
    expect(rail).toMatch(/<nav\s+aria-label="Workspace"/)
  })

  it('shows each place’s name in a tooltip on hover and on keyboard focus, which Escape hides', () => {
    expect(rail).toMatch(/group-hover:opacity-100 group-focus-visible:opacity-100[^>]*>\s*\{\{ p\.label \}\}/)
    expect(rail).toContain('@keydown.escape="hushed = true"')
    expect(nav).toMatch(/\.workspace-rail--hushed \.workspace-rail-tip \{ opacity: 0 !important; \}/)
  })

  it('gives every icon a 44px target, 8px apart, active in pink, and Settings below a divider', () => {
    expect(rail).toMatch(/class="group relative flex size-11 /)
    expect(rail).toMatch(/flex flex-col gap-2/)
    expect(rail).toContain("p.key === current ? 'bg-accent-50 text-accent-600' : 'text-slate-500")
    expect(rail).toContain('v-for="(group, g) in [primary, settings]"')
    expect(rail).toMatch(/v-if="g === 1" aria-hidden="true" class="h-px/)
  })

  it('puts Orbit’s own mark at the top, and a house for Home: no indicator dots', () => {
    expect(rail).toMatch(/<OrbitSymbol class="[^"]*" \/>\s*<span aria-hidden="true" class="h-px/)
    expect(nav).not.toMatch(/size-1\.5 rounded-full bg-accent-400/)
    expect(icons).toMatch(/name === 'home'">\s*<path d="M2\.5 7\.25 8 2\.75l5\.5 4\.5" \/>/)
    expect(icons).not.toMatch(/fill="currentColor"/)
  })
})
