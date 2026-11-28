// The compact canvas (Related to #54): a step's card is the same size whatever its information holds,
// says what it holds, observes, or receives and makes, keeps the configuration now apart from the
// shown run, and names the actual Record. Each workflow has its own starting layout, where no arrow
// crosses a card it doesn't connect.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { A1, DEFINITIONS, WORKSPACE } from '../app/dev/features/experiment'
import { CANDIDATE } from '../app/dev/features/realistic'
import { type Connection, type Contracts, INITIAL_CONNECTIONS, checkConnection, connectionProblems, pathWords, stepTitle } from '../app/dev/designer/flow'
import { INITIAL_POSITIONS, initialNodes, nodeLabel, resetPositions } from '../app/dev/designer/graph'
import { exampleFrom } from '../app/dev/designer/preview'
import { WORKFLOWS } from '../app/dev/designer/workflows'
import { orbitConsole, orbitTransformV2, resolverIn } from '../shared/features/features'

const designer = (file: string) => readFileSync(join(import.meta.dirname, '../app/dev/designer', file), 'utf8')
const contracts = (recordName?: string): Contracts => ({
  record: { id: A1.id, version: 1 }, ...(recordName ? { recordName } : {}),
  transform: { reads: { id: A1.id, version: 1 }, makes: { id: 'full-name', version: 1 } },
  definitions: DEFINITIONS, label: (r) => `${r.id} · v${r.version}`,
  features: { 'console-in': orbitConsole, 'transform': orbitTransformV2, 'console-out': orbitConsole }, featureLabel: () => 'Console',
})

describe('The actual Record, by name', () => {
  it('titles the Record step, names it in connection refusals, arrows, labels and run paths', () => {
    expect(stepTitle('record')).toBe('Record A')
    expect(stepTitle('record', 'Candidate: Amara')).toBe('Candidate: Amara')
    expect(stepTitle('transform', 'Candidate: Amara')).toBe('Transform')
    expect(checkConnection(INITIAL_CONNECTIONS, { source: 'console-out', target: 'record' }, contracts('Candidate: Amara')))
      .toEqual({ ok: false, reason: 'Candidate: Amara is where the flow starts. Nothing hands on to it.' })
    const chain: Connection[] = [{ source: 'record', target: 'console-in' }, { source: 'console-in', target: 'transform' }]
    expect(checkConnection(chain, { source: 'transform', target: 'console-in' }, contracts('Candidate: Tomasz')))
      .toMatchObject({ ok: false })
    expect(checkConnection(INITIAL_CONNECTIONS, { source: 'record', target: 'transform' }, contracts('Candidate: Amara')))
      .toEqual({ ok: false, reason: 'Candidate: Amara already hands on to a Console. One path only: disconnect that first.' })
    expect(nodeLabel('record', ['record'], 'Candidate: Amara')).toBe('Candidate: Amara, where the flow starts')
    expect(pathWords(['record', 'console-in'], 'Candidate: Amara')).toBe('Candidate: Amara → Console')
    // Unnamed, as before: runs made before Records had names read as they always did.
    expect(pathWords(['record', 'console-in'])).toBe('Record A → Console')
  })

  it('says a refusal briefly for a large Definition: the first places, then how many more', () => {
    const candidate = { ...contracts('Candidate: Amara'), record: { id: CANDIDATE.id, version: 1 }, featureLabel: () => 'Orbit.Console v1' }
    const reason = connectionProblems([{ source: 'record', target: 'console-in' }], candidate).get('record->console-in')
    expect(reason).toBe('Orbit.Console v1 doesn’t accept job-candidate · v1: it has objects or other Definitions inside it (contactDetails, application, application › referral and 8 more).')
  })

  it('names the Record whose data a preview can’t use', () => {
    expect(exampleFrom('{', CANDIDATE, undefined, 'Candidate: Amara')).toMatchObject({ problem: 'Candidate: Amara’s data isn’t valid JSON, so there’s no example to preview with.' })
    expect(exampleFrom('{}', CANDIDATE, resolverIn(DEFINITIONS, WORKSPACE), 'Candidate: Amara')).toMatchObject({ problem: 'Candidate: Amara’s data doesn’t fit Candidate · v1, which this Mapping reads.' })
    expect(exampleFrom('{', CANDIDATE)).toMatchObject({ problem: 'Record A’s data isn’t valid JSON, so there’s no example to preview with.' })
  })

  it('records the Record’s name with each new run, and shows each run’s path by its own', () => {
    expect(designer('SpatialDesigner.vue')).toContain('path: shown.value.path, recordName: currentRecord.value.name })')
    expect(designer('RunHistory.vue')).toContain('pathWords(r.path, r.recordName)')
  })
})

