// The live Preview's example: illustrative information for the draft being built, never a Record.
// Pure and in memory: it lives in the editor while it's open and is never kept anywhere.
//
// The example follows the actual contract, all the way down (exampleTree): the draft's own rows,
// each local object's, and what each referenced version contains (resolved exactly, through the
// Studio catalogue). One entry per node: a draft row's by its key (so a renamed property keeps its
// value), a referenced version's property by its place under the reference. An entry is given or
// left out; an object's or a reference's too, and leaving one out keeps what was typed inside it,
// for when it's given again. Generated values are neutral and only say what kind of thing goes
// there: nothing is guessed from a property's name. What someone typed is theirs: reconciling with
// a changed model never replaces it (only generated values follow a new type).
//
// Judging the example is Orbit's own resolution and validation (checkFields, then validate):
// there is no second, simpler check here. A contract that doesn't resolve (a reference that can't
// be found, or isn't allowed) isn't the example's fault, and is said so apart from what's wrong
// with the information.
import {
  type DefinitionRef, type Field, type FieldType, MAX_OBJECT_LEVELS, type PropertyPath, type Resolve,
  checkFields, propertyPathWords, validate,
} from '#shared/features/definitions'
import { describeDefinitionIssue } from '../features/experiment'
import { type DraftField, fieldsOf, issueWords } from './model'

/** One place in the example: a property of the draft, of a local object, or of a referenced version. */
export interface ExampleNode {
  /** A draft row's key ("12"), or the place under a reference ("12/street"). */
  readonly id: string
  readonly name: string
  readonly kind: 'value' | 'object' | 'reference'
  /** A value's type (objects and references hold properties instead). */
  readonly type: FieldType | 'object'
  readonly optional: boolean
  readonly path: PropertyPath
  readonly children: readonly ExampleNode[]
  /** A reference's exact version, and whether it resolved here. */
  readonly definition?: DefinitionRef
  readonly unresolved?: boolean
}

export interface ExampleEntry {
  /** Given, or deliberately left out (allowed when optional, tried when required). */
  readonly given: boolean
  /** Text and numbers as typed; yes or no as chosen (unused for objects and references). */
  readonly value: string | boolean
  /** Whether someone typed or chose it: then it's never replaced by a generated one. */
  readonly edited: boolean
  /** The type the value was made for. */
  readonly type: FieldType | 'object'
  /** Advanced testing: sent exactly as typed text, whatever the property's type. */
  readonly raw: boolean
}

export type ExampleEntries = Readonly<Record<string, ExampleEntry>>

/** What the example is judged against: the workspace building it, and how references resolve there. */
export interface ExampleContext {
  readonly owner: string | null
  readonly resolve: Resolve
  readonly label?: (ref: DefinitionRef) => string
}
const NO_CONTEXT: ExampleContext = { owner: null, resolve: () => null }

/**
 * The example's shape: every named draft row, and inside each reference what that exact version
 * contains. Unnamed rows can't be information, so they're left out (and counted by the editor).
 * Never deeper than Orbit's depth limit, whatever a contract says.
 */
export function exampleTree(fields: readonly DraftField[], resolve: Resolve = NO_CONTEXT.resolve): ExampleNode[] {
  const fromVersion = (list: readonly Field[], parent: string, at: PropertyPath, level: number): ExampleNode[] =>
    level > MAX_OBJECT_LEVELS ? [] : list.map((f) => node(`${parent}/${f.name}`, f.name, f.type, f.optional === true, [...at, f.name], level, f))
  function node(id: string, name: string, type: Field['type'], optional: boolean, path: PropertyPath, level: number, field?: Field, draft?: DraftField): ExampleNode {
    if (type === 'object') {
      const children = draft ? fromDraft(draft.fields ?? [], path, level + 1) : fromVersion((field as Extract<Field, { type: 'object' }>).fields, id, path, level + 1)
      return { id, name, kind: 'object', type: 'object', optional, path, children }
    }
    if (type === 'reference') {
      const definition = draft ? draft.definition! : (field as Extract<Field, { type: 'reference' }>).definition
      const version = resolve(definition)
      const children = version ? fromVersion(version.fields, id, path, level + 1) : []
      return { id, name, kind: 'reference', type: 'object', optional, path, children, definition, ...(version ? {} : { unresolved: true }) }
    }
    return { id, name, kind: 'value', type, optional, path, children: [] }
  }
  const fromDraft = (list: readonly DraftField[], at: PropertyPath, level: number): ExampleNode[] =>
    level > MAX_OBJECT_LEVELS ? [] : list.filter((f) => f.name.trim()).map((f) => node(String(f.key), f.name, f.type, f.optional, [...at, f.name], level, undefined, f))
  return fromDraft(fields, [], 1)
}

/** How many rows, at any level, have no name yet (they can't be tried). Inside an unnamed object, nothing counts twice. */
export const locateUnnamed = (fields: readonly DraftField[]): number =>
  fields.reduce((n, f) => n + (f.name.trim() ? (f.type === 'object' ? locateUnnamed(f.fields ?? []) : 0) : 1), 0)

