// Experiment #8, meaningful connections (/dev/designer): the arrows decide what runs and in what
// order, checked against the Features' own contracts (exact Definition identity and version for
// Transform; anything for Console), one path only, and a run's history never rewritten by
// reconnecting afterwards. Pure: no canvas library.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { type Data, type DefinitionRef, deepFreeze, refOf } from '../shared/features/definitions'
import { type Catalog, type PassThroughFeature, orbitConsole, orbitTransformV2 } from '../shared/features/features'
import { A1, B1, DEFINITIONS, INITIAL_DATA, INITIAL_MAPPING, RECORD_ID, WORKSPACE, definitionLabel } from '../app/dev/features/experiment'
import {
  type Connection, type Contracts, INITIAL_CONNECTIONS, type StepId, checkConnection, connectionProblems, flowOutcome,
  pathOf, pathWords, runFlow,
} from '../app/dev/designer/flow'

const A2: DefinitionRef = { id: 'person-name', version: 2 }
const COPY: DefinitionRef = { id: 'person-name-copy', version: 1 }
const link = (source: StepId, target: StepId): Connection => ({ source, target })
const chain = (...steps: StepId[]) => steps.slice(1).map((s, i) => link(steps[i]!, s))

const catalog = (pinned: DefinitionRef = refOf(A1), mappings = [INITIAL_MAPPING], data: Data = INITIAL_DATA): Catalog =>
  deepFreeze({ definitions: DEFINITIONS, records: [{ id: RECORD_ID, workspaceId: WORKSPACE, definition: pinned, data }], mappings })
const contracts = (pinned: DefinitionRef = refOf(A1)): Contracts => ({
  record: pinned,
  transform: { reads: INITIAL_MAPPING.from, makes: INITIAL_MAPPING.to },
  definitions: DEFINITIONS,
  label: definitionLabel,
  features: { 'console-in': orbitConsole, 'transform': orbitTransformV2, 'console-out': orbitConsole },
  featureLabel: (step) => (step === 'transform' ? 'Orbit.Transform v2' : 'Orbit.Console v1'),
})
const run = (connections: readonly Connection[], cat = catalog(), console: PassThroughFeature = orbitConsole) =>
  runFlow(cat, connections, { features: { 'console-in': console, 'transform': orbitTransformV2, 'console-out': orbitConsole }, mapping: { id: INITIAL_MAPPING.id, version: INITIAL_MAPPING.version }, workspaceId: WORKSPACE })
const outcomes = (r: ReturnType<typeof run>) =>
  Object.fromEntries(Object.entries(r.steps).map(([step, result]) => [step, result!.evidence.outcome.kind]))

describe('A valid connected path runs, in the order the connections give', () => {
  it('runs Record A → Console → Transform → Console, each step with the previous one’s output', () => {
    const r = run(INITIAL_CONNECTIONS)
    expect(r.path).toEqual(['record', 'console-in', 'transform', 'console-out'])
    expect(outcomes(r)).toEqual({ 'console-in': 'succeeded', 'transform': 'succeeded', 'console-out': 'succeeded' })
    expect(r.steps['console-in']!.evidence.input).toEqual({ record: RECORD_ID, definition: refOf(A1) })
    expect(r.steps.transform!.evidence.input).toEqual({ definition: refOf(A1) })
    expect(r.steps['console-out']!.evidence.input).toEqual({ definition: refOf(B1) })
    expect(r.steps['console-out']!.output!.data).toEqual({ fullName: 'Ada Lovelace' })
    expect(flowOutcome(r)).toEqual({ kind: 'completed' })
  })

  it('follows the connections, not positions or the old fixed sequence: Transform first, then both Consoles', () => {
    const r = run(chain('record', 'transform', 'console-out', 'console-in'))
    expect(r.path).toEqual(['record', 'transform', 'console-out', 'console-in'])
    // Transform reads Record A itself; each Console then receives what the step before it handed on.
    expect(r.steps.transform!.evidence.input).toEqual({ record: RECORD_ID, definition: refOf(A1) })
    expect(r.steps['console-out']!.evidence.input).toEqual({ definition: refOf(B1) })
    expect(r.steps['console-in']!.evidence.input).toEqual({ definition: refOf(B1) })
    expect(r.steps['console-in']!.observations).toEqual([{ fullName: 'Ada Lovelace' }])
    expect(flowOutcome(r)).toEqual({ kind: 'completed' })
    expect(pathWords(r.path)).toBe('Record A → Transform → Console → Console')
  })

  it('invokes each step on the path exactly once, in path order', () => {
    const seen: string[] = []
    const watching: PassThroughFeature = { ...orbitConsole, run: (input, ctx) => (seen.push(JSON.stringify(input)), orbitConsole.run(input, ctx)) }
    run(chain('record', 'transform', 'console-in'), catalog(), watching)
    expect(seen).toEqual([JSON.stringify({ fullName: 'Ada Lovelace' })])
  })
})

