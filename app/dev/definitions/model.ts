// Experiment #7: Definitions made in a workspace, independently of any workflow. Pure and in memory.
//
// What is Orbit's (shared/features/definitions.ts): a Definition version is an exact identity
// (id + version), immutable once made (defineVersion), with text, number or yes/no properties, local
// objects and references to other versions, and nothing else (checkFields, validate). Its `name` is
// for people and never identity. The Studio reveals that model; it doesn't have one of its own.
//
// What is only this experiment's, kept here and nowhere else:
//   - A Definition's current name, description and appearance (an icon and a colour, appearance.ts).
//     They describe the identity, not a version, so changing them never makes a version. (Orbit's model puts `name` inside each frozen version;
//     each version here keeps the name it was made with, as Orbit requires, and that's all.)
//   - Generated identities, and the safeguards Orbit's model doesn't have: versions are numbered
//     1, 2, 3… with no gaps or repeats, an identity is never reused, and a version is never made
//     that is exactly like one that already exists.
//   - Drafts. Orbit has no drafts: only versions. A draft here is just what someone is editing.
//   - The order of properties is for people: Orbit's validation ignores it, so two versions with
//     the same properties in another order are the same (versionLike), and reordering alone never
//     makes a version.
import {
  type DefinitionRef, type DefinitionVersion, type Field, type FieldType, type Issue, type PropertyPath, type PropertyType, type Resolve,
  checkFields, deepFreeze, defineVersion, propertyPathWords, refOf, sameDefinition, sameFields, validate,
} from '#shared/features/definitions'
import { describeDefinitionIssue } from '../features/experiment'
import { type Appearance, DEFAULT_APPEARANCE, checkAppearance } from './appearance'

/** A Definition made in one workspace, with every version it has had (oldest first). */
export interface MadeDefinition {
  readonly id: string
  readonly workspaceId: string
  /** Experimental metadata, for people only. Never identity, and never a version. */
  readonly name: string
  readonly description: string
  /** How people see it in Orbit: an icon and a colour. Presentation only, never in a version. */
  readonly appearance: Appearance
  readonly versions: readonly DefinitionVersion[]
}

/**
 * A property being edited: one row of the model, at any level. `key` follows it through renames and
 * moves (unique in the whole draft), so changes can be told apart. A local object holds its own rows
 * (`fields`); a reference names exactly one version (`definition`).
 */
export interface DraftField {
  readonly key: number
  readonly name: string
  readonly type: PropertyType
  /** May be absent. New properties are required. */
  readonly optional: boolean
  /** A local object's own properties (type 'object' only). */
  readonly fields?: readonly DraftField[]
  /** Exactly the version referenced (type 'reference' only). Never "the latest": a version is chosen. */
  readonly definition?: DefinitionRef
}

/** What someone is editing: a first version, or the next one, started from an existing version. */
export interface Draft {
  /** The version it started from; null for a brand-new Definition. */
  readonly basedOn: number | null
  readonly fields: readonly DraftField[]
  readonly nextKey: number
}

/** A new Definition before its first version: its name, description and appearance, and its properties. */
export interface NewDefinition {
  readonly name: string
  readonly description: string
  /** The Definition icon in pink, unless chosen. */
  readonly appearance?: Appearance
  readonly draft: Draft
}

// --- Orbit-provided samples ---

/**
 * What this preview shows as provided by Orbit: samples, visible to every workspace, read-only.
 * Orbit doesn't actually provide any Definitions; these exist only in builds with the experiment.
 * Published versions are never edited or removed (shared/features/definitions.ts): to change one,
 * add its next version. test/contract-foundation.test.ts pins each published version's content.
 */
export const ORBIT_PROVIDED: readonly DefinitionVersion[] = deepFreeze([
  defineVersion({ id: 'orbit.contact-name', version: 1, name: 'Contact name', workspaceId: null, fields: [{ name: 'name', type: 'string' }] }),
  defineVersion({
    id: 'orbit.postal-address', version: 1, name: 'Postal address', workspaceId: null,
    fields: [{ name: 'street', type: 'string' }, { name: 'postcode', type: 'string' }, { name: 'city', type: 'string' }],
  }),
])

/** Descriptions of the samples: experimental metadata, like a made Definition's description. */
export const ORBIT_DESCRIPTIONS: Readonly<Record<string, string>> = {
  'orbit.contact-name': 'The name to use when contacting someone.',
  'orbit.postal-address': 'Where post reaches someone.',
}

// --- Identity ---

/**
 * A new identity, never one already taken (anywhere this tab knows of, samples included). People
 * never type one: an identity isn't a name, so it can't be "fixed" by renaming.
 */
