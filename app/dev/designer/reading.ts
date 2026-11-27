// How the Transform version a step invokes reads its input (Phase 4.2): flat sources only (v1, v2),
// or nested ones too (v3), with the resolver its references resolve through. Plain data the page
// derives from the chosen Feature version (support.ts), so the review, the preview and the source
// picker follow that version without ever touching a Feature. Every check is the domain's own:
// checkMapping for flat versions, checkNestedMapping for nested ones.
import { type Data, type DefinitionVersion, type FieldType, type PropertyPath, type Resolve, isScalarField, kindOf, propertyPathWords } from '#shared/features/definitions'
import {
  type ArgumentType, type LocatedMappingIssue, type MappingIssue, type MappingProperty, type Path, type ReadablePath,
  checkMapping, checkNestedMapping, readablePaths,
} from '#shared/features/mappings'
import { type MappingFeature, orbitTransformV2, orbitTransformV3 } from '#shared/features/features'

export interface Reading {
  /** Whether sources may read inside local objects and referenced Definitions. */
  readonly nested: boolean
  /** How references resolve for it: exactly, among the versions runs here use. */
  readonly resolve: Resolve
  /**
   * The Transform version whose semantics apply: what it does with absence (its checks) and what its
   * own run makes (the preview). When not said, the version this reading describes: v3 when nested,
   * v2 when flat. readingOf says it.
   */
  readonly feature?: MappingFeature
}
/** Flat sources only, as Transform v2 reads. */
export const FLAT: Reading = Object.freeze({ nested: false, resolve: () => null })
/** How this Transform version reads, with the resolver its references resolve through. */
export const readingOf = (feature: MappingFeature, resolve: Resolve): Reading => ({ nested: feature.sources === 'nested', resolve, feature })
/** The Transform version a reading follows. */
export const featureOf = (reading: Reading): MappingFeature => reading.feature ?? (reading.nested ? orbitTransformV3 : orbitTransformV2)
/** The page provides the reading of the Transform version the step invokes. */
export const READING: InjectionKey<Readonly<Ref<Reading>>> = Symbol('reading')
/**
 * The source objects known to be present where a value is being chosen: each enclosing
 * construction's presence condition (Transform v3's presence guarantees). Applied with the domain's
 * own rule (notGuaranteed), never interpreted here. None outside constructions.
 */
export const GUARANTEED: InjectionKey<Readonly<Ref<readonly PropertyPath[]>>> = Symbol('guaranteed')

/**
 * A problem as the Designer places it: flat versions' issues as they are; nested versions' located
 * issues with a Path too ([property, ...place in its source]), so the editor can show each where it
 * belongs. Words come from the issue itself, in either form.
 */
export type ReviewIssue = MappingIssue | (LocatedMappingIssue & { readonly path: Path })

export interface Checked {
  readonly issues: readonly ReviewIssue[]
  readonly types: readonly (FieldType | null)[]
  /** Per property: what it reads that may be absent, by full path. */
  readonly absent: readonly (readonly PropertyPath[])[]
}

/** Checks properties as the chosen Transform version would, before running. */
export function checkWith(reading: Reading, properties: readonly MappingProperty[], input: DefinitionVersion, output?: DefinitionVersion): Checked {
  // What this version does with absence decides what it accepts (v1 can't read an optional value).
  const { absence } = featureOf(reading)
  if (!reading.nested) {
    const c = checkMapping({ properties }, input, output, absence)
    return { issues: c.issues, types: c.types, absent: c.absent.map((names) => names.map((n) => [n])) }
  }
  // Some properties on their own: the output's own completeness is the review's (it has them all).
  const c = checkNestedMapping({ properties }, input, output, { absence, resolve: reading.resolve, partial: true })
  const indexOf = (name: string) => Math.max(0, properties.findIndex((p) => p.name === name))
  return {
    // [output property, ...deeper output properties, ...place in the source]: a construction has no
    // expression, and a value has no deeper properties, so the two never mix.
    issues: c.issues.map((i) => ({ ...i, path: [i.at.output[0] || indexOf(i.at.output[0] ?? ''), ...i.at.output.slice(1), ...i.at.expression] })),
    types: c.types,
    absent: c.absent,
  }
}

/** The type a source makes, as the chosen version checks it, or null when it has a problem. */
export function typeWith(reading: Reading, source: MappingProperty['source'], input: DefinitionVersion): FieldType | ArgumentType | null {
  const c = checkWith(reading, [{ name: 'value', source }], input)
  return c.issues.length ? null : (c.types[0] ?? null)
}

/**
 * The values a source may read here: the input's top-level values, and (when the version reads
 * nested sources) every value inside its local objects and referenced Definitions, each with what
 * may make it absent. From the resolved contract, never from example data.
 */
export function readables(reading: Reading, input: DefinitionVersion): ReadablePath[] {
  if (reading.nested) return readablePaths(input, reading.resolve)
  return input.fields.filter(isScalarField).map((f) => ({ path: [f.name], type: f.type, optional: f.optional === true ? [[f.name]] : [] }))
}

/**
 * Why a value may be absent, in the one wording every source picker uses: "may be absent: contact is
 * optional". From the domain-derived list of optional properties along its path; '' when none.
 */
export function absenceWords(optional: readonly PropertyPath[]): string {
  if (!optional.length) return ''
  return `may be absent: ${optional.map(propertyPathWords).join(', ')} ${optional.length === 1 ? 'is' : 'are'} optional`
}

/** The example's value at a path, if it has one there (a value, never a whole object). */
export function exampleAt(data: Data, path: PropertyPath): string | number | boolean | undefined {
  let here: unknown = data
  for (const name of path) {
    if (kindOf(here) !== 'object' || !Object.hasOwn(here as object, name)) return undefined
    here = (here as Record<string, unknown>)[name]
  }
  return typeof here === 'string' || typeof here === 'number' || typeof here === 'boolean' ? here : undefined
}

/** Whether the example has something at every step of a path (absent when it doesn't). */
export const presentIn = (data: Data, path: PropertyPath): boolean => {
  let here: unknown = data
  for (const name of path) {
    if (kindOf(here) !== 'object' || !Object.hasOwn(here as object, name)) return false
    here = (here as Record<string, unknown>)[name]
  }
  return true
}
