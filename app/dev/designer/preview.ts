// What a draft Mapping would make from the example input (Experiment #3). Preview only: it uses
// the very functions Orbit.Transform v2 runs with (checkMapping, evaluatePresent, validate), and
// never invokes a Feature, so there is no outcome and no evidence. Nothing here mutates its input.
// Absence follows the domain's rule: a source reading an absent optional property has no value,
// and that property is left out of the object, never filled in.
import { type Data, type DefinitionVersion, type FieldType, type PropertyPath, type PropertyType, type Resolve, type Scalar, checkContract, frozenCopy, kindOf, propertyPathWords, validate } from '#shared/features/definitions'
import { type Expression, type LocatedMappingIssue, type MappingProperty, checkNestedMapping, evaluatePresent } from '#shared/features/mappings'
import { FLAT, type Reading, type ReviewIssue, checkWith, presentIn } from './reading'
import { definitionLabel, describeIssue, describeMappingIssue, parseRecordData } from '../features/experiment'

// --- The example input ---

export type Example = { readonly data: Data } | { readonly problem: string; readonly details: readonly string[] }

/** Record A's data as typed, if it fits the Definition the Mapping reads. A frozen copy. */
export function exampleFrom(recordText: string, input: DefinitionVersion, resolve?: Resolve): Example {
  const parsed = parseRecordData(recordText)
  if ('error' in parsed) return { problem: 'Record A’s data isn’t valid JSON, so there’s no example to preview with.', details: [] }
  // The input's whole contract must resolve before its data can be judged (as at the boundary).
  if (checkContract(input, resolve).length) return { problem: `${definitionLabel(input)} can’t be resolved here, so there’s no example to preview with.`, details: [] }
  const issues = validate(input, parsed.data, resolve)
  if (issues.length) return { problem: `Record A’s data doesn’t fit ${definitionLabel(input)}, which this Mapping reads.`, details: issues.map(describeIssue) }
  return { data: frozenCopy(parsed.data as Data) }
}

// --- Problems, in the parts editor's words ---

const typeWords: Record<string, string> = { string: 'text', number: 'a number', boolean: 'yes or no', object: 'an object', 'string[]': 'a list', invalid: 'something invalid' }

/** A Mapping problem in plain words. Where it is comes from where it's shown, not from a path. */
export function friendlyIssue(issue: ReviewIssue): string {
  switch (issue.problem) {
    case 'unknown_property': return `The input has no field “${issue.name}”.`
    case 'list_item_type': return `Only text can be combined. This is ${typeWords[issue.actual]}.`
    case 'argument_type': return issue.fn === 'trim' ? `Spaces can only be removed from text, not from ${typeWords[issue.actual]}.` : describeMappingIssue(issue)
    default: return describeMappingIssue(issue)
  }
}

// --- One value ---

export type ValuePreview =
  | { readonly value: Scalar }
  /** No value: it reads optional properties the example doesn't have (in words, by path), so it's left out. */
  | { readonly absent: readonly string[] }
  /** A built object (Transform v3): what it holds, exactly as the Transform would make it. */
  | { readonly object: Data }
  | { readonly problems: readonly string[] }
  | { readonly noExample: true }

/** What one source makes from the example, or why that can't be shown. */
export function previewSource(source: Expression, input: DefinitionVersion, example: Example, reading: Reading = FLAT): ValuePreview {
  const { issues, absent } = checkWith(reading, [{ name: 'preview', source }], input)
  if (issues.length) return { problems: issues.map(friendlyIssue) }
  if (!('data' in example)) return { noExample: true }
  // The very evaluation the Transform runs with: the same result, the same absence.
  const result = evaluatePresent(source, example.data)
  if (result.present) return kindOf(result.value) === 'object' ? { object: result.value as Data } : { value: result.value as Scalar }
  // A built object is left out only by its condition: the source object the example doesn't have.
  if (source.kind === 'construct' && source.presence.when === 'present') return { absent: [propertyPathWords(source.presence.source)] }
  return { absent: absent[0]!.filter((path) => !presentIn(example.data, path)).map(propertyPathWords) }
}

// --- The whole draft, against the target Definition ---

export interface FieldReview {
  readonly name: string
  readonly expected: PropertyType
  /** The target may go without it: left unmapped, it's simply left out of the output. */
  readonly optional: boolean
  /** Index in the draft, or -1 when nothing makes this field yet. */
  readonly index: number
  /**
   * not_set   required, and nothing makes it yet: unfinished work
   * left_out  optional, and nothing makes it: allowed, it's left out of the output (not work)
   * unsupported  a local object or a referenced Definition, which this Transform version can't make
   *              at all: not work either, since no Mapping could make it
   */
  readonly state: 'not_set' | 'left_out' | 'problem' | 'set' | 'unsupported'
  /** Problems with the property as a whole (its issues inside are shown where they are). */
  readonly problems: readonly string[]
}

export interface ExtraReview {
  readonly index: number
  readonly reason: string
}

