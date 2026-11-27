// The Transform's configuration (Experiment #4): what it creates (an output Definition version)
// and how (a Mapping version), applied together as one deliberate action, each keeping its own
// identity and versions.
//
//   The output is an existing Definition from the playground's catalogue, or one this Transform
//   defines for itself (a "local" Definition: one identity, LOCAL_ID, scoped to this Transform and
//   never offered in the catalogue). A local Definition's draft changes freely; Apply freezes a
//   new version only when its structure changed.
//   A Mapping's identity names its contracts. shared/features revises a Mapping with "the same
//   identity and contracts" (reviseMapping), and evidence names a Mapping only by id and version,
//   so the output version is part of the Mapping's identity: one Mapping per output Definition
//   version, with its own versions. A new output version therefore starts a new Mapping (v1).
//   Likewise its input: the Transform reads Definition A · v1 unless another input is chosen
//   (Phase 4.2, to read composed inputs with Transform v3). A Mapping from Definition A keeps the
//   identity it always had; one from another input has its own.
//   Nothing here changes the domain; it only decides which immutable versions to make.
import {
  type DefinitionRef, type DefinitionVersion, type Field, type Resolve, checkPropertyNames, deepFreeze, defineVersion, frozenCopy, refOf, sameDefinition, sameFields, visibleIn,
} from '#shared/features/definitions'
import { type Mapping, type MappingProperty, reviseMapping, sameMappingProperties } from '#shared/features/mappings'
import type { FeatureRef, MappingFeature, Outcome } from '#shared/features/features'
import type { StepId } from './flow'

/** One run, as the Transform step's evidence recorded it: exact versions, never the draft. */
export interface RunRecord {
  readonly number: number
  /** null when the Transform wasn't invoked in that run. */
  readonly outcome: Outcome | null
  /** The Transform version that ran, as its evidence names it; null when it wasn't invoked. */
  readonly feature: FeatureRef | null
  readonly mapping: FeatureRef | null
  /** The output Definition that Mapping version names (immutable, so this can't drift). */
  readonly output: DefinitionRef | null
  /**
   * The path that run followed, from Record A (Experiment #8), frozen: the connections it used.
   * Connecting differently afterwards changes the design, never this.
   */
  readonly path: readonly StepId[]
}
import { A1, B1, DEFINITIONS, INITIAL_MAPPING, WORKSPACE, definitionLabel, describeNamingIssues } from '../features/experiment'
import { type DraftProperty, fromDraft, toDraft } from './parts'
import { type DraftReview, reviewDraft } from './preview'
import type { Problem } from './problems'
import { boundaryFindings, transformSupport } from './support'

/** The one Definition identity this Transform may define for itself. */
export const LOCAL_ID = 'transform.output'
export const isLocal = (ref: DefinitionRef) => ref.id === LOCAL_ID

export interface LocalDraft {
  readonly name: string
  readonly fields: readonly Field[]
}

/** Everything the person is editing. Only Apply turns it into versions. */
export interface TransformDraft {
  /** The Definition version the Transform reads: Definition A · v1 unless another was chosen. */
  readonly input?: DefinitionRef
  readonly use: 'catalogue' | 'local'
  /** The catalogue choice, kept while the local one is in use (and the other way round). */
  readonly catalogue: DefinitionRef
  readonly local: LocalDraft
  readonly properties: readonly DraftProperty[]
  /**
   * Mappings set aside when another output Definition was chosen (switching.ts): kept exactly, to
   * come back when a Definition they fit is chosen again. Never previewed, validated or applied.
   */
  readonly aside?: readonly DraftProperty[]
}

/**
 * A Definition version the Transform may use besides the playground's samples (Experiment #7): one
 * made in the workspace the Designer was opened from, or one Orbit provides. `name` is what people
 * call that Definition now (experimental metadata): never identity, and never part of the version.
 */
export interface Offered {
  readonly definition: DefinitionVersion
  readonly name: string
  readonly source: 'workspace' | 'orbit'
}

