import {
  type Data, type DefinitionIssue, type DefinitionRef, type DefinitionVersion, type Issue, type PropertyPath, type Resolve, type Value, type WorkspaceRecord,
  checkContract, frozenCopy, localObjectPaths, refOf, referencePaths, sameData, sameDefinition, validate, visibleIn,
} from './definitions'
import { type AnyMappingIssue, type Mapping, checkMapping, checkNestedMapping, evaluate, evaluatePresent } from './mappings'

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
 * Compatibility is not execution. Whether a Feature version accepts what it is about to be handed
 * is decided first, from contracts alone (Definitions and the Mapping, never data), without
 * calling the Feature (mappingCompatibility). Execution (run) is the version's original behaviour,
 * unchanged, and is only reached for what compatibility accepted. So refusing something a version
 * has no behaviour for never means changing how that version behaves.
 *
 * Feature versions guarantee behaviour. A Feature version (id + version) names one fixed
 * behaviour: the contracts it accepts and what it does with them. Changing either, including
 * accepting something it used to refuse, makes a new version; the earlier version stays exactly as
 * it was, under its own identity, for as long as anything may invoke it or name it. Evidence names
 * the version that actually ran (the Feature object invoked, never a "current" alias), so earlier
 * evidence is never relabelled.
 *
 * Choosing a version is explicit. Mappings name no Feature version: a Mapping is judged against
 * whichever version is invoked with it, before it runs (mappingCompatibility), so the same Mapping may
 * suit one version and be refused by another. Which version a step invokes changes only when someone
 * chooses another: nothing upgrades a step, a Mapping or a Definition by itself.
 *
 * Provisional versions. A Feature version still being built on an experimental branch is marked
 * `provisional`: it has never been published, so nothing outside the experiment invokes it, and its
 * capabilities may still grow there (Transform v3: nested reads and building objects now; copying
 * whole values in a later phase). Publishing it freezes it: the capabilities it has at that moment
 * become its behaviour for good, the mark is removed, and any later change is a new version. This is
 * no exception to "Feature versions guarantee behaviour": that guarantee starts at publication, and
 * a published version is never changed, provisional or not before.
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

/**
 * Whether a version accepts a kind of contract: not at all, on both sides, or only in what it
 * reads (a mapping Feature that reads composed Definitions but makes flat ones: Transform v3).
 */
export type ContractAcceptance = 'unsupported' | 'supported' | 'input-only'

/** What every Feature version declares, whatever its kind of contract. */
interface FeatureVersion extends FeatureRef {
  /** Still being built on an experimental branch, never published (see above). Absent once published. */
  readonly provisional?: true
  /**
   * Whether it accepts Definitions that contain local objects. The versions made when Definitions
   * were flat (Console v1, Transform v1 and v2) don't: a Definition with a local object, on either
   * side, is refused before they run (unsupported_contract). Accepting them changes what a version
   * accepts, so only a new version may (Console v2).
   */
  readonly localObjects: ContractAcceptance
  /**
   * Whether it accepts Definitions that contain references to other Definitions (anywhere, local
   * objects included). Likewise only versions made to: the others refuse them before running
   * (unsupported_contract). Accepting them, the whole pinned contract is resolved and checked by
   * the boundary first (invalid_contract when it doesn't resolve), then the data validated against it.
   */
  readonly references: ContractAcceptance
}

export interface PassThroughFeature extends FeatureVersion {
  readonly contract: 'pass-through'
  readonly run: (input: Data, context: InspectContext) => Data
}

export interface MappingFeature extends FeatureVersion {
  readonly contract: 'mapping'
  /**
   * What it does when a source reads an optional input property that is absent, which decides the
   * Mappings it accepts (checkMapping):
   *   'unsupported'  it has no behaviour for absence, so a Mapping that reads an optional input
   *                  property is refused before it runs (absence_unsupported)
   *   'omitted'      the output property is left out; a required one fed that way is refused
   *                  before it runs (may_be_absent)
   */
  readonly absence: 'unsupported' | 'omitted'
  /**
   * Which sources it reads: 'flat' (top-level properties: v1, v2), or 'nested' too (paths into local
   * objects and referenced Definitions: v3). A version reading flat sources refuses a path source
   * before running (unsupported_source); one reading nested sources reports problems located in two
   * parts (MappingProblemLocation).
   */
  readonly sources: 'flat' | 'nested'
  readonly run: (input: Data, mapping: Mapping) => Data
}

