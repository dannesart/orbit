import {
  type Data, type DefinitionRef, type DefinitionVersion, type Issue, type Value, type WorkspaceRecord,
  frozenCopy, refOf, sameData, sameDefinition, validate, visibleIn,
} from './definitions'
import { type Mapping, type MappingIssue, checkMapping, evaluate } from './mappings'

/**
 * Features perform work; Orbit's execution boundary (invoke) does everything around them.
 *
 * A Feature stays small: it receives plain, already-validated, frozen data and returns data. It
 * never sees Records, workspaces, Definition references or storage. The boundary resolves what
 * the invocation refers to (only within the invoking workspace), validates the input, checks
 * the contract by exact Definition identity, runs the Feature, checks what came back, and
 * returns evidence of what happened. Features don't all work the same way, so each declares its
 * kind of contract:
 *
 *   'pass-through'  the output is the input, unchanged, with the same Definition (Orbit.Console).
 *                   The boundary verifies it rather than trusting the Feature.
 *   'mapping'       a Mapping gives the contracts: its `from` is the input, its `to` the output
 *                   (Orbit.Transform). The boundary validates the output against `to`.
 *
 * Nothing here persists or logs anything.
 */

export interface FeatureRef {
  readonly id: string
  readonly version: number
}

export interface InspectContext {
  /** Show this data to whoever invoked the Feature (in the playground: on screen). */
  readonly inspect: (data: Data) => void
}

export interface PassThroughFeature extends FeatureRef {
  readonly contract: 'pass-through'
  readonly run: (input: Data, context: InspectContext) => Data
}

export interface MappingFeature extends FeatureRef {
  readonly contract: 'mapping'
  readonly run: (input: Data, mapping: Mapping) => Data
}

export type Feature = PassThroughFeature | MappingFeature

/** Orbit.Console: shows what it receives and passes it on. */
export const orbitConsole: PassThroughFeature = {
  id: 'orbit.console',
  version: 1,
  contract: 'pass-through',
  run(input, { inspect }) {
    inspect(input)
    return input
  },
}

/** Orbit.Transform: builds an object, property by property, as its Mapping describes. */
export const orbitTransform: MappingFeature = {
  id: 'orbit.transform',
  version: 1,
  contract: 'mapping',
  run: (input, mapping) => Object.fromEntries(mapping.properties.map((p) => [p.name, evaluate(p.source, input)])),
}

/** What the boundary can resolve references against. In this experiment, plain in-memory lists. */
export interface Catalog {
  readonly definitions: readonly DefinitionVersion[]
  readonly records: readonly WorkspaceRecord[]
  readonly mappings: readonly Mapping[]
}

/** What a Feature is invoked on: a Record, by id, or a Value (such as another Feature's output). */
export type Input = { readonly record: string } | Value

export type Invocation =
  | { readonly workspaceId: string; readonly feature: PassThroughFeature; readonly input: Input }
  | { readonly workspaceId: string; readonly feature: MappingFeature; readonly input: Input; readonly mapping: FeatureRef }

/**
 * How an invocation ended. Exactly one, and only what the boundary actually saw:
 *   not_attempted  the Feature never ran; nothing it could do happened
 *   failed         it ran, and threw or broke its contract; its result went nowhere
 *   succeeded      it ran, and its output satisfies its contract
 * There is no "unknown": a pure Feature running in Orbit's own process always ends one of these
 * ways. That outcome arrives with the first Feature whose effects reach beyond Orbit.
 */
export type Outcome =
  | { readonly kind: 'succeeded' }
  | { readonly kind: 'not_attempted'; readonly reason: 'not_found' }
  | { readonly kind: 'not_attempted'; readonly reason: 'invalid_input'; readonly issues: readonly Issue[] }
  | { readonly kind: 'not_attempted'; readonly reason: 'contract_mismatch'; readonly expected: DefinitionRef; readonly actual: DefinitionRef }
  | { readonly kind: 'not_attempted'; readonly reason: 'invalid_mapping'; readonly issues: readonly MappingIssue[] }
  /** Only the error's name: messages can quote the data that caused them. */
  | { readonly kind: 'failed'; readonly reason: 'threw'; readonly error: string }
  | { readonly kind: 'failed'; readonly reason: 'invalid_output'; readonly issues: readonly Issue[] }
  | { readonly kind: 'failed'; readonly reason: 'pass_through_broken' }

/**
 * The facts of one invocation: which Feature version, which Mapping version, which Definition
 * versions, in which workspace, and the outcome. References and shapes only, never the data
 * itself: the values a Feature saw or produced are returned beside the evidence, not inside it.
 */
export interface Evidence {
  readonly workspaceId: string
  readonly feature: FeatureRef
  readonly mapping?: FeatureRef
  readonly input: { readonly record?: string; readonly definition?: DefinitionRef }
  readonly output?: { readonly definition: DefinitionRef }
  readonly outcome: Outcome
}