/** What's applied, and every version ever applied (all immutable). */
export interface Configuration {
  /** What else this session may use, fixed when the Designer opens (Experiment #7). */
  readonly offered?: readonly Offered[]
  readonly locals: readonly DefinitionVersion[]
  readonly mappings: readonly Mapping[]
  readonly output: DefinitionRef
  readonly mapping: FeatureRef
}

export const initialConfiguration = (offered: readonly Offered[] = []): Configuration => ({
  ...(offered.length ? { offered } : {}),
  locals: [],
  mappings: [INITIAL_MAPPING],
  output: refOf(B1),
  mapping: { id: INITIAL_MAPPING.id, version: INITIAL_MAPPING.version },
})

/**
 * Catalogue Definitions this workspace can use as an output: the playground's own samples and what
 * it's offered. Never another workspace's, not even to show that it exists.
 */
export const catalogue = (offered: readonly Offered[] = []) =>
  [...DEFINITIONS.filter((d) => visibleIn(d, WORKSPACE)), ...offered.map((o) => o.definition)]

/** Every Definition version a run may need: the samples, what's offered and this Transform's own. */
export const allDefinitions = (config: Configuration): readonly DefinitionVersion[] =>
  [...DEFINITIONS, ...(config.offered ?? []).map((o) => o.definition), ...config.locals]

export function findDefinition(config: Configuration, ref: DefinitionRef): DefinitionVersion | null {
  return allDefinitions(config).find((d) => sameDefinition(d, ref)) ?? null
}

export const findMapping = (config: Configuration, ref: FeatureRef) => config.mappings.find((m) => m.id === ref.id && m.version === ref.version) ?? null

/** A Definition version in words: a catalogue one by its name, a local one as this Transform's own. */
export function labelOf(config: Configuration, ref: DefinitionRef): string {
  const offered = config.offered?.find((o) => sameDefinition(o.definition, ref))
  // The exact version's own, publication-time name: what it's called now (offered.name) is catalogue metadata.
  if (offered) return `${offered.definition.name} · v${ref.version}`
  if (!isLocal(ref)) return definitionLabel(ref)
  const local = config.locals.find((d) => sameDefinition(d, ref))
  return `${local?.name ?? 'This Transform’s output'} · v${ref.version}`
}

/** The applied configuration as a draft (what Discard returns to). */
export function draftFrom(config: Configuration): TransformDraft {
  const latestLocal = config.locals.at(-1)
  const applied = findDefinition(config, config.output)!
  const from = findMapping(config, config.mapping)!.from
  return {
    ...(sameDefinition(from, A1) ? {} : { input: refOf(from) }),
    use: isLocal(config.output) ? 'local' : 'catalogue',
    catalogue: isLocal(config.output) ? refOf(B1) : refOf(config.output),
    // A local output starts as a copy of the current output's properties, to change freely.
    local: latestLocal ? { name: latestLocal.name, fields: latestLocal.fields } : { name: 'Transform output', fields: applied.fields },
    properties: toDraft(findMapping(config, config.mapping)!.properties),
  }
}

/** Whether the local draft is that version: the same name and the same contract (order is presentation). */
const sameStructure = (d: DefinitionVersion, local: LocalDraft) => d.name === local.name && sameFields(d.fields, local.fields)

/** What the draft's output is: an existing version, or the next local version Apply would freeze. */
export function outputOf(config: Configuration, draft: TransformDraft): { definition: DefinitionVersion; label: string; isNew: boolean } {
  if (draft.use === 'catalogue') {
    const definition = catalogue(config.offered).find((d) => sameDefinition(d, draft.catalogue)) ?? B1
    return { definition, label: labelOf(config, definition), isNew: false }
  }
  const latest = config.locals.at(-1)
  if (latest && sameStructure(latest, draft.local)) return { definition: latest, label: `${latest.name} · v${latest.version}`, isNew: false }
  const version = (latest?.version ?? 0) + 1
  const definition: DefinitionVersion = { id: LOCAL_ID, version, name: draft.local.name, workspaceId: WORKSPACE, fields: draft.local.fields }
  return { definition, label: `${draft.local.name || 'This Transform’s output'} · v${version} (draft)`, isNew: true }
}