describe('Disconnecting and reconnecting', () => {
  it('stops the path where a connection is removed; the steps after it never run, and come back when reconnected', () => {
    const cut = INITIAL_CONNECTIONS.filter((c) => !(c.source === 'console-in' && c.target === 'transform'))
    const r = run(cut)
    expect(r.path).toEqual(['record', 'console-in'])
    expect(outcomes(r)).toEqual({ 'console-in': 'succeeded' })
    // Transform → Console is still connected, but off the path: neither runs merely by being there.
    expect(r.steps.transform).toBeUndefined()
    expect(r.steps['console-out']).toBeUndefined()

    expect(checkConnection(cut, link('console-in', 'transform'), contracts())).toEqual({ ok: true })
    const again = run([...cut, link('console-in', 'transform')])
    expect(again.path).toEqual(['record', 'console-in', 'transform', 'console-out'])
    expect(flowOutcome(again)).toEqual({ kind: 'completed' })
  })

  it('never runs disconnected steps, even connected among themselves', () => {
    const r = run([link('record', 'transform'), link('console-in', 'console-out')])
    expect(r.path).toEqual(['record', 'transform'])
    expect(Object.keys(r.steps)).toEqual(['transform'])
  })

  it('moves a connection’s end without counting it against itself', () => {
    const connections = chain('record', 'transform', 'console-out')
    const moving = link('transform', 'console-out')
    // Moving Transform → Console's end to the other Console: fine, it replaces itself.
    expect(checkConnection(connections, link('transform', 'console-in'), contracts(), moving)).toEqual({ ok: true })
    // As a new connection beside it, it would branch.
    expect(checkConnection(connections, link('transform', 'console-in'), contracts()).ok).toBe(false)
  })
})

describe('One path: no branching, merging, loops, or anything into Record A', () => {
  const refused = (connections: readonly Connection[], c: Connection) => {
    const v = checkConnection(connections, c, contracts())
    expect(v.ok, JSON.stringify(c)).toBe(false)
    return v.ok ? '' : v.reason
  }
  it('refuses each, saying why', () => {
    expect(refused(INITIAL_CONNECTIONS, link('record', 'transform'))).toBe('Record A already hands on to a Console. One path only: disconnect that first.')
    expect(refused([link('record', 'console-in')], link('console-out', 'console-in'))).toBe('That Console already receives from Record A. A step takes one input.')
    expect(refused(chain('console-in', 'transform', 'console-out'), link('console-out', 'console-in'))).toBe('That would make a loop. The flow runs one way, from Record A.')
    expect(refused([], link('transform', 'transform'))).toBe('A step can’t hand on to itself.')
    expect(refused([], link('console-in', 'record'))).toBe('Record A is where the flow starts. Nothing hands on to it.')
    expect(refused(INITIAL_CONNECTIONS, link('record', 'console-in'))).toBe('They’re already connected.')
  })

  it('never loops at run time either', () => {
    // A loop can't be made through checkConnection; even handed one, the path visits each step once.
    expect(pathOf([link('record', 'console-in'), link('console-in', 'console-out'), link('console-out', 'console-in')])).toEqual(['record', 'console-in', 'console-out'])
  })
})

describe('Contracts: exact Definition identity and version where a Feature requires it', () => {
  it('lets Console receive any Definition, as its pass-through contract says', () => {
    for (const pinned of [refOf(A1), A2, COPY]) {
      expect(checkConnection([], link('record', 'console-in'), contracts(pinned))).toEqual({ ok: true })
      expect(checkConnection([], link('transform', 'console-out'), contracts(pinned))).toEqual({ ok: true })
    }
  })

  it('refuses another version of the Definition Transform reads, explaining what is expected and what is available', () => {
    expect(checkConnection([], link('record', 'transform'), contracts(A2))).toEqual({
      ok: false, reason: 'Transform reads Definition A · v1. Record A hands on Definition A · v2.',
    })
    // Through a Console it's the same Value, so the same answer.
    expect(checkConnection([link('record', 'console-in')], link('console-in', 'transform'), contracts(A2))).toEqual({
      ok: false, reason: 'Transform reads Definition A · v1. This Console hands on Definition A · v2.',
    })
  })

  it('refuses a structurally identical but independently identified Definition', () => {
    const v = checkConnection([], link('record', 'transform'), contracts(COPY))
    expect(v).toEqual({ ok: false, reason: 'Transform reads Definition A · v1. Record A hands on A look-alike of Definition A · v1. Same properties, but a different Definition.' })
  })

  it('lets Transform bridge Definitions: it reads A and hands on B, which a Console accepts', () => {
    const connections = chain('record', 'transform', 'console-out')
    expect(connectionProblems(connections, contracts())).toEqual(new Map())
    const r = run(connections)
    expect(r.steps.transform!.output!.definition).toEqual(refOf(B1))
    expect(r.steps['console-out']!.output!.definition).toEqual(refOf(B1))
  })

  it('marks a connection that stops fitting (Record A pinned elsewhere), and the boundary still refuses it at run time', () => {
    expect(connectionProblems(INITIAL_CONNECTIONS, contracts(A2))).toEqual(new Map([
      ['console-in->transform', 'Transform reads Definition A · v1, but receives Definition A · v2.'],
    ]))
    const r = run(INITIAL_CONNECTIONS, catalog(A2, [INITIAL_MAPPING], { ...INITIAL_DATA, email: 'ada@example.org' }))
    expect(r.steps.transform!.evidence.outcome).toEqual({ kind: 'not_attempted', reason: 'contract_mismatch', expected: refOf(A1), actual: A2 })
    expect(r.steps['console-out']).toBeUndefined()
    expect(flowOutcome(r)).toEqual({ kind: 'stopped', at: 'transform' })
  })
})