export function newIdentity(taken: (id: string) => boolean, random: () => string = () => crypto.randomUUID()): string {
  for (let attempt = 0; attempt < 20; attempt++) {
    const id = `definition-${random().replace(/[^a-z0-9]/gi, '').slice(0, 12).toLowerCase()}`
    if (id.length > 'definition-'.length && !taken(id)) return id
  }
  throw new Error('Couldn’t find an unused identity')
}

// --- Drafts ---

export const blankDraft = (): Draft => ({ basedOn: null, fields: [{ key: 0, name: '', type: 'string', optional: false }], nextKey: 1 })

/**
 * A draft that starts as an exact copy of a version: every property, at every level, with its own
 * key (numbered depth-first, so the same version always gives the same keys: changesFrom relies on
 * it). A local object's properties stay inside it; a reference stays a reference to exactly the
 * version it names. Nothing is flattened, copied in or dropped.
 */
export function draftFrom(version: DefinitionVersion): Draft {
  let next = 0
  const from = (fields: readonly Field[]): DraftField[] => fields.map((f): DraftField => {
    const base = { key: next++, name: f.name, optional: f.optional === true }
    if (f.type === 'object') return { ...base, type: 'object', fields: from(f.fields) }
    if (f.type === 'reference') return { ...base, type: 'reference', definition: refOf(f.definition) }
    return { ...base, type: f.type }
  })
  const fields = from(version.fields)
  return { basedOn: version.version, fields, nextKey: next }
}

/** A draft property and where it is: the object holding it (null: the top level), its index there, and its path of names. */
export interface Located {
  readonly field: DraftField
  readonly parent: number | null
  readonly index: number
  readonly path: PropertyPath
}

/** Every property of a draft, depth-first, each with where it is. */
export function locate(fields: readonly DraftField[], parent: number | null = null, at: PropertyPath = []): Located[] {
  return fields.flatMap((field, index) => {
    const here: Located = { field, parent, index, path: [...at, field.name] }
    return field.type === 'object' ? [here, ...locate(field.fields ?? [], field.key, here.path)] : [here]
  })
}
export const findField = (draft: Draft, key: number): Located | null => locate(draft.fields).find((l) => l.field.key === key) ?? null
/** The properties directly inside `parent` (null: the top level). */
export const childrenOf = (draft: Draft, parent: number | null): readonly DraftField[] =>
  parent === null ? draft.fields : findField(draft, parent)?.field.fields ?? []

/** The same draft with `parent`'s properties (null: the top level) replaced by `change(them)`. */
function withChildren(draft: Draft, parent: number | null, change: (fields: readonly DraftField[]) => readonly DraftField[]): Draft {
  if (parent === null) return { ...draft, fields: change(draft.fields) }
  const visit = (fields: readonly DraftField[]): DraftField[] => fields.map((f) =>
    f.key === parent ? { ...f, fields: change(f.fields ?? []) } : f.type === 'object' ? { ...f, fields: visit(f.fields ?? []) } : f)
  return { ...draft, fields: visit(draft.fields) }
}
const insert = <T>(list: readonly T[], item: T, index: number) => {
  const next = [...list]
  next.splice(Math.max(0, Math.min(index, next.length)), 0, item)
  return next
}

/**
 * Adds a property inside `parent` (the top level by default) at `index` (the end by default). New
 * properties are required. An object starts empty; a reference names exactly one version.
 */
export function addField(draft: Draft, type: PropertyType = 'string', options: { parent?: number | null; index?: number; definition?: DefinitionRef; name?: string } = {}): Draft {
  const base = { key: draft.nextKey, name: options.name ?? '', optional: false }
  const field: DraftField = type === 'object'
    ? { ...base, type, fields: [] }
    : type === 'reference'
      ? { ...base, type, definition: refOf(options.definition!) }
      : { ...base, type }
  const parent = options.parent ?? null
  const added = withChildren(draft, parent, (fields) => insert(fields, field, options.index ?? fields.length))
  return { ...added, nextKey: draft.nextKey + 1 }
}

/** Changes one property, wherever it is. Its key, kind of contents and children stay its own. */
export function updateField(draft: Draft, key: number, change: Partial<Pick<DraftField, 'name' | 'type' | 'optional' | 'definition'>>): Draft {
  const visit = (fields: readonly DraftField[]): DraftField[] => fields.map((f) =>
    f.key === key ? { ...f, ...change } : f.type === 'object' ? { ...f, fields: visit(f.fields ?? []) } : f)
  return { ...draft, fields: visit(draft.fields) }
}

