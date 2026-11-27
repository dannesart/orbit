// What a draft Mapping would make from the example input (Experiment #3). Preview only, with the
// semantics of the Transform version the step invokes: that version's own checks (its absence rule
// included) decide what's previewed, and that version's own pure run makes it (transformData), then
// the one validator checks it. Never invoke: no boundary, no outcome, no evidence. Nothing here
// mutates its input. Absence follows that version's rule: for v2 and v3 a source reading an absent
// optional property has no value and that property is left out, never filled in; v1 refuses to read one.
import { type Data, type DefinitionVersion, type FieldType, type PropertyPath, type PropertyType, type Resolve, type Scalar, checkContract, frozenCopy, kindOf, propertyPathWords, validate } from '#shared/features/definitions'
import { type Expression, type LocatedMappingIssue, type MappingProperty, checkNestedMapping } from '#shared/features/mappings'
import { transformData } from '#shared/features/features'
import { type Problem, categoryOf } from './problems'
import { FLAT, type Reading, type ReviewIssue, checkWith, featureOf, presentIn } from './reading'
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
  // The step's Transform version's own run, on this one property: the same result, the same absence,
  // nothing around it (no boundary, no evidence). Only reached for what that version accepts.
  let made: Data
  try {
    made = transformData(featureOf(reading), [{ name: 'value', source }], example.data)
  } catch {
    return { problems: ['This Transform version couldn’t make it from the example.'] }
  }
  if (Object.hasOwn(made, 'value')) return kindOf(made.value) === 'object' ? { object: made.value as Data } : { value: made.value as Scalar }
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
  /** Why it has no place, as a fact: no name, a name the target doesn't have, or one already made. */
  readonly why: 'unnamed' | 'unknown' | 'duplicate'
  /** The same, in words. */
  readonly reason: string
}

export interface DraftReview {
  readonly fields: readonly FieldReview[]
  readonly extras: readonly ExtraReview[]
  /** Issues per draft property, as checkMapping reports them (paths start at the property). */
  readonly issues: readonly (readonly ReviewIssue[])[]
  /**
   * Everything that keeps the draft from being a sound Mapping for the target, as facts: kind,
   * category (unfinished, incompatible, invalid) and place. `problems`, `missing` and `errors` are
   * their words, made from these; nothing decides anything from the words.
   */
  readonly findings: readonly Problem[]
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
  // Every problem as a fact (problems.ts): its kind, category and place. The words below are made
  // from those facts; nothing reads them back.
  const findings: Problem[] = []
  const add = (p: Omit<Problem, 'short'> & { readonly short?: string }) => findings.push({ ...p, short: p.short ?? p.words })
  // The output's own completeness (each required property made, of its type, nothing it doesn't
  // have, names unique) is the domain's rule, asked of the whole Mapping at once: never a rule of the
  // Designer's. Transform v3's boundary refuses an incomplete Mapping by exactly this check; v1 and v2
  // only find out by validating what ran, so for them the Designer asks the same rule earlier.
  const top = completeness(properties, input, target, support?.reading?.resolve)
  const at = (problem: LocatedMappingIssue['problem'], name: string) => top.find((i) => i.problem === problem && i.at.output[0] === name)

  if (unsupported) add({ kind: 'unsupported_contract', category: 'incompatible', at: null, index: null, words: unsupported })
  const fields = target.fields.map((field): FieldReview => {
    const index = firstIndex(field.name)
    const optional = field.optional === true
    if (cannotMake.has(field.name)) return { name: field.name, expected: field.type, optional, index, state: 'unsupported', problems: [] }
    if (index < 0) {
      // Required, and nothing makes it yet: unfinished work, not an error.
      if (at('missing_output_property', field.name)) add({ kind: 'not_made', category: 'unfinished', at: [field.name], index: null, words: `${field.name} isn’t set yet. ${targetLabel} needs it.`, short: 'Needs a value' })
      return { name: field.name, expected: field.type, optional, index, state: optional ? 'left_out' : 'not_set', problems: [] }
    }
    const own: string[] = []
    const wrong = at('wrong_output_type', field.name)
    if (wrong?.problem === 'wrong_output_type') {
      const short = `${targetLabel} needs ${typeWords[wrong.expected]} here, but this makes ${typeWords[wrong.actual]}.`
      own.push(short)
      add({ kind: 'mapping', category: categoryOf(wrong), at: [field.name], index, issue: wrong, words: `${field.name}: ${short}`, short })
    }
    // Each problem where it is: inside a built object, by its path ("contact › email"). A required
    // property in there that nothing makes yet is unfinished work, like one of the output's own.
    for (const i of issues[index]!) {
      const place = 'at' in i ? i.at.output : [field.name]
      const short = friendlyIssue(i)
      const unmade = 'at' in i && i.problem === 'missing_output_property'
      add({ kind: unmade ? 'not_made' : 'mapping', category: categoryOf(i), at: place, index, issue: i, words: `${propertyPathWords(place)}: ${short}`, short: unmade ? 'Needs a value' : short })
    }
    return { name: field.name, expected: field.type, optional, index, state: own.length || issues[index]!.length ? 'problem' : 'set', problems: own }
  })

  const extras: ExtraReview[] = []
  properties.forEach((p, index) => {
    if (fields.some((f) => f.index === index)) return
    // Why it has no place, as the domain's check says: no name, a name already made, or one the target doesn't have.
    const why = !p.name ? 'unnamed' : at('unknown_output_property', p.name) ? 'unknown' : 'duplicate'
    const reason = why === 'unnamed' ? 'It has no name.' : why === 'unknown' ? `${targetLabel} has no field “${p.name}”.` : `Another value already makes ${p.name}.`
    const short = why === 'unnamed' ? 'it has no name' : why === 'unknown' ? `not in ${targetLabel}` : `another value already makes ${p.name}`
    extras.push({ index, reason, why })
    add({ kind: 'no_place', category: 'invalid', at: null, index, reason: why, words: `${p.name || 'An unnamed value'}: ${reason}`, short: `${p.name || 'Unnamed'}: ${short}` })
  })

  // Words, made from the facts: never the other way round.
  const unfinished = findings.filter((f) => f.category === 'unfinished')
  return {
    fields, extras, issues, findings,
    problems: findings.map((f) => f.words),
    missing: unfinished.map((f) => propertyPathWords(f.at!)),
    errors: findings.filter((f) => f.category !== 'unfinished').map((f) => f.words),
    unsupported,
  }
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
  if (!values.every((v) => 'value' in v || 'absent' in v || 'object' in v) || new Set(properties.map((p) => p.name)).size !== properties.length || !('data' in example)) return { values, fits: null }
  // The whole object, as the step's Transform version's own run makes it.
  let output: Data
  try {
    output = transformData(featureOf(reading), properties, example.data)
  } catch {
    return { values, fits: null }
  }
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