/** Why a local output can't be frozen as a Definition version yet, as structured problems. */
export function structureFindings(draft: TransformDraft): Problem[] {
  if (draft.use !== 'local') return []
  const { name, fields } = draft.local
  const words: string[] = []
  if (!name.trim()) words.push('Give the output a name.')
  if (!fields.length) words.push('Add at least one property.')
  // Orbit's naming rule, the one the Studio uses too.
  words.push(...describeNamingIssues(checkPropertyNames(fields.map((f) => f.name))))
  return words.map((w) => ({ kind: 'structure', category: 'invalid', at: null, index: null, words: w, short: w }))
}

/** Why a local output can't be frozen as a Definition version yet, in words. */
export const structureProblems = (draft: TransformDraft): string[] => structureFindings(draft).map((p) => p.words)

/** What the draft reads: its chosen input, or Definition A · v1. */
export const inputOf = (draft: TransformDraft): DefinitionRef => draft.input ?? refOf(A1)

/**
 * The Mapping identity for an input and an output version. From Definition A, exactly the identities
 * Mappings always had (the playground's own Mapping keeps its own); from another input, one naming both.
 */
export const mappingIdFor = (to: DefinitionRef, from: DefinitionRef = refOf(A1)) => {
  if (!sameDefinition(from, A1)) return `transform:${from.id}@${from.version}->${to.id}@${to.version}`
  return sameDefinition(to, B1) ? INITIAL_MAPPING.id : `transform:${to.id}@${to.version}`
}

export interface Plan {
  readonly output: { readonly ref: DefinitionRef; readonly label: string; readonly isNew: boolean }
  readonly mapping: { readonly id: string; readonly version: number; readonly isNew: boolean }
  /** Whether Apply would change anything at all. */
  readonly changes: boolean
}

/** What Apply would do with this draft, without doing it. */
export function planApply(config: Configuration, draft: TransformDraft): Plan {
  const output = outputOf(config, draft)
  const ref = refOf(output.definition)
  const id = mappingIdFor(ref, inputOf(draft))
  const latest = config.mappings.filter((m) => m.id === id).at(-1)
  const properties = fromDraft(draft.properties)
  // The same Mapping when each property has the same source, in any order (order is presentation).
  const reuse = !output.isNew && latest && sameMappingProperties(latest.properties, properties)
  const version = reuse ? latest!.version : (latest?.version ?? 0) + 1
  const changes = output.isNew || !reuse || !sameDefinition(config.output, ref) || config.mapping.id !== id || config.mapping.version !== version
  return { output: { ref, label: output.label, isNew: output.isNew }, mapping: { id, version, isNew: !reuse }, changes }
}

/** The step a configuration is applied for: the Transform version it invokes, and how references resolve there. */
export interface ApplyContext {
  readonly feature: MappingFeature
  readonly resolve: Resolve
}

/**
 * invalid       something is wrong whatever version runs it (structure, sources, types, places)
 * incompatible  the step's Transform version can't take it
 * incomplete    sound so far, but something required isn't made yet
 * unchanged     nothing to apply: it's exactly what's applied
 * applicable    changed, complete, sound, and accepted by the step's Transform version
 */
export type ApplyState = 'invalid' | 'incompatible' | 'incomplete' | 'unchanged' | 'applicable'

/** Whether a draft may be applied, and why not: the one assessment every Apply surface shows. */
export interface ApplyAssessment {
  readonly state: ApplyState
  readonly plan: Plan
  /** Everything in the way, as structured problems (problems.ts); empty when nothing is. */
  readonly problems: readonly Problem[]
  readonly input: DefinitionVersion
  readonly target: ReturnType<typeof outputOf>
  readonly review: DraftReview
}

