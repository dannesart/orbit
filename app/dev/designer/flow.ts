// Experiment #8, meaningful connections: what the canvas's arrows mean, apart from the canvas.
//
// A connection says that a step hands its Value on to another step, by their identities (never by
// where they're drawn). From Record A, the connections make one path; only the steps on it run,
// in its order, each with the previous step's output. Steps off the path may sit there while you
// design; they never run. One path only: a step hands on to at most one step and receives from at
// most one, nothing hands on to Record A, and there are no loops.
//
// Whether a connection makes sense comes from the Features' own contracts, nothing added:
//   Console    'pass-through': accepts a Value of any Definition its version accepts, hands on the same.
//   Transform  'mapping': reads exactly its Mapping's `from` (identity and version), makes its `to`.
// Which Definitions a step's Feature version accepts at all (flat only, or local objects and
// references too) is the domain's own rule (contractCompatibility), for the version that step invokes.
// The boundary (shared/features, invoke) still checks every invocation; this only says ahead of
// time what it would say. Nothing here changes a contract, a Mapping or a Definition.
import { type DefinitionRef, type DefinitionVersion, propertyPathWords, sameDefinition, sameFields } from '#shared/features/definitions'
import { type Catalog, type FeatureRef, type Input, type InvocationResult, type MappingFeature, type PassThroughFeature, contractCompatibility, invoke } from '#shared/features/features'
import { RECORD_ID } from '../features/experiment'

export const STEPS = ['record', 'console-in', 'transform', 'console-out'] as const
export type StepId = (typeof STEPS)[number]
export type FeatureStep = Exclude<StepId, 'record'>

export interface Connection {
  readonly source: StepId
  readonly target: StepId
}
export const connectionKey = (c: Connection) => `${c.source}->${c.target}`

/** How the playground starts: Record A → Console → Transform → Console. */
export const INITIAL_CONNECTIONS: readonly Connection[] = Object.freeze([
  { source: 'record', target: 'console-in' },
  { source: 'console-in', target: 'transform' },
  { source: 'transform', target: 'console-out' },
].map((c) => Object.freeze(c as Connection)))

const TITLES: Record<StepId, string> = { 'record': 'Record A', 'console-in': 'Console', 'transform': 'Transform', 'console-out': 'Console' }
export const stepTitle = (id: StepId) => TITLES[id]
const isConsole = (id: StepId) => id === 'console-in' || id === 'console-out'

/** The path that runs: Record A, then each step its predecessor hands on to. */
export function pathOf(connections: readonly Connection[]): StepId[] {
  const path: StepId[] = ['record']
  for (;;) {
    const next = connections.find((c) => c.source === path.at(-1))?.target
    if (!next || path.includes(next)) return path
    path.push(next)
  }
}

/** A step's place on the path: Record A starts it, the Features are numbered; off the path, none. */
export function stepBadge(id: StepId, path: readonly StepId[]): string {
  const at = path.indexOf(id)
  return at === 0 ? 'Start' : at > 0 ? String(at) : '–'
}

/** What the contracts are right now: Record A's pinned Definition and the applied Mapping's. */
export interface Contracts {
  readonly record: DefinitionRef
  readonly transform: { readonly reads: DefinitionRef; readonly makes: DefinitionRef }
  /** Definition versions by name, for words (and to recognise a look-alike). */
  readonly definitions: readonly DefinitionVersion[]
  readonly label: (ref: DefinitionRef) => string
  /** The exact Feature version each step invokes, and how it's named for people. */
  readonly features: StepFeatures
  readonly featureLabel: (step: FeatureStep) => string
}

/**
 * What each step hands on, where that's known: Record A its Definition, Transform its Mapping's
 * output, a Console whatever reaches it along the path. A Console off the path receives nothing,
 * so what it would hand on isn't known (and nothing is judged by it).
 */
export function handsOn(connections: readonly Connection[], contracts: Contracts): Map<StepId, DefinitionRef> {
  const known = new Map<StepId, DefinitionRef>([['record', contracts.record], ['transform', contracts.transform.makes]])
  const path = pathOf(connections)
  for (const [i, step] of path.entries()) if (i > 0 && isConsole(step)) known.set(step, known.get(path[i - 1]!)!)
  return known
}

