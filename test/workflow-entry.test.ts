// The workflow entry experiment: a Workflows place in the workspace navigation that leads to the
// designer and back. Only where the designer exists (nuxt dev, Deploy Previews); production keeps
// its three places and identical navigation markup. The place tells only present-tense truths.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { safeDestination } from '../app/utils/returnTo'

const root = join(import.meta.dirname, '..')
const source = (f: string) => readFileSync(join(root, f), 'utf8')

describe('Only in builds that have the designer', () => {
  const config = source('nuxt.config.ts')
  const guard = config.indexOf('if (!playgroundAvailable(')

  it('registers the Workflows place as a workspace child route below the preview-only guard', () => {
    const route = config.indexOf("path: 'workflows'")
    expect(guard).toBeGreaterThan(0)
    expect(route).toBeGreaterThan(guard)
    expect(config.slice(guard, route)).toMatch(/nuxt\.hook\('pages:extend'/)
    expect(config).toMatch(/app\/dev\/workspace\/WorkflowsPlace\.vue/)
    // Not a file-based page: nothing under app/pages mentions it.
    const pages = (dir: string): string[] => readdirSync(join(root, dir), { withFileTypes: true })
      .flatMap((e) => (e.isDirectory() ? pages(join(dir, e.name)) : [join(dir, e.name)]))
    for (const page of pages('app/pages')) expect(source(page), page).not.toMatch(/workflows|WorkflowsPlace/i)
  })

  it('decides the build-time flag exactly as the guard does', () => {
    expect(config).toMatch(/'import\.meta\.env\.ORBIT_PLAYGROUND': JSON\.stringify\(playgroundAvailable\(\{ dev: nuxt\.options\.dev, context: process\.env\.CONTEXT \}\)\)/)
  })

  it('reads the flag strictly, so anything but true leaves the place out', () => {
    for (const f of ['app/components/WorkspaceNav.vue', 'app/components/WorkspaceNavIcon.vue']) {
      expect(source(f), f).toMatch(/import\.meta\.env\.ORBIT_PLAYGROUND === true/)
    }
  })

  it('keeps production’s pill markup: three columns, the same widths and padding', () => {
    const nav = source('app/components/WorkspaceNav.vue')
    expect(nav).toMatch(/four \? 'grid-cols-4' : 'grid-cols-3'/)
    expect(nav).toMatch(/four \? 'w-\[calc\(\(100%-0\.5rem\)\/4\)\]' : 'w-\[calc\(\(100%-0\.5rem\)\/3\)\]'/)
    expect(nav).toMatch(/four \? 'min-w-20 px-2' : 'min-w-22 px-4'/)
  })
})

describe('The Workflows place says only what is true today', () => {
  const place = source('app/dev/workspace/WorkflowsPlace.vue')
  const text = place.slice(place.indexOf('<template>'))

  it('says Orbit keeps no workflows, the designer uses sample data, and it forgets everything', () => {
    expect(text).toMatch(/Orbit doesn’t keep workflows/)
    expect(text).toMatch(/on sample data rather than \{\{ ws\.name \}\}’s/)
    expect(text).toMatch(/It forgets everything when you leave/)
    expect(text).toMatch(/Experiment · previews only/)
  })

  it('makes no promises about the future', () => {
    expect(text).not.toMatch(/\b(soon|coming|yet|will|later|upcoming|planned|eventually)\b/i)
  })

  it('opens the designer with a way back to exactly this place', () => {
    expect(place).toMatch(/`\/dev\/designer\?back=\$\{encodeURIComponent\(`\/w\/\$\{ws\.value\.id\}\/workflows`\)\}`/)
  })
})

describe('The way back from the designer', () => {
  it('goes only to a path within Orbit, and to Orbit itself otherwise', () => {
    const page = source('app/dev/designer/SpatialDesigner.vue')
    expect(page).toMatch(/const back = computed\(\(\) => safeDestination\(useRoute\(\)\.query\.back\)\)/)
    expect(source('app/dev/designer/DesignerToolbar.vue')).toMatch(/:to="props\.back \?\? '\/'"/)
    expect(safeDestination('/w/abc/workflows')).toBe('/w/abc/workflows')
    for (const bad of ['https://example.com', '//example.com', '/\\example.com', 'w/abc', undefined, ['/w/abc']]) {
      expect(safeDestination(bad), String(bad)).toBeNull()
    }
  })
})

describe('Leaving the designer never silently discards work', async () => {
  const { workAtRisk } = await import('../app/dev/designer/session')
  const { applyConfiguration, draftFrom, initialConfiguration } = await import('../app/dev/designer/config')
  const { INITIAL_DATA } = await import('../app/dev/features/experiment')
  const start = { pinKey: 'a1', recordText: JSON.stringify(INITIAL_DATA, null, 2), consoleId: 'orbit.console' }
  const untouched = { ...start, config: initialConfiguration(), unapplied: false }

  it('asks nothing for an untouched playground (running and moving nodes aren’t work)', () => {
    expect(workAtRisk(untouched, start)).toEqual([])
  })

  it('names applied versions, which exist only in this session, before anything else', () => {
    const initial = initialConfiguration()
    const draft = { ...draftFrom(initial), use: 'local' as const, local: { name: 'Person summary', fields: [{ name: 'fullName', type: 'string' as const }] } }
    const config = applyConfiguration(initial, draft)
    expect(workAtRisk({ ...untouched, config }, start)).toEqual([
      'Applied versions, which exist only in this session: Person summary v1, Mapping v1 for Person summary · v1',
    ])
  })

  it('names unapplied changes and edits to the setup', () => {
    expect(workAtRisk({ ...untouched, unapplied: true, recordText: '{}', consoleId: 'playground.console-that-edits' }, start)).toEqual([
      'Changes to the Transform you haven’t applied', 'Your edits to Record A', 'The Console you chose to misbehave',
    ])
    expect(workAtRisk({ ...untouched, pinKey: 'a2' }, start)).toEqual(['Your edits to Record A'])
  })

  it('guards every way out inside Orbit, and offers Stay in Designer and Leave and discard', () => {
    const page = source('app/dev/designer/SpatialDesigner.vue')
    expect(page).toMatch(/onBeforeRouteLeave\(\(to\) => \{\s*if \(discardConfirmed \|\| !atRisk\.value\.length\) return true/)
    expect(page).toMatch(/<LeaveDialog :losing="leaving \? atRisk : null" @stay="stay" @leave="leave" \/>/)
    expect(page).toMatch(/addEventListener\('beforeunload', onBeforeUnload\)/)
    const dialog = source('app/dev/designer/LeaveDialog.vue')
    expect(dialog).toMatch(/>Stay in Designer</)
    expect(dialog).toMatch(/>Leave and discard</)
    expect(dialog).toMatch(/not even what you applied/)
    expect(dialog).toMatch(/stayButton\.value\?\.focus\(\)/)
  })

  it('never implies that Apply saves anything', () => {
    expect(source('app/dev/designer/ApplyBar.vue')).toMatch(/Applied in this session:/)
  })
})

describe('Production carries no trace of the Workflows place', () => {
  it('keeps the link out of the shared navigation code, behind the build-time constant', () => {
    expect(source('app/utils/workspaceNav.ts')).not.toMatch(/Workflows|'\/workflows'/)
    expect(source('app/components/WorkspaceNav.vue')).toMatch(/import\.meta\.env\.ORBIT_PLAYGROUND === true \? \[workflowsPlace\(props\.workspaceId\)\] : \[\]/)
  })
})