/**
 * The authoritative assessment: the output's structure, the draft reviewed with the step's Transform
 * version (its contracts, its absence rule, its sources, the output's completeness at every level),
 * and, once that review is clean, that version's own pre-run check of the complete Mapping
 * (mappingCompatibility). States come from the problems' categories, never from their words.
 */
export function assessApply(config: Configuration, draft: TransformDraft, context: ApplyContext): ApplyAssessment {
  const plan = planApply(config, draft)
  const known = findDefinition(config, inputOf(draft))
  const input = known ?? A1
  const target = outputOf(config, draft)
  const properties = fromDraft(draft.properties)
  const review = reviewDraft(properties, input, target.definition, target.label, transformSupport(input, target.definition, context.feature, context.resolve))
  const refused = review.findings.length ? [] : boundaryFindings(context.feature, properties, input, target.definition, context.resolve)
  const problems: Problem[] = [
    // A Mapping is never made from an input this configuration can't name exactly.
    ...(known ? [] : [{ kind: 'structure', category: 'invalid', at: null, index: null, words: 'The input Definition version can’t be found here.', short: 'The input Definition version can’t be found here.' } satisfies Problem]),
    ...structureFindings(draft), ...review.findings, ...refused,
  ]
  const has = (c: Problem['category']) => problems.some((p) => p.category === c)
  const state: ApplyState = has('invalid') ? 'invalid' : has('incompatible') ? 'incompatible' : has('unfinished') ? 'incomplete' : plan.changes ? 'applicable' : 'unchanged'
  return { state, plan, problems, input, target, review }
}

/** Whether Apply is available: the one rule every Apply surface shows, and the one applyConfiguration enforces. */
export const canApply = (assessment: Pick<ApplyAssessment, 'state'>): boolean => assessment.state === 'applicable'

export type ApplyResult =
  | { readonly applied: true; readonly config: Configuration; readonly assessment: ApplyAssessment }
  /** Nothing was made: `config` is the very configuration given, its versions untouched. */
  | { readonly applied: false; readonly config: Configuration; readonly assessment: ApplyAssessment }

/**
 * Apply: the only way versions are made, and it enforces its own assessment. Only an applicable
 * draft (assessApply) freezes a new local Definition version if its structure changed, a new Mapping
 * version if its properties changed, and points the configuration at the exact versions. Anything
 * else (unchanged, incomplete, incompatible, invalid) is refused: the same configuration comes back,
 * with every version and the history exactly as they were, and the assessment says why.
 */
export function applyConfiguration(config: Configuration, draft: TransformDraft, context: ApplyContext): ApplyResult {
  const assessment = assessApply(config, draft, context)
  if (!canApply(assessment)) return { applied: false, config, assessment }
  return { applied: true, config: commit(config, draft, assessment.plan), assessment }
}

/** Makes the versions a plan names. Only ever reached through applyConfiguration. */
function commit(config: Configuration, draft: TransformDraft, plan: Plan): Configuration {
  const locals = plan.output.isNew
    ? [...config.locals, defineVersion({ id: LOCAL_ID, version: plan.output.ref.version, name: draft.local.name, workspaceId: WORKSPACE, fields: draft.local.fields })]
    : config.locals
  let mappings = config.mappings
  if (plan.mapping.isNew) {
    const properties: MappingProperty[] = JSON.parse(JSON.stringify(fromDraft(draft.properties)))
    const latest = config.mappings.filter((m) => m.id === plan.mapping.id).at(-1)
    const next: Mapping = latest
      ? reviseMapping(latest, properties)
      : deepFreeze({ id: plan.mapping.id, version: 1, workspaceId: WORKSPACE, from: refOf(inputOf(draft)), to: plan.output.ref, properties: frozenCopy(properties) })
    mappings = [...config.mappings, next]
  }
  return {
    ...(config.offered ? { offered: config.offered } : {}),
    locals, mappings, output: plan.output.ref, mapping: { id: plan.mapping.id, version: plan.mapping.version },
  }
}