/** Removes one property, wherever it is (an object with everything inside it). */
export function removeField(draft: Draft, key: number): Draft {
  const visit = (fields: readonly DraftField[]): DraftField[] =>
    fields.filter((f) => f.key !== key).map((f) => (f.type === 'object' ? { ...f, fields: visit(f.fields ?? []) } : f))
  return { ...draft, fields: visit(draft.fields) }
}

/** Whether `key` is `ancestor` or inside it. */
export function isWithin(draft: Draft, key: number, ancestor: number): boolean {
  for (let at: number | null = key; at !== null; at = findField(draft, at)?.parent ?? null) if (at === ancestor) return true
  return false
}

/**
 * Moves a property to `to` among `parent`'s properties (its own level by default). Within a level
 * it's the same properties in another order: for people only (see versionLike). Into another object
 * it changes the contract. A property never moves into itself or its own contents.
 */
export function moveField(draft: Draft, key: number, to: number, parent?: number | null): Draft {
  const where = findField(draft, key)
  if (!where) return draft
  const target = parent === undefined ? where.parent : parent
  if (target !== null && isWithin(draft, target, key)) return draft
  const without = withChildren(draft, where.parent, (fields) => fields.filter((f) => f.key !== key))
  return withChildren(without, target, (fields) => insert(fields, where.field, to))
}

/** Every object a property could live in (the top level first), by path: never the property itself or its contents. */
export function placesFor(draft: Draft, key: number | null): { key: number | null; path: PropertyPath }[] {
  const objects = locate(draft.fields).filter((l) => l.field.type === 'object' && (key === null || !isWithin(draft, l.field.key, key)))
  return [{ key: null, path: [] }, ...objects.map((l) => ({ key: l.field.key, path: l.path }))]
}

/**
 * The properties a draft describes, as Orbit's model has them: names exactly as typed, local objects
 * with their own properties, references to exactly the version chosen. A name with spaces around it
 * isn't tidied but refused (draftProblems), by Orbit's one naming rule.
 */
export const fieldsOf = (draft: Pick<Draft, 'fields'>): Field[] => draft.fields.map(toField)
function toField(f: DraftField): Field {
  const base = { name: f.name, ...(f.optional ? { optional: true as const } : {}) }
  if (f.type === 'object') return { ...base, type: 'object', fields: (f.fields ?? []).map(toField) }
  if (f.type === 'reference') return { ...base, type: 'reference', definition: refOf(f.definition!) }
  return { ...base, type: f.type }
}

/** What a draft is checked against: the workspace making it, and how its references resolve there. */
export interface DraftContext {
  readonly owner: string
  readonly resolve: Resolve
  /** How a referenced version is named for people. */
  readonly label?: (ref: DefinitionRef) => string
}

/**
 * Why a draft can't become a version yet, in plain words. None means it can. Judged by Orbit's own
 * check of the whole resolved contract (checkFields: the naming rule in every object, references
 * resolved and allowed, no cycles, the depth limit): there is no second check here. A name of only
 * spaces counts as no name.
 */
export function draftProblems(draft: Draft, context?: DraftContext): string[] {
  const problems: string[] = []
  if (!draft.fields.length) problems.push('Add at least one property.')
  const blank = (f: Field): Field => ({ ...f, name: f.name.trim() ? f.name : '', ...(f.type === 'object' ? { fields: f.fields.map(blank) } : {}) } as Field)
  const issues = checkFields(fieldsOf(draft).map(blank), { owner: context?.owner ?? null, resolve: context?.resolve })
  problems.push(...issues.map((i) => describeDefinitionIssue(i, context?.label)))
  return [...new Set(problems)]
}

export const nameProblem = (name: string) => (name.trim() ? null : 'Give it a name, such as Person or Invoice.')

/**
 * Gentle notes about a name: never blocking, since names aren't identity, but two Definitions with
 * one name, or a "Person" next to the workspace's People, are easy to mistake for each other.
 */
export function nameNotes(name: string, others: readonly string[], workspaceName: string): string[] {
  const notes: string[] = []
  const tidy = name.trim().toLowerCase()
  if (!tidy) return notes
  if (others.some((o) => o.trim().toLowerCase() === tidy)) {
    notes.push(`Another Definition here is called ${name.trim()}. They would be two different Definitions with the same name.`)
  }
  if (/^(person|people|persons|member|members)$/.test(tidy)) {
    notes.push(`This describes information about people. It doesn’t change who belongs to ${workspaceName}: that’s People.`)
  }
  return notes
}

// --- What changed ---

/**
 * One change from the version a draft started from, located by path (names, outermost first).
 * `path` is where the property is now; `from` is where it was, when that's what changed.
 */