/** Every node, depth-first. */
export const allNodes = (nodes: readonly ExampleNode[]): ExampleNode[] => nodes.flatMap((n) => [n, ...allNodes(n.children)])

/** A neutral value of the right kind: it shows what goes there, not what it means. */
export function sampleFor(type: FieldType): string | boolean {
  return type === 'boolean' ? true : type === 'number' ? '1' : 'Example text'
}
const generated = (type: FieldType | 'object'): ExampleEntry => ({ given: true, value: type === 'object' ? '' : sampleFor(type), edited: false, type, raw: false })

/**
 * The entries for these properties, at every level: kept where they are, generated for new ones,
 * dropped for removed ones. A generated value follows a change of type; an edited one is left
 * exactly as it is (it may no longer fit, and the result will say so). Entries inside something left
 * out stay: they come back with it.
 */
export function reconcile(entries: ExampleEntries, fields: readonly DraftField[], resolve: Resolve = NO_CONTEXT.resolve): ExampleEntries {
  return Object.fromEntries(allNodes(exampleTree(fields, resolve)).map((n) => {
    const entry = entries[n.id]
    if (!entry) return [n.id, generated(n.type)]
    if (!entry.edited && !entry.raw && entry.type !== n.type) return [n.id, { ...generated(n.type), given: entry.given }]
    return [n.id, entry]
  }))
}

/** Back to generated values, everything given. */
export const resetEntries = (fields: readonly DraftField[], resolve: Resolve = NO_CONTEXT.resolve): ExampleEntries => reconcile({}, fields, resolve)

/**
 * The example as information. Something left out is absent (never empty, zero, No or null); an
 * object or a reference given is an object of what's given inside it. A number box holding something
 * that isn't a number stays text, so a wrong type can be seen; advanced testing sends text as typed.
 */
export function exampleData(nodes: readonly ExampleNode[], entries: ExampleEntries): Record<string, unknown> {
  const data: Record<string, unknown> = {}
  for (const n of nodes) {
    const e = entries[n.id]
    if (!e?.given) continue
    if (n.kind !== 'value') data[n.name] = exampleData(n.children, entries)
    else if (typeof e.value === 'boolean') data[n.name] = e.raw ? String(e.value) : e.value
    else if (n.type === 'number' && !e.raw && e.value.trim() !== '' && Number.isFinite(Number(e.value))) data[n.name] = Number(e.value)
    else data[n.name] = e.value
  }
  return data
}

/** A path as a key for looking problems up by place. */
export const pathKey = (path: PropertyPath) => path.join('\u001f')

export interface PreviewResult {
  /** The information as Orbit would receive it. */
  readonly data: Record<string, unknown>
  /** Orbit's verdict on the information, in plain words: none means it fits. */
  readonly issues: readonly string[]
  /** Per place (pathKey), what's wrong there: issues located at exactly that property. */
  readonly byPath: Readonly<Record<string, string>>
  /** What's left out, by path, where whatever holds it is given. */
  readonly left: readonly string[]
  /**
   * Why the example can't be judged at all: the contract itself doesn't resolve here (a reference
   * that can't be found or isn't allowed, a cycle, too deep). Not a problem with the information.
   */
  readonly unavailable: readonly string[]
}

/** What Orbit makes of the example, judged by Orbit's own resolution and validation. */
export function previewResult(fields: readonly DraftField[], entries: ExampleEntries, extra: { name: string; text: string } | null, context: ExampleContext = NO_CONTEXT): PreviewResult {
  const nodes = exampleTree(fields, context.resolve)
  const data = exampleData(nodes, entries)
  if (extra?.name.trim()) data[extra.name.trim()] = extra.text
  const left: string[] = []
  const walk = (list: readonly ExampleNode[]) => list.forEach((n) => {
    if (!entries[n.id]?.given) left.push(propertyPathWords(n.path))
    else walk(n.children)
  })
  walk(nodes)

  // The contract it's judged against: the named rows, exactly as the version would have them.
  const named = (list: readonly DraftField[]): DraftField[] => list.filter((f) => f.name.trim()).map((f) => (f.type === 'object' ? { ...f, fields: named(f.fields ?? []) } : f))
  const shape = fieldsOf({ fields: named(fields) })
  const contract = checkFields(shape, { owner: context.owner, resolve: context.resolve, naming: false })
  if (contract.length) return { data, issues: [], byPath: {}, left, unavailable: [...new Set(contract.map((i) => describeDefinitionIssue(i, context.label)))] }

  const issues = validate({ id: 'example', version: 0, name: 'example', workspaceId: context.owner, fields: shape }, data, context.resolve)
  const byPath: Record<string, string> = {}
  for (const issue of issues) byPath[pathKey(issue.path)] ??= issueWords(issue)
  return { data, issues: issues.map(issueWords), byPath, left, unavailable: [] }
}

/** A value as the result shows it: text in quotes (so empty text is visible), yes or no in words. */
export function shown(value: unknown): string {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'string') return `“${value}”`
  return String(value)
}
