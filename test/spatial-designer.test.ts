// Experiment #2, the canvas (/dev/designer), apart from the canvas library itself: plain words
// for a Transform, a graph whose order and connections no drag can change, and the same limits
// as the list playground (no fetching, storing, logging or evaluating; preview builds only).
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Expression, MappingProperty } from '../shared/features/mappings'
import { INITIAL_MAPPING } from '../app/dev/features/experiment'
import { EXECUTION_ORDER, INITIAL_POSITIONS, fixedEdges, initialNodes, resetPositions, stepBadge } from '../app/dev/designer/graph'
import { describeProperty, describeSource, summarize } from '../app/dev/designer/summary'

const prop = (name: string): Expression => ({ kind: 'property', name })
const text = (value: string): Expression => ({ kind: 'literal', value })
const trim = (e: Expression): Expression => ({ kind: 'call', fn: 'trim', args: [e] })
const joined = (items: Expression[], separator: string): Expression => ({ kind: 'call', fn: 'join', args: [{ kind: 'list', items }, text(separator)] })

describe('A Transform in plain words, without opening its editor', () => {
  it('says what the playground’s Mapping does', () => {
    expect(describeProperty(INITIAL_MAPPING.properties[0]!)).toBe('fullName ← firstName (trimmed) + a space + lastName')
  })

  it('names whitespace instead of quoting it, and quotes other text', () => {
    expect(describeSource(text(' '))).toBe('a space')
    expect(describeSource(text('   '))).toBe('3 spaces')
    expect(describeSource(text(''))).toBe('nothing')
    expect(describeSource(text('Dr.'))).toBe('“Dr.”')
    expect(describeSource({ kind: 'literal', value: 1815 })).toBe('1815')
    expect(describeSource({ kind: 'literal', value: false })).toBe('no')
  })

  it('keeps the grouping of nested calls readable', () => {
    expect(describeSource(joined([prop('lastName'), trim(prop('firstName'))], ', '))).toBe('lastName, firstName (trimmed) joined with “, ”')
    expect(describeSource(trim(joined([prop('a'), prop('b')], '')))).toBe('(a + b) trimmed')
    expect(describeSource(joined([joined([prop('a'), prop('b')], '-'), prop('c')], ''))).toBe('(a, b joined with “-”) + c')
    expect(describeSource(joined([], ' '))).toBe('nothing')
  })

  it('shows at most three properties on a node, and says how many more there are', () => {
    const many: MappingProperty[] = ['a', 'b', 'c', 'd', 'e'].map((name) => ({ name, source: prop(name) }))
    expect(summarize(many)).toEqual({ lines: ['a ← a', 'b ← b', 'c ← c'], more: 2 })
    expect(summarize([{ name: '', source: text('x') }])).toEqual({ lines: ['unnamed ← “x”'], more: 0 })
  })
})

describe('The canvas’s graph: positions are only a picture', () => {
  it('numbers the steps by execution order, wherever they are drawn', () => {
    expect(EXECUTION_ORDER.map(stepBadge)).toEqual(['Start', '1', '2', '3'])
    // Drag every node somewhere else, even into reverse order: nothing about the order changes.
    const moved = initialNodes().map((n, i) => ({ ...n, position: { x: -400 * i, y: 90 * i } }))
    expect(moved.map((n) => n.id)).toEqual([...EXECUTION_ORDER])
    expect(fixedEdges([true, true, true]).map((e) => `${e.source}->${e.target}`)).toEqual([
      'record->console-in', 'console-in->transform', 'transform->console-out',
    ])
    expect(resetPositions(moved).map((n) => n.position)).toEqual(EXECUTION_ORDER.map((id) => INITIAL_POSITIONS[id]))
  })

  it('lets nodes be dragged and selected, but never deleted or connected', () => {
    for (const node of initialNodes()) expect(node).toMatchObject({ deletable: false, connectable: false })
    for (const edge of fixedEdges([true, true, true])) expect(edge).toMatchObject({ deletable: false, selectable: false, reconnectable: false, focusable: false })
  })

  it('draws a connection dashed when nothing travelled along it in the shown run', () => {
    const edges = fixedEdges([true, false, false])
    expect(edges.map((e) => e.class)).toEqual(['designer-edge', 'designer-edge designer-edge--unused', 'designer-edge designer-edge--unused'])
    expect(edges[1]!.ariaLabel).toBe('Transform was not invoked in this run')
  })
})

describe('What the canvas experiment never does', () => {
  const root = join(import.meta.dirname, '..')
  const files = readdirSync(join(root, 'app/dev/designer')).map((f) => join('app/dev/designer', f))
  const source = (f: string) => readFileSync(join(root, f), 'utf8')

  // Experiment #7 adds one more: the Definitions experiment (app/dev/definitions), which is held
  // to the same rules (test/definitions-experiment.test.ts).
  it('imports only the playground, the Definitions experiment, the Feature language and the canvas library', () => {
    expect(files.length).toBeGreaterThanOrEqual(5)
    for (const f of files) {
      for (const [, from] of source(f).matchAll(/(?:from\s+|import\s+)'([^']+)'/g)) {
        expect(from, `${f} imports ${from}`).toMatch(/^(\.\/|\.\.\/features\/|\.\.\/definitions\/|#shared\/features\/|@xyflow\/vue(\/dist\/style\.css)?$)/)
      }
    }
  })

  it('never fetches, stores (not even the layout), logs or evaluates code', () => {
    const forbidden = /\bconsole\s*\.|\$?fetch\s*\(|useFetch|useAsyncData|localStorage|sessionStorage|indexedDB|document\.cookie|\beval\s*\(|new\s+Function\b|useDb|postgres/
    for (const f of files) expect(source(f), f).not.toMatch(forbidden)
  })

  it('runs the very same experiment as the list playground, never anything derived from positions', () => {
    const page = source('app/dev/designer/SpatialDesigner.vue')
    expect(page).toMatch(/steps\.value = runExperiment\(/)
    const runFunction = page.slice(page.indexOf('function run()'), page.indexOf('function startOver()'))
    expect(runFunction).not.toMatch(/position|nodes/)
  })

  it('is reachable only through the preview-only registration in nuxt.config.ts', () => {
    const pages = (dir: string): string[] => readdirSync(join(root, dir), { withFileTypes: true })
      .flatMap((e) => (e.isDirectory() ? pages(join(dir, e.name)) : [join(dir, e.name)]))
    for (const page of pages('app/pages')) expect(source(page), page).not.toMatch(/dev\/designer|xyflow/)
    const config = source('nuxt.config.ts')
    const guarded = config.slice(config.indexOf('if (!playgroundAvailable('))
    expect(guarded).toMatch(/^if \(!playgroundAvailable\(\{ dev: nuxt\.options\.dev, context: process\.env\.CONTEXT \}\)\) return\s+nuxt\.hook\('pages:extend'[\s\S]*app\/dev\/designer\/SpatialDesigner\.vue/)
    expect(config.indexOf('app/dev/designer')).toBeGreaterThan(config.indexOf('if (!playgroundAvailable('))
  })
})