export type Change =
  | { readonly kind: 'added'; readonly path: PropertyPath; readonly type: PropertyType }
  | { readonly kind: 'removed'; readonly path: PropertyPath }
  | { readonly kind: 'renamed'; readonly from: PropertyPath; readonly path: PropertyPath }
  | { readonly kind: 'moved'; readonly from: PropertyPath; readonly path: PropertyPath }
  | { readonly kind: 'retyped'; readonly path: PropertyPath; readonly from: PropertyType; readonly to: PropertyType }
  | { readonly kind: 'requirement'; readonly path: PropertyPath; readonly optional: boolean }
  | { readonly kind: 'repointed'; readonly path: PropertyPath; readonly from: DefinitionRef; readonly to: DefinitionRef }

/**
 * How a draft differs from the version it started from, property by property, at every level. Rows
 * are followed by key (draftFrom numbers the version's properties the same way every time), so a
 * renamed or moved property is told apart from one removed and another added. Inside something
 * added or removed, nothing more is listed: "Adds contact" says it all.
 */
export function changesFrom(base: DefinitionVersion, draft: Draft): Change[] {
  const before = new Map(locate(draftFrom(base).fields).map((l) => [l.field.key, l]))
  const now = new Map(locate(draft.fields).map((l) => [l.field.key, l]))
  const changes: Change[] = []
  for (const [key, was] of before) {
    const is = now.get(key)
    if (!is) {
      if (was.parent === null || now.has(was.parent)) changes.push({ kind: 'removed', path: was.path })
      continue
    }
    const named = is.field.name.trim() ? is.path : [...is.path.slice(0, -1), was.field.name]
    if (is.field.name.trim() && is.field.name !== was.field.name) changes.push({ kind: 'renamed', from: was.path, path: named })
    if (is.parent !== was.parent) changes.push({ kind: 'moved', from: was.path, path: named })
    if (is.field.type !== was.field.type) changes.push({ kind: 'retyped', path: named, from: was.field.type, to: is.field.type })
    if (is.field.optional !== was.field.optional) changes.push({ kind: 'requirement', path: named, optional: is.field.optional })
    if (is.field.type === 'reference' && was.field.type === 'reference' && !sameDefinition(is.field.definition!, was.field.definition!)) {
      changes.push({ kind: 'repointed', path: named, from: was.field.definition!, to: is.field.definition! })
    }
  }
  for (const [key, is] of now) {
    if (before.has(key)) continue
    if (is.parent === null || before.has(is.parent)) changes.push({ kind: 'added', path: is.path, type: is.field.type })
  }
  return changes
}

/** The existing version with exactly these properties (in any order), if there is one: Orbit's own comparison. */
export const versionLike = (made: MadeDefinition, fields: readonly Field[]): DefinitionVersion | null =>
  made.versions.find((v) => sameFields(v.fields, fields)) ?? null

// --- Versions ---

/** Orbit's model doesn't check this; the experiment does, every time it makes or reads a version. */
export function checkSequence(made: MadeDefinition): void {
  made.versions.forEach((v, i) => {
    if (v.id !== made.id || v.workspaceId !== made.workspaceId) throw new Error(`Version ${v.version} doesn’t belong to ${made.id}`)
    if (v.version !== i + 1) throw new Error(`${made.id} has version ${v.version} where version ${i + 1} belongs`)
  })
}

/** A new Definition and its first, immutable version. References resolve with `resolve`, in its workspace. */
export function createDefinition(input: { id: string; workspaceId: string; name: string; description: string; appearance?: Appearance; draft: Draft; resolve?: Resolve }): MadeDefinition {
  const name = input.name.trim()
  if (!name) throw new Error('A Definition needs a name')
  if (draftProblems(input.draft, { owner: input.workspaceId, resolve: input.resolve ?? (() => null) }).length) throw new Error('These properties can’t be a Definition yet')
  const first = defineVersion({ id: input.id, version: 1, name, workspaceId: input.workspaceId, fields: fieldsOf(input.draft) }, input.resolve)
  const appearance = checkAppearance(input.appearance ?? DEFAULT_APPEARANCE)
  return deepFreeze({ id: input.id, workspaceId: input.workspaceId, name, description: input.description.trim(), appearance, versions: [first] })
}

/**
 * The next version, after the last one. Earlier versions stay exactly as they were. Refused when
 * the draft is exactly like an existing version: that version already says it.
 */