export interface DraftReview {
  readonly fields: readonly FieldReview[]
  readonly extras: readonly ExtraReview[]
  /** Issues per draft property, as checkMapping reports them (paths start at the property). */
  readonly issues: readonly (readonly ReviewIssue[])[]
  /** Everything that keeps the draft from being a sound Mapping for the target, in words. */
  readonly problems: readonly string[]
  /**
   * The target's required properties nothing makes yet, at any depth (inside a built object by its
   * path, "contact › email"): incomplete, not wrong. (Optional ones may stay unmapped.)
   */
  readonly missing: readonly string[]
  /** The problems that are actual errors: everything except what's still missing. */
  readonly errors: readonly string[]
  /**
   * Why this Transform version can't be used with these contracts at all (the same refusal the
   * boundary makes before running: contractCompatibility), in words; null when it can. Then no
   * Mapping is complete or applicable, whatever is mapped.
   */
  readonly unsupported: string | null
}

/**
 * What the Transform version runs use can't take in these contracts: the paths the boundary's own
 * check (contractCompatibility, in support.ts) refuses, on each side. Plain data, so the preview
 * never touches a Feature. None refused: the contracts are supported.
 */
export interface ContractSupport {
  readonly version: number
  readonly reads: readonly PropertyPath[]
  readonly makes: readonly PropertyPath[]
  /** How that version reads sources (flat, or nested too); flat when not said. */
  readonly reading?: Reading
}

/** The draft's properties checked against the input Definition and the target Definition. */
export function reviewDraft(properties: readonly MappingProperty[], input: DefinitionVersion, target: DefinitionVersion, targetLabel = definitionLabel(target), support?: ContractSupport): DraftReview {
  // Contracts the version can't take are refused whole, before any Mapping is looked at: the
  // properties it can't make aren't unfinished mapping work, and never flattened into something it can.
  const cannotMake = new Set(support?.makes.map((p) => p[0]))
  const sides = [
    ...(support?.reads.length ? [`what it reads (${support.reads.map(propertyPathWords).join(', ')})`] : []),
    ...(support?.makes.length ? [`what it makes (${support.makes.map(propertyPathWords).join(', ')})`] : []),
  ]
  const unsupported = support && sides.length
    ? `Transform v${support.version} doesn’t support objects or other Definitions inside ${sides.join(' or ')}. It can’t be applied or run with ${targetLabel}.`
    : null

  // Checked against the target too, as the boundary checks it: a required property fed by an
  // optional input is refused (may_be_absent).
  const checked = properties.map((p) => checkWith(support?.reading ?? FLAT, [p], input, target))
  const issues = checked.map((c) => c.issues)
  const firstIndex = (name: string) => properties.findIndex((p) => p.name === name)
  const problems: string[] = []
  // The output's own completeness (each required property made, of its type, nothing it doesn't
  // have, names unique) is the domain's rule, asked of the whole Mapping at once: never a rule of the
  // Designer's. Transform v3's boundary refuses an incomplete Mapping by exactly this check; v1 and v2
  // only find out by validating what ran, so for them the Designer asks the same rule earlier.
  const top = completeness(properties, input, target, support?.reading?.resolve)
  const at = (problem: LocatedMappingIssue['problem'], name: string) => top.find((i) => i.problem === problem && i.at.output[0] === name)

  // A required property inside a built object that nothing makes yet: unfinished work, like a
  // required property of the output itself, never an error (by path: "contact › email").
  const inside: { readonly words: string; readonly problem: string }[] = []
  const fields = target.fields.map((field): FieldReview => {
    const index = firstIndex(field.name)
    const optional = field.optional === true
    if (cannotMake.has(field.name)) return { name: field.name, expected: field.type, optional, index, state: 'unsupported', problems: [] }
    if (index < 0) {
      if (at('missing_output_property', field.name)) problems.push(`${field.name} isn’t set yet. ${targetLabel} needs it.`)
      return { name: field.name, expected: field.type, optional, index, state: optional ? 'left_out' : 'not_set', problems: [] }
    }
    const own: string[] = []
    const wrong = at('wrong_output_type', field.name)
    if (wrong?.problem === 'wrong_output_type') own.push(`${targetLabel} needs ${typeWords[wrong.expected]} here, but this makes ${typeWords[wrong.actual]}.`)
    // Each problem where it is: inside a built object, by its path ("Contact › Email").
    problems.push(...own.map((p) => `${field.name}: ${p}`))
    for (const i of issues[index]!) {
      const words = 'at' in i ? propertyPathWords(i.at.output) : field.name
      const problem = `${words}: ${friendlyIssue(i)}`
      if ('at' in i && i.problem === 'missing_output_property') inside.push({ words, problem })
      problems.push(problem)
    }
    return { name: field.name, expected: field.type, optional, index, state: own.length || issues[index]!.length ? 'problem' : 'set', problems: own }
  })

  const extras: ExtraReview[] = []
  properties.forEach((p, index) => {
    if (fields.some((f) => f.index === index)) return
    // Why it has no place, as the domain's check says: no name, a name already made, or one the target doesn't have.
    const reason = !p.name
      ? 'It has no name.'
      : at('unknown_output_property', p.name)
        ? `${targetLabel} has no field “${p.name}”, so the Transform’s output would be rejected.`
        : `Another value already makes ${p.name}.`
    extras.push({ index, reason })
    problems.push(`${p.name || 'An unnamed value'}: ${reason}`)
  })

  const unmade = fields.filter((f) => f.state === 'not_set').map((f) => f.name)
  const missing = [...unmade, ...inside.map((i) => i.words)]
  const unset = new Set([...unmade.map((name) => `${name} isn’t set yet. ${targetLabel} needs it.`), ...inside.map((i) => i.problem)])
  if (unsupported) problems.unshift(unsupported)
  return { fields, extras, issues, problems, missing, errors: problems.filter((p) => !unset.has(p)), unsupported }
}