export interface InvocationResult {
  readonly evidence: Evidence
  /** Only when succeeded: the Value to hand on. */
  readonly output?: Value
  /** What the Feature showed (pass-through Features), for the invoker's eyes only. Never stored. */
  readonly observations: readonly Data[]
}

/** Runs one Feature on one input, within one workspace, and reports truthfully what happened. */
export function invoke(catalog: Catalog, invocation: Invocation): InvocationResult {
  const { workspaceId, feature, input } = invocation
  const mappingRef = 'mapping' in invocation ? { id: invocation.mapping.id, version: invocation.mapping.version } : undefined
  const evidence: { -readonly [K in keyof Omit<Evidence, 'outcome' | 'output'>]: Evidence[K] } = {
    workspaceId,
    feature: { id: feature.id, version: feature.version },
    ...(mappingRef ? { mapping: mappingRef } : {}),
    input: 'record' in input ? { record: input.record } : { definition: refOf(input.definition) },
  }
  const end = (outcome: Outcome, rest: Partial<Omit<InvocationResult, 'evidence'>> = {}, output?: DefinitionRef): InvocationResult => ({
    observations: [],
    ...rest,
    evidence: frozenCopy({ ...evidence, ...(output ? { output: { definition: refOf(output) } } : {}), outcome }),
  })
  const definition = (ref: DefinitionRef) =>
    catalog.definitions.find((d) => sameDefinition(d, ref) && visibleIn(d, workspaceId)) ?? null

  // 1. Resolve the input, only within this workspace. Another workspace's Record or Definition is
  //    indistinguishable from one that doesn't exist.
  let value: Value
  if ('record' in input) {
    const record = catalog.records.find((r) => r.id === input.record && r.workspaceId === workspaceId)
    if (!record) return end({ kind: 'not_attempted', reason: 'not_found' })
    value = { definition: refOf(record.definition), data: record.data }
    evidence.input = { record: record.id, definition: refOf(record.definition) }
  } else {
    value = { definition: refOf(input.definition), data: input.data }
  }
  const inputDefinition = definition(value.definition)
  if (!inputDefinition) return end({ kind: 'not_attempted', reason: 'not_found' })

  // 2. The input must be what it claims to be, whoever made it.
  const inputIssues = validate(inputDefinition, value.data)
  if (inputIssues.length) return end({ kind: 'not_attempted', reason: 'invalid_input', issues: inputIssues })

  // From here on, the Feature only ever sees a private, frozen copy.
  const data = frozenCopy(value.data)
  const handedOn: Value = frozenCopy({ definition: value.definition, data })

  if (invocation.feature.contract === 'pass-through') {
    const observations: Data[] = []
    let returned: unknown
    try {
      returned = invocation.feature.run(data, { inspect: (seen) => observations.push(frozenCopy(seen)) })
    } catch (error) {
      return end({ kind: 'failed', reason: 'threw', error: errorName(error) }, { observations })
    }
    // 3. Pass-through means exactly that: the same data, handed on with the same Definition.
    if (!sameData(returned, data)) return end({ kind: 'failed', reason: 'pass_through_broken' }, { observations })
    return end({ kind: 'succeeded' }, { output: handedOn, observations }, handedOn.definition)
  }

  // A mapping Feature: the Mapping, from this workspace, gives the contracts.
  const ref = mappingRef!
  const mapping = catalog.mappings.find((m) => m.id === ref.id && m.version === ref.version && m.workspaceId === workspaceId)
  const outputDefinition = mapping && definition(mapping.to)
  if (!mapping || !definition(mapping.from) || !outputDefinition) return end({ kind: 'not_attempted', reason: 'not_found' })

  // 3. Exact identity: the input must be of the very Definition version the Mapping reads.
  if (!sameDefinition(mapping.from, value.definition)) {
    return end({ kind: 'not_attempted', reason: 'contract_mismatch', expected: refOf(mapping.from), actual: refOf(value.definition) })
  }
  const mappingIssues = checkMapping(mapping, inputDefinition).issues
  if (mappingIssues.length) return end({ kind: 'not_attempted', reason: 'invalid_mapping', issues: mappingIssues })

  let produced: unknown
  try {
    produced = invocation.feature.run(data, mapping)
  } catch (error) {
    return end({ kind: 'failed', reason: 'threw', error: errorName(error) })
  }
  // 4. Nothing leaves unless it satisfies the output contract.
  const outputIssues = validate(outputDefinition, produced)
  if (outputIssues.length) return end({ kind: 'failed', reason: 'invalid_output', issues: outputIssues })
  const output: Value = frozenCopy({ definition: refOf(outputDefinition), data: produced as Data })
  return end({ kind: 'succeeded' }, { output }, output.definition)
}

const errorName = (error: unknown) => (error instanceof Error ? error.name : 'Error')
