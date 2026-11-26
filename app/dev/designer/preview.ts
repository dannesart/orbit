// What a draft Mapping would make from the example input (Experiment #3). Preview only: it uses
// the very functions Orbit.Transform v2 runs with (checkMapping, evaluatePresent, validate), and
// never invokes a Feature, so there is no outcome and no evidence. Nothing here mutates its input.
// Absence follows the domain's rule: a source reading an absent optional property has no value,
// and that property is left out of the object, never filled in.
import { type Data, type DefinitionVersion, type FieldType, type PropertyPath, type PropertyType, type Scalar, frozenCopy, propertyPathWords, validate } from '#shared/features/definitions'
import { type Expression, type MappingIssue, type MappingProperty, checkMapping, evaluatePresent } from '#shared/features/mappings'
import { definitionLabel, describeIssue, describeMappingIssue, parseRecordData } from '../features/experiment'

// --- The example input ---

export type Example = { readonly data: Data } | { readonly problem: string; readonly details: readonly string[] }

/** Record A's data as typed, if it fits the Definition the Mapping reads. A frozen copy. */
export function exampleFrom(recordText: string, input: DefinitionVersion): Example {
  const parsed = parseRecordData(recordText)
  if ('error' in parsed) return { problem: 'Record A’s data isn’t valid JSON, so there’s no example to preview with.', details: [] }
  const issues = validate(input, parsed.data)
  if (issues.length) return { problem: `Record A’s data doesn’t fit ${definitionLabel(input)}, which this Mapping reads.`, details: issues.map(describeIssue) }
  return { data: frozenCopy(parsed.data as Data) }
}

// --- Problems, in the parts editor's words ---

const typeWords: Record<string, string> = { string: 'text', number: 'a number', boolean: 'yes or no', object: 'an object', 'string[]': 'a list', invalid: 'something invalid' }

/** A Mapping problem in plain words. Where it is comes from where it's shown, not from a path. */
export function friendlyIssue(issue: MappingIssue): string {
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
  /** No value: it reads optional properties the example doesn't have, so it's left out. */
  | { readonly absent: readonly string[] }
  | { readonly problems: readonly string[] }
  | { readonly noExample: true }

/** What one source makes from the example, or why that can't be shown. */
export function previewSource(source: Expression, input: DefinitionVersion, example: Example): ValuePreview {
  const { issues, absent } = checkMapping({ properties: [{ name: 'preview', source }] }, input)
  if (issues.length) return { problems: issues.map(friendlyIssue) }
  if (!('data' in example)) return { noExample: true }
  const result = evaluatePresent(source, example.data)
  return result.present ? { value: result.value } : { absent: absent[0]!.filter((name) => !Object.hasOwn(example.data, name)) }
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
  readonly issues: readonly (readonly MappingIssue[])[]
  /** Everything that keeps the draft from being a sound Mapping for the target, in words. */
  readonly problems: readonly string[]
  /** The target's required properties nothing makes yet: incomplete, not wrong. (Optional ones may stay unmapped.) */
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
  const checked = properties.map((p) => checkMapping({ properties: [p] }, input, target))
  const issues = checked.map((c) => c.issues)
  const firstIndex = (name: string) => properties.findIndex((p) => p.name === name)
  const problems: string[] = []

  const fields = target.fields.map((field): FieldReview => {
    const index = firstIndex(field.name)
    const optional = field.optional === true
    if (cannotMake.has(field.name)) return { name: field.name, expected: field.type, optional, index, state: 'unsupported', problems: [] }
    if (index < 0) {
      if (!optional) problems.push(`${field.name} isn’t set yet. ${targetLabel} needs it.`)
      return { name: field.name, expected: field.type, optional, index, state: optional ? 'left_out' : 'not_set', problems: [] }
    }
    const own: string[] = []
    const type = checked[index]!.types[0]
    if (type && type !== field.type) own.push(`${targetLabel} needs ${typeWords[field.type]} here, but this makes ${typeWords[type]}.`)
    problems.push(...own.map((p) => `${field.name}: ${p}`), ...issues[index]!.map((i) => `${field.name}: ${friendlyIssue(i)}`))
    return { name: field.name, expected: field.type, optional, index, state: own.length || issues[index]!.length ? 'problem' : 'set', problems: own }
  })

  const extras: ExtraReview[] = []
  properties.forEach((p, index) => {
    if (fields.some((f) => f.index === index)) return
    const reason = !p.name
      ? 'It has no name.'
      : target.fields.some((f) => f.name === p.name)
        ? `Another value already makes ${p.name}.`
        : `${targetLabel} has no field “${p.name}”, so the Transform’s output would be rejected.`
    extras.push({ index, reason })
    problems.push(`${p.name || 'An unnamed value'}: ${reason}`)
  })

  const missing = fields.filter((f) => f.state === 'not_set').map((f) => f.name)
  const unset = new Set(missing.map((name) => `${name} isn’t set yet. ${targetLabel} needs it.`))
  if (unsupported) problems.unshift(unsupported)
  return { fields, extras, issues, problems, missing, errors: problems.filter((p) => !unset.has(p)), unsupported }
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
export function previewOutput(properties: readonly MappingProperty[], input: DefinitionVersion, target: DefinitionVersion, example: Example): OutputPreview {
  const values = properties.map((p) => previewSource(p.source, input, example))
  if (!values.every((v) => 'value' in v || 'absent' in v) || new Set(properties.map((p) => p.name)).size !== properties.length) return { values, fits: null }
  const output = Object.fromEntries(properties.flatMap((p, i) => ('value' in values[i]! ? [[p.name, (values[i] as { value: Scalar }).value]] : [])))
  return { values, fits: { issues: validate(target, output).map(describeIssue) } }
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