/**
 * The output's completeness problems at its top level, from the domain's whole-Mapping check
 * (checkNestedMapping, which checks each object against its contract): required properties nothing
 * makes, values of the wrong type, properties the output doesn't have, and names missing or repeated.
 * Problems inside a property are the per-property check's (checkWith), where they're shown.
 */
export function completeness(properties: readonly MappingProperty[], input: DefinitionVersion, target: DefinitionVersion, resolve?: Resolve): LocatedMappingIssue[] {
  const kinds = new Set(['missing_output_property', 'wrong_output_type', 'unknown_output_property', 'empty_name', 'duplicate_name'])
  return checkNestedMapping({ properties }, input, target, { resolve }).issues.filter((i) => kinds.has(i.problem) && i.at.output.length === 1 && !i.at.expression.length)
}

/**
 * The properties Mapping still has work for (a required one with no value yet, or one with a
 * problem), once the structure is sound: what "Continue to Mapping" offers. An optional property
 * left unmapped isn't work: it's allowed to be left out. Empty when there's nothing to do there, or
 * when this Transform version can't take the contracts at all (no mapping would complete it).
 */
export const mappingWork = (review: DraftReview, structure: readonly string[]): string[] =>
  structure.length || review.unsupported ? [] : review.fields.filter((f) => f.name && (f.state === 'not_set' || f.state === 'problem')).map((f) => f.name)

export interface OutputPreview {
  /** Each property's value from the example, or why it has none. */
  readonly values: readonly ValuePreview[]
  /** Only when every value could be made: whether the result fits the target Definition. */
  readonly fits: { readonly issues: readonly string[] } | null
}

/** The object the draft would make from the example, property by property, absent ones left out. */
export function previewOutput(properties: readonly MappingProperty[], input: DefinitionVersion, target: DefinitionVersion, example: Example, reading: Reading = FLAT): OutputPreview {
  const values = properties.map((p) => previewSource(p.source, input, example, reading))
  if (!values.every((v) => 'value' in v || 'absent' in v || 'object' in v) || new Set(properties.map((p) => p.name)).size !== properties.length) return { values, fits: null }
  const output = Object.fromEntries(properties.flatMap((p, i): [string, unknown][] => {
    const v = values[i]!
    return 'value' in v ? [[p.name, v.value]] : 'object' in v ? [[p.name, v.object]] : []
  }))
  // The one validator, through the same resolver, at every depth.
  if (checkContract(target, reading.resolve).length) return { values, fits: null }
  return { values, fits: { issues: validate(target, output, reading.resolve).map(describeIssue) } }
}

// --- Whitespace you can see ---

export interface Segment { readonly text: string; readonly mark: boolean }

/** Text split so the whitespace that matters (at either end, or several in a row) can be drawn. */
export function visibleSegments(text: string): Segment[] {
  const out: Segment[] = []
  let last = 0
  for (const m of text.matchAll(/\s+/g)) {
    const at = m.index!
    if (at > last) out.push({ text: text.slice(last, at), mark: false })
    const run = m[0]
    const matters = at === 0 || at + run.length === text.length || run !== ' '
    out.push(matters ? { text: [...run].map((c) => (c === '\t' ? '→' : c === '\n' ? '↵' : '·')).join(''), mark: true } : { text: run, mark: false })
    last = at + run.length
  }
  if (last < text.length) out.push({ text: text.slice(last), mark: false })
  return out
}

const spaces = (n: number, all: string) => (all.split('').every((c) => c === ' ') ? (n === 1 ? 'a space' : `${n} spaces`) : n === 1 ? 'a whitespace character' : `${n} whitespace characters`)

/** The whitespace in words, for screen readers and hints: "2 spaces at the start, 2 at the end". */
export function whitespaceNote(text: string): string {
  if (text === '') return 'empty'
  if (!text.trim()) return spaces(text.length, text)
  const notes: string[] = []
  const lead = text.match(/^\s+/)?.[0]
  const trail = text.match(/\s+$/)?.[0]
  if (lead) notes.push(`${spaces(lead.length, lead)} at the start`)
  const inner = text.trim().match(/\s{2,}|[^\S ]/g) ?? []
  for (const run of inner) notes.push(`${spaces(run.length, run)} in a row`)
  if (trail) notes.push(`${spaces(trail.length, trail)} at the end`)
  return notes.join(', ')
}
