// Experiment #7: Definitions made in a workspace, independently of any workflow. Pure and in memory.
//
// What is Orbit's (shared/features/definitions.ts, unchanged): a Definition version is an exact
// identity (id + version), immutable once made (defineVersion), with required text, number or yes/no
// properties and nothing else (validate). Its `name` is for people and never identity.
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
  type DefinitionVersion, type Field, type FieldType, type Issue, type PropertyType, type ScalarField,
  checkPropertyNames, deepFreeze, defineVersion, propertyPathWords, sameFields, validate,
} from '#shared/features/definitions'
import { describeNamingIssues } from '../features/experiment'
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

/** A property being edited. `key` follows a row through renames, so changes can be told apart. */
export interface DraftField {
  readonly key: number
  readonly name: string
  readonly type: FieldType
  /** May be absent. New properties are required. */
  readonly optional: boolean
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
 * A version's properties as the Studio edits them: value properties only. The Studio has no editor
 * for local objects (Orbit's model has them; this experiment doesn't build them), so a version
 * with one is refused here, never shown flattened or with its objects dropped.
 */
function editableFields(version: DefinitionVersion): readonly ScalarField[] {
  if (version.fields.some((f) => f.type === 'object')) throw new Error(`${version.id}@${version.version} has local objects, which the Studio can’t edit yet`)
  return version.fields as readonly ScalarField[]
}

/** A draft that starts as an exact copy of a version. */
export function draftFrom(version: DefinitionVersion): Draft {
  return { basedOn: version.version, fields: editableFields(version).map((f, key) => ({ key, name: f.name, type: f.type, optional: f.optional === true })), nextKey: version.fields.length }
}

export function addField(draft: Draft, type: FieldType = 'string'): Draft {
  return { ...draft, fields: [...draft.fields, { key: draft.nextKey, name: '', type, optional: false }], nextKey: draft.nextKey + 1 }
}
export const updateField = (draft: Draft, key: number, change: Partial<Omit<DraftField, 'key'>>): Draft =>
  ({ ...draft, fields: draft.fields.map((f) => (f.key === key ? { ...f, ...change } : f)) })
export const removeField = (draft: Draft, key: number): Draft => ({ ...draft, fields: draft.fields.filter((f) => f.key !== key) })
/** The same properties in another order: for people only (see versionLike). */
export function moveField(draft: Draft, key: number, to: number): Draft {
  const from = draft.fields.findIndex((f) => f.key === key)
  if (from < 0) return draft
  const fields = [...draft.fields]
  const [moved] = fields.splice(from, 1)
  fields.splice(Math.max(0, Math.min(to, fields.length)), 0, moved!)
  return { ...draft, fields }
}

/**
 * The properties a draft describes, as Orbit's model has them: names exactly as typed. A name with
 * spaces around it isn't tidied but refused (draftProblems), by Orbit's one naming rule.
 */
export const fieldsOf = (draft: Draft): Field[] => draft.fields.map((f) => (f.optional ? { name: f.name, type: f.type, optional: true } : { name: f.name, type: f.type }))

/** Why a draft can't become a version yet, in plain words. None means it can. */
export function draftProblems(draft: Draft): string[] {
  const fields = fieldsOf(draft)
  const problems: string[] = []
  if (!fields.length) problems.push('Add at least one property.')
  // Orbit's naming rule, the one the Designer uses too (a name of only spaces is no name).
  problems.push(...describeNamingIssues(checkPropertyNames(fields.map((f) => (f.name.trim() ? f.name : '')))))
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

export type Change =
  | { readonly kind: 'added'; readonly name: string; readonly type: FieldType }
  | { readonly kind: 'removed'; readonly name: string }
  | { readonly kind: 'renamed'; readonly from: string; readonly to: string }
  | { readonly kind: 'retyped'; readonly name: string; readonly from: FieldType; readonly to: FieldType }
  | { readonly kind: 'requirement'; readonly name: string; readonly optional: boolean }

/** How a draft differs from the version it started from, row by row. */
export function changesFrom(base: DefinitionVersion, draft: Draft): Change[] {
  const changes: Change[] = []
  editableFields(base).forEach((field, key) => {
    const now = draft.fields.find((f) => f.key === key)
    if (!now) return changes.push({ kind: 'removed', name: field.name })
    const name = now.name.trim()
    if (name && name !== field.name) changes.push({ kind: 'renamed', from: field.name, to: name })
    if (now.type !== field.type) changes.push({ kind: 'retyped', name: name || field.name, from: field.type, to: now.type })
    if (now.optional !== (field.optional === true)) changes.push({ kind: 'requirement', name: name || field.name, optional: now.optional })
  })
  for (const f of draft.fields) if (f.key >= base.fields.length) changes.push({ kind: 'added', name: f.name.trim(), type: f.type })
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

/** A new Definition and its first, immutable version. */
export function createDefinition(input: { id: string; workspaceId: string; name: string; description: string; appearance?: Appearance; draft: Draft }): MadeDefinition {
  const name = input.name.trim()
  if (!name) throw new Error('A Definition needs a name')
  if (draftProblems(input.draft).length) throw new Error('These properties can’t be a Definition yet')
  const first = defineVersion({ id: input.id, version: 1, name, workspaceId: input.workspaceId, fields: fieldsOf(input.draft) })
  const appearance = checkAppearance(input.appearance ?? DEFAULT_APPEARANCE)
  return deepFreeze({ id: input.id, workspaceId: input.workspaceId, name, description: input.description.trim(), appearance, versions: [first] })
}

/**
 * The next version, after the last one. Earlier versions stay exactly as they were. Refused when
 * the draft is exactly like an existing version: that version already says it.
 */
export function addVersion(made: MadeDefinition, draft: Draft): MadeDefinition {
  checkSequence(made)
  if (draftProblems(draft).length) throw new Error('These properties can’t be a Definition yet')
  const fields = fieldsOf(draft)
  const like = versionLike(made, fields)
  if (like) throw new Error(`This is exactly version ${like.version}`)
  const version = made.versions.length + 1
  const next = defineVersion({ id: made.id, version, name: made.name, workspaceId: made.workspaceId, fields })
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

export const typeWords: Record<PropertyType, string> = { string: 'Text', number: 'Number', boolean: 'Yes or no', object: 'Object' }
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

export function changeWords(change: Change): string {
  switch (change.kind) {
    case 'added': return `Adds ${change.name || 'an unnamed property'} (${typeWords[change.type].toLowerCase()})`
    case 'removed': return `Removes ${change.name}`
    case 'renamed': return `Renames ${change.from} to ${change.to}`
    case 'retyped': return `Changes ${change.name} from ${typeWords[change.from].toLowerCase()} to ${typeWords[change.to].toLowerCase()}`
    case 'requirement': return `Makes ${change.name} ${change.optional ? 'optional' : 'required'}`
  }
}