export function addVersion(made: MadeDefinition, draft: Draft, resolve?: Resolve): MadeDefinition {
  checkSequence(made)
  if (draftProblems(draft, { owner: made.workspaceId, resolve: resolve ?? (() => null) }).length) throw new Error('These properties can’t be a Definition yet')
  const fields = fieldsOf(draft)
  const like = versionLike(made, fields)
  if (like) throw new Error(`This is exactly version ${like.version}`)
  const version = made.versions.length + 1
  const next = defineVersion({ id: made.id, version, name: made.name, workspaceId: made.workspaceId, fields }, resolve)
  return deepFreeze({ ...made, versions: [...made.versions, next] })
}

/**
 * A new name, description or appearance: the same Definition, the very same versions (not copies),
 * nothing frozen. Appearance left out stays as it was.
 */
export function renamed(made: MadeDefinition, change: { name: string; description: string; appearance?: Appearance }): MadeDefinition {
  const name = change.name.trim()
  if (!name) throw new Error('A Definition needs a name')
  const appearance = checkAppearance(change.appearance ?? made.appearance)
  return deepFreeze({ ...made, name, description: change.description.trim(), appearance })
}

// --- Checking an example ---

/** One property's example value as typed: text as it is, a number or yes/no as chosen. */
export type ExampleValue = { readonly kind: 'empty' } | { readonly kind: 'text'; readonly text: string } | { readonly kind: 'yes' } | { readonly kind: 'no' }

export interface Example {
  /** By property name. */
  readonly values: Readonly<Record<string, ExampleValue>>
  /** Something that isn't one of the properties, to see what happens to it. */
  readonly extra: { readonly name: string; readonly text: string } | null
}

/**
 * The example as data. An empty box is left out, so a missing property can be seen; a number box
 * holding something that isn't a number stays text, so a wrong type can be seen too.
 */
export function exampleData(fields: readonly Field[], example: Example): Record<string, unknown> {
  const data: Record<string, unknown> = {}
  for (const f of fields) {
    const v = example.values[f.name]
    if (!v || v.kind === 'empty') continue
    if (v.kind === 'yes' || v.kind === 'no') data[f.name] = v.kind === 'yes'
    else if (f.type === 'number' && v.text.trim() !== '' && Number.isFinite(Number(v.text))) data[f.name] = Number(v.text)
    else data[f.name] = v.text
  }
  if (example.extra?.name.trim()) data[example.extra.name.trim()] = example.extra.text
  return data
}

/** Orbit's own validation, applied to the example: exactly what Orbit would accept or refuse. */
export const checkExample = (fields: readonly Field[], data: unknown): Issue[] =>
  validate({ id: 'example', version: 0, name: 'example', workspaceId: null, fields }, data)

// --- Words ---

export const typeWords: Record<PropertyType, string> = { string: 'Text', number: 'Number', boolean: 'Yes or no', object: 'Object', reference: 'Definition' }
const kindWords: Record<string, string> = {
  string: 'text', number: 'a number', boolean: 'yes or no', undefined: 'missing', null: 'empty', array: 'a list', object: 'a group', other: 'something else',
}

export function issueWords(issue: Issue): string {
  switch (issue.problem) {
    case 'not_an_object': return 'This isn’t a set of properties at all.'
    case 'missing': return `${propertyPathWords(issue.path)} is missing, and it’s required.`
    case 'unexpected': return `${propertyPathWords(issue.path)} isn’t one of its properties, so it isn’t accepted.`
    case 'wrong_type': return `${propertyPathWords(issue.path)} should be ${kindWords[issue.expected]}, not ${kindWords[issue.actual] ?? 'something else'}.`
  }
}

export function changeWords(change: Change, label: (ref: DefinitionRef) => string = (r) => `${r.id} · v${r.version}`): string {
  const at = (path: PropertyPath) => (path.at(-1) ? propertyPathWords(path) : [...path.slice(0, -1), 'an unnamed property'].join(' › '))
  switch (change.kind) {
    case 'added': return `Adds ${at(change.path)} (${typeWords[change.type].toLowerCase()})`
    case 'removed': return `Removes ${at(change.path)}`
    case 'renamed': return `Renames ${at(change.from)} to ${change.path.at(-1)}`
    case 'moved': return `Moves ${at(change.from)} ${change.path.length > 1 ? `into ${propertyPathWords(change.path.slice(0, -1))}` : 'to the top level'}`
    case 'retyped': return `Changes ${at(change.path)} from ${typeWords[change.from].toLowerCase()} to ${typeWords[change.to].toLowerCase()}`
    case 'requirement': return `Makes ${at(change.path)} ${change.optional ? 'optional' : 'required'}`
    case 'repointed': return `Changes ${at(change.path)} from ${label(change.from)} to ${label(change.to)}`
  }
}