describe('Never a false success', () => {
  it('runs nothing when Record A isn’t connected, and says so', () => {
    const r = run([link('console-in', 'transform'), link('transform', 'console-out')])
    expect(r.path).toEqual(['record'])
    expect(r.steps).toEqual({})
    expect(flowOutcome(r)).toEqual({ kind: 'nothing' })
  })

  it('stops at the first step that doesn’t succeed, and the run is “stopped”, not “completed”', () => {
    const broken = deepFreeze({ ...INITIAL_MAPPING, properties: [{ name: 'fullName', source: { kind: 'literal' as const, value: 7 } }] })
    const r = run(INITIAL_CONNECTIONS, catalog(refOf(A1), [broken]))
    expect(outcomes(r)).toEqual({ 'console-in': 'succeeded', 'transform': 'failed' })
    expect(flowOutcome(r)).toEqual({ kind: 'stopped', at: 'transform' })
  })

  it('needs something connected to Record A before the designer offers to run', () => {
    const page = readFileSync(join(import.meta.dirname, '../app/dev/designer/SpatialDesigner.vue'), 'utf8')
    expect(page).toMatch(/const canRun = computed\(\(\) => !\('error' in parsed\.value\) && path\.value\.length > 1\)/)
    expect(page).toMatch(/if \('error' in record \|\| !canRun\.value\) return/)
    expect(page).toMatch(/:can-run="canRun"/)
  })
})

describe('Design, applied versions and evidence stay apart', () => {
  const page = readFileSync(join(import.meta.dirname, '../app/dev/designer/SpatialDesigner.vue'), 'utf8')

  it('never changes a contract, Mapping or draft by connecting, moving or disconnecting', () => {
    const handling = page.slice(page.indexOf('// Connecting, moving a connection\'s end, and disconnecting.'), page.indexOf(' * The Record\'s configuration now'))
    expect(handling).toMatch(/connections\.value = /)
    expect(handling).not.toMatch(/config\.value =|setDraft|draft\.value =|pinKey\.value =|consoleId\.value =/)
    // The Mappings a run uses are untouched by it: the catalogue is frozen, and still equal after.
    const cat = catalog()
    const before = JSON.stringify(cat.mappings)
    run(chain('record', 'transform', 'console-in'), cat)
    expect(JSON.stringify(cat.mappings)).toBe(before)
    expect(Object.isFrozen(cat.mappings[0])).toBe(true)
  })

  it('keeps each run’s path and evidence exactly as they were after reconnecting', () => {
    const first = run(INITIAL_CONNECTIONS)
    const record = Object.freeze({ number: 1, path: first.path, evidence: first.steps.transform!.evidence })
    const was = JSON.stringify(record)
    // Reconnect, and run again: the first run's record doesn't move.
    const second = run(chain('record', 'transform'))
    expect(second.path).toEqual(['record', 'transform'])
    expect(JSON.stringify(record)).toBe(was)
    expect(record.path).toEqual(['record', 'console-in', 'transform', 'console-out'])
    expect(Object.isFrozen(first.path)).toBe(true)
    expect(Object.isFrozen(first.steps)).toBe(true)
    expect(Object.isFrozen(first.steps.transform!.evidence)).toBe(true)
    // The designer stores each run's own path, frozen, with its Mapping version.
    expect(page).toMatch(/runs\.value = \[\.\.\.runs\.value, Object\.freeze\(\{ number: runNumber\.value, outcome: [^}]*mapping: evidence\?\.mapping \?\? null, [^}]*path: shown\.value\.path, recordName: currentRecord\.value\.name \}\)\]/)
    // A change of connections makes the shown run "earlier": it's part of what a run depends on.
    expect(page).toMatch(/const snapshot = computed\(\(\) => JSON\.stringify\(\[[^\]]*connections\.value\.map\(connectionKey\)\]\)\)/)
  })
})