/**
 * Why `ref` can't go into `target`, in words; null when it can. Transform reads exactly its
 * Mapping's input; and any step's Feature version may not accept the Definition at all.
 */
function contractProblem(source: StepId, target: StepId, ref: DefinitionRef | undefined, contracts: Contracts, attempt: boolean): string | null {
  if (target === 'record' || !ref) return null
  const find = (r: DefinitionRef) => contracts.definitions.find((d) => sameDefinition(d, r))
  const mismatch = target === 'transform' ? readsProblem(source, ref, contracts, attempt) : null
  if (mismatch) return mismatch
  // The very check the boundary makes before running, for the version this step invokes.
  const definition = find(ref)
  const refused = definition ? contractCompatibility(contracts.features[target], definition) : []
  if (!refused.length) return null
  const what = `it has objects or other Definitions inside it (${refused.map(propertyPathWords).join(', ')})`
  return attempt
    ? `${contracts.featureLabel(target)} doesn’t accept ${contracts.label(ref)}, which ${subject(source).replace(/^This/, 'this')} hands on: ${what}.`
    : `${contracts.featureLabel(target)} doesn’t accept ${contracts.label(ref)}: ${what}.`
}

/** Transform reads exactly its Mapping's input Definition version. */
function readsProblem(source: StepId, ref: DefinitionRef, contracts: Contracts, attempt: boolean): string | null {
  const reads = contracts.transform.reads
  if (sameDefinition(reads, ref)) return null
  const find = (r: DefinitionRef) => contracts.definitions.find((d) => sameDefinition(d, r))
  const a = find(reads)
  const b = find(ref)
  const lookalike = a && b && a.id !== b.id && sameFields(a.fields, b.fields) ? ' Same properties, but a different Definition.' : ''
  // Trying to connect: what each side has. Already connected: what Transform gets.
  return attempt
    ? `Transform reads ${contracts.label(reads)}. ${subject(source)} hands on ${contracts.label(ref)}.${lookalike}`
    : `Transform reads ${contracts.label(reads)}, but receives ${contracts.label(ref)}.${lookalike}`
}

const subject = (id: StepId) => (isConsole(id) ? 'This Console' : stepTitle(id))
const object = (id: StepId) => (isConsole(id) ? 'a Console' : stepTitle(id))

export type Verdict = { readonly ok: true } | { readonly ok: false; readonly reason: string }

/**
 * Whether `candidate` may join `connections` (pass `replacing` when an existing connection is being
 * moved). Refuses what would break the one path (branching, merging, loops, into Record A) and
 * what the receiving Feature's contract would refuse. Nothing is adapted to make it fit.
 */
export function checkConnection(connections: readonly Connection[], candidate: Connection, contracts: Contracts, replacing?: Connection): Verdict {
  const others = replacing ? connections.filter((c) => connectionKey(c) !== connectionKey(replacing)) : connections
  const { source, target } = candidate
  const no = (reason: string): Verdict => ({ ok: false, reason })
  if (source === target) return no('A step can’t hand on to itself.')
  if (target === 'record') return no('Record A is where the flow starts. Nothing hands on to it.')
  if (others.some((c) => c.source === source && c.target === target)) return no('They’re already connected.')
  const out = others.find((c) => c.source === source)
  if (out) return no(`${subject(source)} already hands on to ${object(out.target)}. One path only: disconnect that first.`)
  const into = others.find((c) => c.target === target)
  if (into) return no(`${isConsole(target) ? 'That Console' : stepTitle(target)} already receives from ${object(into.source)}. A step takes one input.`)
  // A loop: the target already leads back to the source.
  for (let at: StepId | undefined = target, seen = 0; at && seen < STEPS.length; at = others.find((c) => c.source === at)?.target, seen++) {
    if (at === source) return no('That would make a loop. The flow runs one way, from Record A.')
  }
  const problem = contractProblem(source, target, handsOn(others, contracts).get(source), contracts, true)
  return problem ? no(problem) : { ok: true }
}

/** The connections the contracts can't accept now (after Record A was pinned elsewhere, say). */
export function connectionProblems(connections: readonly Connection[], contracts: Contracts): Map<string, string> {
  const known = handsOn(connections, contracts)
  const problems = new Map<string, string>()
  for (const c of connections) {
    const problem = contractProblem(c.source, c.target, known.get(c.source), contracts, false)
    if (problem) problems.set(connectionKey(c), problem)
  }
  return problems
}

