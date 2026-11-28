// The playground's experimental workflows (development only, in memory): independent starting
// points for the same Designer, so realistic shapes can be tried without disturbing each other. Each
// is only where a workflow starts: its Records, the Feature version each step pins, its Mapping and
// its connections. The Designer page keeps one Designer per workflow alive while you switch
// (DesignerWorkflows.vue), so each keeps its own Record edits, draft, applied versions, canvas
// positions and runs for the session. Nothing is saved; there is no Workflow model here.
import type { Data, DefinitionRef } from '#shared/features/definitions'
import type { Mapping } from '#shared/features/mappings'
import { INITIAL_DATA, INITIAL_MAPPING, RECORD_ID } from '../features/experiment'
import { CANDIDATE_CONTACT_MAPPING, CANDIDATE_RECORDS, CANDIDATE_TO_EMPLOYEE, type PlaygroundRecord } from '../features/realistic'
import { type Connection, type FeatureStep, INITIAL_CONNECTIONS, INITIAL_STEP_FEATURES } from './flow'
import { INITIAL_POSITIONS, type Layout } from './graph'

/**
 * Every Record a workflow may run with. Record A is the playground's original (its Definition can
 * be re-pinned on purpose, to see how exact identity behaves: PINS); the Candidates are pinned to
 * Candidate · v1 and stay so. Choosing a Record chooses which existing Record runs: it never
 * changes a Record's Definition, a Mapping or any run already made.
 */
export const RECORD_A: PlaygroundRecord = Object.freeze({
  id: RECORD_ID, name: 'Record A', definition: { id: 'person-name', version: 1 } as DefinitionRef, data: INITIAL_DATA as Data,
  note: 'The original sample: Definition A · v1.',
})
export const RECORDS: readonly PlaygroundRecord[] = Object.freeze([RECORD_A, ...CANDIDATE_RECORDS])
export const recordOf = (id: string) => RECORDS.find((r) => r.id === id) ?? RECORD_A

export interface WorkflowPreset {
  readonly id: string
  readonly name: string
  /** What it's for, in a line. */
  readonly description: string
  /** The Records it may run with (by id), and the one it starts with. */
  readonly records: readonly string[]
  readonly record: string
  /** The exact Feature version each step pins (featureKey). */
  readonly features: Readonly<Record<FeatureStep, string>>
  /** The Transform's applied Mapping as it starts (its `to` is the applied output). */
  readonly mapping: Mapping
  readonly connections: readonly Connection[]
  /** Where its steps are first drawn: only a starting picture, moved freely afterwards. */
  readonly layout: Layout
}

const v2Consoles = { 'console-in': 'orbit.console@2', 'console-out': 'orbit.console@2' } as const
const candidates = CANDIDATE_RECORDS.map((r) => r.id)
/** The Transform below the path, where an arrow between the two Consoles doesn't cross it. */
const OBSERVE_LAYOUT: Layout = Object.freeze({ 'record': { x: 0, y: 0 }, 'console-in': { x: 320, y: 0 }, 'console-out': { x: 640, y: 0 }, 'transform': { x: 320, y: 300 } })

export const WORKFLOWS: readonly WorkflowPreset[] = Object.freeze([
  {
    id: 'simple', name: 'Simple: full name', description: 'The original playground: Record A → Console → Transform → Console.',
    records: [RECORD_ID], record: RECORD_ID, features: INITIAL_STEP_FEATURES, mapping: INITIAL_MAPPING, connections: INITIAL_CONNECTIONS, layout: INITIAL_POSITIONS,
  },
  {
    id: 'candidate-to-employee', name: 'Candidate to Employee', description: 'A Candidate who accepted an offer becomes an Employee (Transform v3).',
    records: candidates, record: 'candidate-amara', features: { ...v2Consoles, transform: 'orbit.transform@3' }, mapping: CANDIDATE_TO_EMPLOYEE, connections: INITIAL_CONNECTIONS, layout: INITIAL_POSITIONS,
  },
  {
    id: 'candidate-contact', name: 'Extract contact information', description: 'Who to contact about a Candidate, and how.',
    records: candidates, record: 'candidate-amara', features: { ...v2Consoles, transform: 'orbit.transform@3' }, mapping: CANDIDATE_CONTACT_MAPPING, connections: INITIAL_CONNECTIONS, layout: INITIAL_POSITIONS,
  },
  {
    id: 'observe-candidate', name: 'Observe a Candidate', description: 'Two Consoles observe a composed Candidate and hand it on unchanged. The Transform isn’t connected.',
    records: candidates, record: 'candidate-tomasz', features: { ...v2Consoles, transform: 'orbit.transform@3' }, mapping: CANDIDATE_TO_EMPLOYEE,
    connections: [{ source: 'record', target: 'console-in' }, { source: 'console-in', target: 'console-out' }], layout: OBSERVE_LAYOUT,
  },
].map((w) => Object.freeze(w as WorkflowPreset)))

export const SIMPLE = WORKFLOWS[0]!
export const workflowOf = (id: unknown) => WORKFLOWS.find((w) => w.id === id) ?? SIMPLE

/**
 * Work each kept-alive workflow would lose, gathered by the page so leaving Orbit from any one of
 * them names everything that leaving would discard, not just what's on screen.
 */
export interface WorkflowRisk {
  set(id: string, risk: (() => readonly string[]) | null): void
  /** Every other workflow's work, each prefixed with its name. */
  others(id: string): string[]
}
export const WORKFLOW_RISK = Symbol('workflow-risk')

/** The chosen Record's name, for the words that say whose data is shown (a Ref<string>; "Record A" by default). */
export const RECORD_NAME = Symbol('record-name')
