// The live Preview's example: illustrative information for the draft being built, never a Record.
// Pure and in memory: it lives in the editor while it's open and is never kept anywhere.
//
// One entry per property, by its row (DraftField.key), so a renamed property keeps its value. An
// entry is either given (a value) or left out. Generated values are neutral and only say what kind
// of thing goes there: nothing is guessed from a property's name. What someone typed is theirs:
// reconciling with a changed model never replaces it (only generated values follow a new type).
//
// Judging the example is Orbit's own validation (model.ts: exampleData, then checkExample, which is
// validate): there is no second, simpler check here.
import type { FieldType } from '#shared/features/definitions'
import { type DraftField, type Example, type ExampleValue, exampleData, checkExample, fieldsOf, issueWords } from './model'

export interface ExampleEntry {
  /** Given, or deliberately left out (allowed for optional properties, tried for required ones). */
  readonly given: boolean
  /** Text and numbers as typed; yes or no as chosen. */
  readonly value: string | boolean
  /** Whether someone typed or chose it: then it's never replaced by a generated one. */
  readonly edited: boolean
  /** The type the value was made for. */
  readonly type: FieldType
  /** Advanced testing: sent exactly as typed text, whatever the property's type. */
  readonly raw: boolean
}

export type ExampleEntries = Readonly<Record<number, ExampleEntry>>

/** A neutral value of the right kind: it shows what goes there, not what it means. */
export function sampleFor(type: FieldType): string | boolean {
  return type === 'boolean' ? true : type === 'number' ? '1' : 'Example text'
}
const generated = (type: FieldType): ExampleEntry => ({ given: true, value: sampleFor(type), edited: false, type, raw: false })

/**
 * The entries for these properties: kept where they are, generated for new ones, dropped for
 * removed ones. A generated value follows a change of type; an edited one is left exactly as it is
 * (it may no longer fit, and the result will say so).
 */
export function reconcile(entries: ExampleEntries, fields: readonly DraftField[]): ExampleEntries {
  return Object.fromEntries(fields.map((f) => {
    const entry = entries[f.key]
    if (!entry) return [f.key, generated(f.type)]
    if (!entry.edited && !entry.raw && entry.type !== f.type) return [f.key, { ...generated(f.type), given: entry.given }]
    return [f.key, entry]
  }))
}

/** Back to generated values, every property given. */
export const resetEntries = (fields: readonly DraftField[]): ExampleEntries => reconcile({}, fields)

/** The example as model.ts takes it, by property name (unnamed properties can't be information). */
export function exampleOf(fields: readonly DraftField[], entries: ExampleEntries, extra: Example['extra']): Example {
  const values: Record<string, ExampleValue> = {}
  for (const f of fields) {
    const name = f.name
    const entry = entries[f.key]
    if (!name.trim() || !entry) continue
    if (!entry.given) values[name] = { kind: 'empty' }
    else if (typeof entry.value === 'boolean' && !entry.raw) values[name] = { kind: entry.value ? 'yes' : 'no' }
    else values[name] = { kind: 'text', text: String(entry.value) }
  }
  return { values, extra }
}

export interface PreviewResult {
  /** The information as Orbit would receive it. */
  readonly data: Record<string, unknown>
  /** Orbit's verdict, in plain words: none means it fits. */
  readonly issues: readonly string[]
  /** Per property name, what's wrong with it (for the row it's shown on): issues located at that one property. */
  readonly byProperty: Readonly<Record<string, string>>
  /** Properties left out. */
  readonly left: readonly string[]
}

/** What Orbit makes of the example, judged by Orbit's own validation. */
export function previewResult(fields: readonly DraftField[], entries: ExampleEntries, extra: Example['extra']): PreviewResult {
  const named = fields.filter((f) => f.name.trim())
  const shape = fieldsOf({ basedOn: null, fields: named, nextKey: 0 })
  // A value sent as typed (advanced testing) is read as text, whatever the property's type; Orbit
  // still judges it against the real types.
  const reading = shape.map((f, i) => (entries[named[i]!.key]?.raw ? { ...f, type: 'string' as const } : f))
  const data = exampleData(reading, exampleOf(named, entries, extra))
  const issues = checkExample(shape, data)
  const byProperty: Record<string, string> = {}
  for (const issue of issues) if (issue.path.length === 1) byProperty[issue.path[0]!] ??= issueWords(issue)
  return {
    data,
    issues: issues.map(issueWords),
    byProperty,
    left: named.filter((f) => entries[f.key] && !entries[f.key]!.given).map((f) => f.name),
  }
}

/** A value as the result shows it: text in quotes (so empty text is visible), yes or no in words. */
export function shown(value: unknown): string {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'string') return `“${value}”`
  return String(value)
}
