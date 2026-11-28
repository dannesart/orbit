// Experiment #2, the canvas (/dev/designer), apart from the canvas library itself: plain words
// for a Transform, a picture whose positions never change what runs (Experiment #8: connections
// do, test/meaningful-connections.test.ts), and the same limits as the list playground (no
// fetching, storing, logging or evaluating; preview builds only).
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Expression, MappingProperty } from '../shared/features/mappings'
import { INITIAL_MAPPING } from '../app/dev/features/experiment'
import { INITIAL_POSITIONS, drawEdges, initialNodes, resetPositions } from '../app/dev/designer/graph'
import { INITIAL_CONNECTIONS, STEPS, pathOf, stepBadge } from '../app/dev/designer/flow'
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
  const path = pathOf(INITIAL_CONNECTIONS)
  it('numbers the steps by the connections, wherever they are drawn', () => {
    expect(STEPS.map((id) => stepBadge(id, path))).toEqual(['Start', '1', '2', '3'])
    // Drag every node somewhere else, even into reverse order: nothing about the order changes.
    const moved = initialNodes(path).map((n, i) => ({ ...n, position: { x: -400 * i, y: 90 * i } }))
    expect(moved.map((n) => n.id)).toEqual([...STEPS])
    expect(pathOf(INITIAL_CONNECTIONS)).toEqual(['record', 'console-in', 'transform', 'console-out'])
    expect(resetPositions(moved).map((n) => n.position)).toEqual(STEPS.map((id) => INITIAL_POSITIONS[id]))
  })

  it('lets nodes be dragged, selected and connected, never deleted; connections can be removed and moved', () => {
    for (const node of initialNodes(path)) expect(node).toMatchObject({ deletable: false })
    expect(initialNodes(path).map((n) => n.ariaLabel)).toEqual(['Record A, where the flow starts', 'Step 1, Console', 'Step 2, Transform', 'Step 3, Console'])
    expect(initialNodes(['record']).map((n) => n.ariaLabel)[2]).toBe('Transform, not connected to the flow')
    // Reachable with Tab (as SVG spells it), and named for what it does.
    for (const edge of drawEdges(INITIAL_CONNECTIONS, { path, steps: {} }, new Map())) {
      expect(edge).toMatchObject({ deletable: true, reconnectable: true, domAttributes: { tabindex: 0 } })
    }
  })

  it('removes a focused arrow with Delete or Backspace, and keeps focus on the step it came from', () => {
    const page = readFileSync(join(import.meta.dirname, '../app/dev/designer/SpatialDesigner.vue'), 'utf8')
    expect(page).toMatch(/function deleteFocusedArrow\(event: KeyboardEvent\) \{\s*if \(!active\.value \|\| \(event\.key !== 'Delete' && event\.key !== 'Backspace'\)\) return[\s\S]*?disconnect\(\[\{ id \}\]\)[\s\S]*?\.vue-flow__node\[data-id="\$\{source\}"\][\s\S]*?\.focus\(\)/)
    // An arrow the library is handed is always drawn, even one that stopped fitting.
    expect(page).toMatch(/const isValidConnection = \(c: \{ source: string; target: string \}\) =>\s*connections\.value\.some\(\(x\) => connectionKey\(x\) === connectionKey\(asConnection\(c\)\)\) \|\| verdict\(asConnection\(c\)\)\.ok/)
  })

  it('keeps grabbing a dot, an arrow’s end and a step apart, at any zoom', () => {
    const page = readFileSync(join(import.meta.dirname, '../app/dev/designer/SpatialDesigner.vue'), 'utf8')
    const node = readFileSync(join(import.meta.dirname, '../app/dev/designer/StepNode.vue'), 'utf8')
    // A connection starts only from a right-hand dot of a step that doesn't hand on yet; a left-hand
    // dot only ever ends one (so it's never a grab target next to an arrow's end).
    expect(node).toContain('<Handle v-if="!start" type="target" :position="Position.Left" :is-connectable-start="false" />')
    expect(node).toContain('<Handle type="source" :position="Position.Right" :is-connectable-start="!handsOn" />')
    expect(page).toContain(':hands-on="connections.some((c) => c.source === node.id)"')
    // Each dot answers an invisible ring around it, sized for the zoom; so do arrow ends and snapping.
    expect(page).toMatch(/\.designer \.vue-flow__handle::before \{[^}]*inset: calc\(-1 \* var\(--designer-grip/)
    expect(page).toContain(`:style="{ '--designer-grip': \`\${grip.dot}px\` }"`)
    expect(page).toContain(':connection-radius="grip.snap"')
    expect(page).toContain(':reconnect-radius="grip.arrowEnd"')
    expect(page).toContain('@viewport-change="zoom = $event.zoom"')
    // The library places dots with `transform`: nothing of ours may set it, or a hovered dot moves
    // out from under the pointer (and the press lands on the step, which then moves instead).
    const styles = page.slice(page.indexOf('<style>'))
    for (const rule of styles.match(/[^{}]*vue-flow__handle[^{]*\{[^}]*\}/g) ?? []) expect(rule).not.toMatch(/\btransform\s*:|\bscale\s*:/)
  })

  it('takes a moved arrow’s end as a move only, never as a second, new connection', () => {
    // The library ends a moved end through connectEnd too (just before reconnectEnd); taken as a new
    // connection there, it duplicated the arrow, or (dropped on a free step) branched the path.
    const page = readFileSync(join(import.meta.dirname, '../app/dev/designer/SpatialDesigner.vue'), 'utf8')
    expect(page).toMatch(/function connectEnd\(\{ event, connectionState \}: ConnectEndEvent\) \{\s*connecting\.value = false\s*if \(moving\) return\s/)
  })

  it('draws a connection dashed when nothing travelled along it in the shown run, and red when its contract fails', () => {
    const edges = drawEdges(INITIAL_CONNECTIONS, { path: ['record', 'console-in'], steps: { 'console-in': {} as never } }, new Map([['console-in->transform', 'Transform reads A, but receives B.']]))
    expect(edges.map((e) => e.class)).toEqual(['designer-edge', 'designer-edge designer-edge--problem', 'designer-edge designer-edge--unused'])
    expect(edges[1]!.ariaLabel).toBe('Console hands on to Transform. Transform reads A, but receives B.')
    expect(edges[2]!.ariaLabel).toBe('Transform hands on to Console. Nothing travelled along it in the shown run')
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

  it('runs the path through the connections, never anything derived from positions', () => {
    const page = source('app/dev/designer/SpatialDesigner.vue')
    expect(page).toMatch(/shown\.value = runFlow\([\s\S]*?connections\.value,/)
    const runFunction = page.slice(page.indexOf('function run()'), page.indexOf('function startOver()'))
    expect(runFunction).not.toMatch(/position|nodes/)
  })

  it('is reachable only through the preview-only registration in nuxt.config.ts', () => {
    const pages = (dir: string): string[] => readdirSync(join(root, dir), { withFileTypes: true })
      .flatMap((e) => (e.isDirectory() ? pages(join(dir, e.name)) : [join(dir, e.name)]))
    for (const page of pages('app/pages')) expect(source(page), page).not.toMatch(/dev\/designer|xyflow/)
    const config = source('nuxt.config.ts')
    const guarded = config.slice(config.indexOf('if (!playgroundAvailable('))
    expect(guarded).toMatch(/^if \(!playgroundAvailable\(\{ dev: nuxt\.options\.dev, context: process\.env\.CONTEXT \}\)\) return\s+nuxt\.hook\('pages:extend'[\s\S]*app\/dev\/designer\/DesignerWorkflows\.vue/)
    expect(config.indexOf('app/dev/designer')).toBeGreaterThan(config.indexOf('if (!playgroundAvailable('))
  })
})