export type Feature = PassThroughFeature | MappingFeature

/** What every Orbit.Console version does: shows what it receives, exactly, and passes it on. */
const showAndPassOn: PassThroughFeature['run'] = (input, { inspect }) => {
  inspect(input)
  return input
}

/** Orbit.Console v1: shows what it receives and passes it on. Flat Definitions only, as published. */
export const orbitConsole: PassThroughFeature = {
  id: 'orbit.console',
  version: 1,
  contract: 'pass-through',
  localObjects: 'unsupported',
  references: 'unsupported',
  run: showAndPassOn,
}

/**
 * Orbit.Console v2: v1's very behaviour (the same run), for composed Definitions too: local
 * objects and references to other Definitions, at any depth Orbit allows. What it receives was
 * resolved and validated by the boundary against the complete pinned contract; it shows exactly
 * that and passes it on unchanged, with the same Definition version. Nothing is flattened,
 * normalised or filled in: an absent optional object stays absent, an empty one stays empty.
 */
export const orbitConsoleV2: PassThroughFeature = {
  id: 'orbit.console',
  version: 2,
  contract: 'pass-through',
  localObjects: 'supported',
  references: 'supported',
  run: showAndPassOn,
}

/**
 * Orbit.Transform v1: builds an object, property by property, as its Mapping describes. Its
 * original behaviour, kept exactly: it was made when every property was required, so it has no
 * behaviour for absence, and Mappings that read optional input properties aren't accepted for it.
 */
export const orbitTransformV1: MappingFeature = Object.freeze<MappingFeature>({
  id: 'orbit.transform',
  version: 1,
  contract: 'mapping',
  absence: 'unsupported',
  sources: 'flat',
  localObjects: 'unsupported',
  references: 'unsupported',
  run: (input, mapping) => Object.fromEntries(mapping.properties.map((p) => [p.name, evaluate(p.source, input)])),
})

/**
 * Orbit.Transform v2: v1, plus optional properties. A property whose source reads an absent
 * (optional) input property is left out, never filled in; a required output property can't be fed
 * that way (refused before running), and the boundary checks the result against the output
 * Definition. With every property present it makes exactly what v1 makes.
 */
export const orbitTransformV2: MappingFeature = Object.freeze<MappingFeature>({
  id: 'orbit.transform',
  version: 2,
  contract: 'mapping',
  absence: 'omitted',
  sources: 'flat',
  localObjects: 'unsupported',
  references: 'unsupported',
  run: (input, mapping) => buildPresent(input, mapping),
})

/**
 * What Transform v2 does, and v3 with it: each property from its source, left out when the source
 * reads something absent. The very same function for both: v3 adds what it may be handed (nested
 * sources, composed inputs), checked before running, not a different way of building.
 */
function buildPresent(input: Data, mapping: Mapping): Data {
  return Object.fromEntries(mapping.properties.flatMap((p) => {
    const result = evaluatePresent(p.source, input)
    return result.present ? [[p.name, result.value]] : []
  }))
}

/**
 * Orbit.Transform v3 (provisional): v2, plus nested reads and built objects. Its Mappings may read
 * values inside local objects and referenced Definitions by structured path ({ kind: 'path' }),
 * resolved through the complete pinned input contract (absence follows every optional property along
 * a path, by v2's rule), and build output objects property by property ({ kind: 'construct' }):
 * local objects and values of exactly referenced Definition versions, with explicit presence and
 * presence guarantees (mappings.ts). It accepts composed Definitions on both sides. Every flat
 * Mapping v2 accepts, v3 accepts and runs to exactly the same result (the same building function);
 * only how problems are located differs (in two parts). Still being built here: see "Provisional
 * versions" (whole-value copying is next).
 */
export const orbitTransformV3: MappingFeature = Object.freeze<MappingFeature>({
  id: 'orbit.transform',
  version: 3,
  provisional: true,
  contract: 'mapping',
  absence: 'omitted',
  sources: 'nested',
  localObjects: 'supported',
  references: 'supported',
  run: buildPresent,
})

/**
 * Whether this Feature version accepts a Definition as one of its contracts: the local objects and
 * references it can't take (none: it can), local objects first. Decided from the Definition alone,
 * never calling run and never resolving a reference: a reference is refused for what it is.
 */