describe('Compact cards', () => {
  const page = designer('SpatialDesigner.vue')
  const card = designer('StepNode.vue')

  it('are one width, and never list the Record’s properties or the Mapping’s expressions', () => {
    expect(card).toMatch(/class="w-64 rounded-2xl/)
    expect(card).not.toMatch(/view\.lines|view\.more|truncate/)
    expect(page).not.toMatch(/summarize\(|Object\.keys\(data\)\.join/)
    // The Record: its exact Definition version and how many properties it has, not their names.
    expect(page).toContain('flow: { text: definitionLabel(pin.value.ref) }, detail: pinned ? count(pinned.fields.length) : null,')
    // The Transform: what it receives and makes, and how complete its Mapping is.
    expect(page).toContain('flow: { from: label(appliedMapping.value.from), to: label(config.value.output) },')
    expect(page).toContain('detail: output ? `${mapped} of ${count(output.fields.length)} mapped` : null,')
  })

  it('keep the configuration now apart from the shown run, judged by the boundary’s own checks', () => {
    expect(page).toMatch(/const transformStatus = computed<StepView\['config'\]>\(\(\) => \{[\s\S]*?contractCompatibility\(feature, input\)[\s\S]*?mappingCompatibility\(feature, appliedMapping\.value, input, output, resolve\)/)
    expect(page).toMatch(/const recordStatus = computed<StepView\['config'\]>\(\(\) => \{[\s\S]*?validate\(definition, record\.data, resolve\)/)
    // Two places on the card: the configuration line, and the run's outcome, labelled as a run's.
    expect(card).toMatch(/data-step-config[\s\S]*data-step-outcome[\s\S]*\{\{ view\.stale \? 'Earlier run:' : 'Last run:' \}\}/)
    // A problem is shown whole: it may make the card taller.
    expect(card).toContain('<p v-if="view.problem" class="mt-2 text-xs font-medium text-red-700" data-step-problem>{{ view.problem }}</p>')
  })
})

describe('Each workflow’s own layout', () => {
  // A card's footprint on the canvas (StepNode: w-64, about 200px tall normally).
  const W = 256
  const H = 200
  type At = { x: number; y: number }
  /** Whether the straight arrow from a's right edge to b's left edge passes through card c. */
  const crosses = (a: At, b: At, c: At) => {
    const from = { x: a.x + W, y: a.y + H / 2 }
    const to = { x: b.x, y: b.y + H / 2 }
    for (let t = 0; t <= 1; t += 0.01) {
      const x = from.x + (to.x - from.x) * t
      const y = from.y + (to.y - from.y) * t
      if (x > c.x && x < c.x + W && y > c.y && y < c.y + H) return true
    }
    return false
  }

  it('starts every workflow with no arrow crossing a card it doesn’t connect, and cards that don’t overlap', () => {
    for (const w of WORKFLOWS) {
      const at = w.layout
      const ids = Object.keys(at) as (keyof typeof at)[]
      for (const c of w.connections) {
        for (const id of ids) {
          if (id === c.source || id === c.target) continue
          expect(crosses(at[c.source], at[c.target], at[id]), `${w.id}: ${c.source}→${c.target} crosses ${id}`).toBe(false)
        }
      }
      for (const a of ids) {
        for (const b of ids) {
          if (a >= b) continue
          const apart = Math.abs(at[a].x - at[b].x) >= W + 32 || Math.abs(at[a].y - at[b].y) >= H + 32
          expect(apart, `${w.id}: ${a} and ${b} overlap`).toBe(true)
        }
      }
    }
    // The Observe workflow puts its unconnected Transform out of the Consoles' way.
    expect(WORKFLOWS.find((w) => w.id === 'observe-candidate')!.layout.transform.y).toBeGreaterThan(H)
  })

  it('draws a workflow’s steps where its layout says, and resets to that layout only when asked', () => {
    const observe = WORKFLOWS.find((w) => w.id === 'observe-candidate')!
    const nodes = initialNodes(['record', 'console-in', 'console-out'], observe.layout)
    expect(nodes.find((n) => n.id === 'transform')!.position).toEqual(observe.layout.transform)
    const moved = nodes.map((n) => ({ ...n, position: { x: 9, y: 9 } }))
    expect(resetPositions(moved, observe.layout).map((n) => n.position)).toEqual(nodes.map((n) => n.position))
    expect(initialNodes(['record']).map((n) => n.position)).toEqual(Object.values(INITIAL_POSITIONS))
    // Each Designer is kept as it was while switching (KeepAlive): nothing repositions a node on switching.
    expect(designer('SpatialDesigner.vue')).toContain('const nodes = ref<Node[]>(initialNodes(path.value, preset.layout, currentRecord.value.name))')
    expect(designer('SpatialDesigner.vue')).toContain('nodes.value = resetPositions(nodes.value, preset.layout)')
  })
})