/**
 * The exact Feature version each step invokes. Every step names its own: nothing here assumes a
 * version, and none changes unless someone chooses another. Evidence names the version that ran.
 */
export interface StepFeatures {
  readonly 'console-in': PassThroughFeature
  readonly 'transform': MappingFeature
  readonly 'console-out': PassThroughFeature
}
/** The versions the playground's steps have always invoked, by key (featureKey): Console v1, Transform v2, Console v1. */
export const INITIAL_STEP_FEATURES: Readonly<Record<FeatureStep, string>> = Object.freeze({
  'console-in': 'orbit.console@1',
  'transform': 'orbit.transform@2',
  'console-out': 'orbit.console@1',
})

/** One run of the path: which steps were on it, in order, and each invoked step's result. */
export interface FlowRun {
  readonly path: readonly StepId[]
  readonly steps: Readonly<Partial<Record<FeatureStep, InvocationResult>>>
}

/**
 * Runs the path, and only the path: each step is invoked through the boundary with the previous
 * step's output (the first with Record A itself), and nothing follows a step that didn't succeed.
 * Steps off the path are never invoked. A path of Record A alone invokes nothing.
 */
export function runFlow(
  catalog: Catalog,
  connections: readonly Connection[],
  options: { features: StepFeatures; mapping: FeatureRef; workspaceId: string },
): FlowRun {
  const path = Object.freeze(pathOf(connections))
  const steps: Partial<Record<FeatureStep, InvocationResult>> = {}
  let input: Input = { record: RECORD_ID }
  for (const step of path.slice(1) as FeatureStep[]) {
    const { workspaceId, features } = options
    const result: InvocationResult = step === 'transform'
      ? invoke(catalog, { workspaceId, feature: features.transform, input, mapping: options.mapping })
      : invoke(catalog, { workspaceId, feature: features[step], input })
    steps[step] = result
    if (!result.output) break
    input = result.output
  }
  return Object.freeze({ path, steps: Object.freeze(steps) })
}

/** How a run went as a whole: nothing ran, it stopped at a step, or every step on it succeeded. */
export function flowOutcome(run: FlowRun): { kind: 'nothing' } | { kind: 'stopped'; at: FeatureStep } | { kind: 'completed' } {
  const ran = run.path.slice(1) as FeatureStep[]
  if (!ran.length) return { kind: 'nothing' }
  const at = ran.find((s) => run.steps[s]?.evidence.outcome.kind !== 'succeeded')
  return at ? { kind: 'stopped', at } : { kind: 'completed' }
}

/** A path in words: "Record A → Console → Transform". */
export const pathWords = (path: readonly StepId[]) => path.map(stepTitle).join(' → ')


/**
 * What reaches a step along the connections, as far as it's known: the step connected into it, and
 * the Definition version that step hands on (handsOn). Nothing connected: none. Connected from a
 * step whose hand-on isn't known (a Console that receives nothing): the step, with no Definition.
 * Only what the connections already say; nothing here changes a contract or a Mapping.
 */
export interface Incoming {
  readonly from: StepId | null
  readonly ref: DefinitionRef | null
}
export function incomingTo(step: StepId, connections: readonly Connection[], contracts: Contracts): Incoming {
  const from = connections.find((c) => c.target === step)?.source ?? null
  return { from, ref: from ? handsOn(connections, contracts).get(from) ?? null : null }
}

/**
 * How what a Transform reads relates to what reaches it:
 *   matches   what reaches it is exactly the Definition version it reads
 *   differs   something else reaches it: shown, never reconciled
 *   unknown   it's connected, but what reaches it isn't known
 *   none      nothing is connected into it; its Mapping is kept as it is
 */
export type InputRelation = 'matches' | 'differs' | 'unknown' | 'none'
export function inputRelation(incoming: Incoming, reads: DefinitionRef): InputRelation {
  if (!incoming.from) return 'none'
  if (!incoming.ref) return 'unknown'
  return sameDefinition(incoming.ref, reads) ? 'matches' : 'differs'
}
