// What a draft Mapping would make from the example input (Experiment #3). Preview only: it uses
// the very functions the Transform runs with (checkMapping, evaluate, validate), and never
// invokes a Feature, so there is no outcome and no evidence. Nothing here mutates its input.
import { type Data, type DefinitionVersion, type FieldType, type Scalar, frozenCopy, validate } from '#shared/features/definitions'
import { type Expression, type MappingIssue, type MappingProperty, checkMapping, evaluate } from '#shared/features/mappings'
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

const typeWords: Record<string, string> = { string: 'text', number: 'a number', boolean: 'true or false', 'string[]': 'a list', invalid: 'something invalid' }

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
  | { readonly problems: readonly string[] }
  | { readonly noExample: true }

/** What one source makes from the example, or why that can't be shown. */
export function previewSource(source: Expression, input: DefinitionVersion, example: Example): ValuePreview {
  const { issues } = checkMapping({ properties: [{ name: 'preview', source }] }, input)
  if (issues.length) return { problems: issues.map(friendlyIssue) }
  if (!('data' in example)) return { noExample: true }
  return { value: evaluate(source, example.data) }
}

// --- The whole draft, against the target Definition ---

export interface FieldReview {
  readonly name: string
  readonly expected: FieldType
  /** Index in the draft, or -1 when nothing makes this field yet. */
  readonly index: number
  readonly state: 'not_set' | 'problem' | 'set'
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
  /** The target's properties nothing makes yet: incomplete, not wrong. */
  readonly missing: readonly string[]
  /** The problems that are actual errors: everything except what's still missing. */
  readonly errors: readonly string[]
}

/** The draft's properties checked against the input Definition and the target Definition. */
export function reviewDraft(properties: readonly MappingProperty[], input: DefinitionVersion, target: DefinitionVersion, targetLabel = definitionLabel(target)): DraftReview {
  const checked = properties.map((p) => checkMapping({ properties: [p] }, input))
  const issues = checked.map((c) => c.issues)
  const firstIndex = (name: string) => properties.findIndex((p) => p.name === name)
  const problems: string[] = []

  const fields = target.fields.map((field): FieldReview => {
    const index = firstIndex(field.name)
    if (index < 0) {
      problems.push(`${field.name} isn’t set yet. ${targetLabel} needs it.`)
      return { name: field.name, expected: field.type, index, state: 'not_set', problems: [] }
    }
    const own: string[] = []
    const type = checked[index]!.types[0]
    if (type && type !== field.type) own.push(`${targetLabel} needs ${typeWords[field.type]} here, but this makes ${typeWords[type]}.`)
    problems.push(...own.map((p) => `${field.name}: ${p}`), ...issues[index]!.map((i) => `${field.name}: ${friendlyIssue(i)}`))
    return { name: field.name, expected: field.type, index, state: own.length || issues[index]!.length ? 'problem' : 'set', problems: own }
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
  return { fields, extras, issues, problems, missing, errors: problems.filter((p) => !unset.has(p)) }
}

export interface OutputPreview {
  /** Each property's value from the example, or why it has none. */
  readonly values: readonly ValuePreview[]
  /** Only when every value could be made: whether the result fits the target Definition. */
  readonly fits: { readonly issues: readonly string[] } | null
}

/** The object the draft would make from the example, property by property. */
export function previewOutput(properties: readonly MappingProperty[], input: DefinitionVersion, target: DefinitionVersion, example: Example): OutputPreview {
  const values = properties.map((p) => previewSource(p.source, input, example))
  if (!values.every((v) => 'value' in v) || new Set(properties.map((p) => p.name)).size !== properties.length) return { values, fits: null }
  const output = Object.fromEntries(properties.map((p, i) => [p.name, (values[i] as { value: Scalar }).value]))
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