export function contractCompatibility(feature: Feature, definition: DefinitionVersion, side: 'input' | 'output' = 'input'): readonly PropertyPath[] {
  const accepts = (support: ContractAcceptance) => support === 'supported' || (support === 'input-only' && side === 'input')
  return [
    ...(accepts(feature.localObjects) ? [] : localObjectPaths(definition.fields)),
    ...(accepts(feature.references) ? [] : referencePaths(definition.fields)),
  ]
}

/**
 * Whether this Feature version accepts this Mapping between these Definitions: the problems that
 * mean it must not run (none: it may). Decided from contracts alone, never calling run, so it can
 * be asked before running, or without running at all. It includes what the version does with
 * absence (MappingFeature['absence']): v1 can't take a Mapping that reads an optional property;
 * for v2 a required output can't be fed by a source that may have no value.
 */
export function mappingCompatibility(feature: MappingFeature, mapping: Pick<Mapping, 'properties'>, input: DefinitionVersion, output: DefinitionVersion, resolve?: Resolve): readonly AnyMappingIssue[] {
  return feature.sources === 'nested'
    ? checkNestedMapping(mapping, input, output, { absence: feature.absence, resolve }).issues
    : checkMapping(mapping, input, output, feature.absence).issues
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
  /** Path-located issues from flat versions (v1, v2); two-part located ones from nested versions (v3). */
  | { readonly kind: 'not_attempted'; readonly reason: 'invalid_mapping'; readonly issues: readonly AnyMappingIssue[] }
  /** The Definition doesn't resolve here as a contract (a reference missing, unavailable or cyclic, or too deep): nothing was checked against it. */
  | { readonly kind: 'not_attempted'; readonly reason: 'invalid_contract'; readonly definition: DefinitionRef; readonly issues: readonly DefinitionIssue[] }
  /** The Feature version doesn't accept this Definition at all: `paths` are the local objects and references it has no behaviour for. */
  | { readonly kind: 'not_attempted'; readonly reason: 'unsupported_contract'; readonly definition: DefinitionRef; readonly paths: readonly PropertyPath[] }
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
  // The one resolver: exact identity, only what this workspace may see. References resolve through
  // it too, so another workspace's versions can't be reached through a reference either.
  const definition: Resolve = (ref) =>
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
  // The whole contract must resolve here (every reference exactly, allowed, acyclic, within the
  // depth limit) and be one this Feature version accepts, before any data is looked at.
  const unusable = (d: DefinitionVersion, side: 'input' | 'output') => {
    const issues = checkContract(d, definition)
    if (issues.length) return end({ kind: 'not_attempted', reason: 'invalid_contract', definition: refOf(d), issues })
    const paths = contractCompatibility(feature, d, side)
    return paths.length ? end({ kind: 'not_attempted', reason: 'unsupported_contract', definition: refOf(d), paths }) : null
  }
  const inputUnusable = unusable(inputDefinition, 'input')
  if (inputUnusable) return inputUnusable

  // 2. The input must be what it claims to be, whoever made it.
  const inputIssues = validate(inputDefinition, value.data, definition)
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
  const outputUnusable = unusable(outputDefinition, 'output')
  if (outputUnusable) return outputUnusable
  // Compatibility, before execution: does this Feature version accept this Mapping at all?
  const mappingIssues = mappingCompatibility(invocation.feature, mapping, inputDefinition, outputDefinition, definition)
  if (mappingIssues.length) return end({ kind: 'not_attempted', reason: 'invalid_mapping', issues: mappingIssues })

  let produced: unknown
  try {
    produced = invocation.feature.run(data, mapping)
  } catch (error) {
    return end({ kind: 'failed', reason: 'threw', error: errorName(error) })
  }
  // 4. Nothing leaves unless it satisfies the output contract.
  const outputIssues = validate(outputDefinition, produced, definition)
  if (outputIssues.length) return end({ kind: 'failed', reason: 'invalid_output', issues: outputIssues })
  const output: Value = frozenCopy({ definition: refOf(outputDefinition), data: produced as Data })
  return end({ kind: 'succeeded' }, { output }, output.definition)
}

const errorName = (error: unknown) => (error instanceof Error ? error.name : 'Error')
