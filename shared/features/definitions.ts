/**
 * Definitions, Records and Values: the first words of Orbit's language for data.
 *
 *   A Definition says what some data is. Each version of it is immutable: changing a Definition
 *   means making a new version, so anything that once relied on a version can still say exactly
 *   what it relied on.
 *   A Record is persistent data with an identity, a workspace, and a pinned Definition version.
 *   A Value is data together with the Definition version it satisfies. It has no identity and is
 *   never stored: it is what Features receive and produce.
 *
 * A Definition is an object of fields (properties), each a string, a number, a boolean, or a local
 * object: an object with fields of its own, under the same rules, belonging to the Definition
 * version that contains it (ObjectField). Nothing else is allowed (no extra fields, at any level).
 * There are no lists, no references to other Definitions and no Record relationships. A field is required unless it is marked
 * optional. An optional field may be absent; when present, it must be of its type. Optional never
 * means nullable: null is not a string, a number or a boolean, so it is never accepted, and absence
 * is never turned into an empty string, zero, false or null. Whether a field is required is part of
 * a version: changing it means a new version. Matching is by exact identity: the same id and the
 * same version. Two Definitions that happen to look alike
 * are still different Definitions. Pure and in memory: nothing here reads or writes storage.
 *
 * Versions are forever. A published version (one defineVersion has made) is never modified and
 * never deleted, by anyone, for any reason. Deprecating or archiving a Definition may hide it
 * from new choices, but every version must stay resolvable by its exact identity, so historical
 * Records, Mappings and evidence keep meaning exactly what they meant. The order of fields is
 * presentation, never part of a contract: two versions are the same contract when sameFields says
 * so, and reordering alone never makes a version.
 *
 * What this module enforces, and what it can't:
 *   - Enforced here: a version is a deep-frozen private copy (defineVersion), so nothing holding
 *     it can change it in memory, and every comparison of contracts is one function (sameFields).
 *   - Not enforceable here: that a version survives. This module holds no versions; whoever keeps
 *     them (today, a browser tab's memory or source code; later, storage) must refuse to update or
 *     delete one, and must resolve every version ever published. Orbit-provided versions live in
 *     source code, where a later edit could change them; regression tests pin their content, which
 *     catches such an edit but cannot guarantee durability. Durable immutability needs persistence
 *     that refuses changes (write-once rows, no update or delete path), which doesn't exist yet.
 */

/** The types of a value property: text, a number, or yes/no. */
export type FieldType = 'string' | 'number' | 'boolean'
/** Every type a property can have: a value, or a local object with properties of its own. */
export type PropertyType = FieldType | 'object'
export type Scalar = string | number | boolean
/** Data: properties whose values are scalars or, for a local object, data of the same kind. */
export type Data = { readonly [property: string]: Scalar | Data }

export interface DefinitionRef {
  readonly id: string
  readonly version: number
}

/** A property holding one value: text, a number or yes/no. */
export interface ScalarField {
  readonly name: string
  readonly type: FieldType
  /**
   * May be absent. Only ever `true` when set (defineVersion drops anything else), so a required
   * field reads exactly as every field did before optional fields existed.
   */
  readonly optional?: true
}

/**
 * A local object: a property whose value is an object with properties of its own. It belongs to
 * the Definition version that contains it and is part of that version's contract. It has no
 * identity, no version and no workspace of its own: it can't be referred to, reused or changed on
 * its own, and changing anything inside it means a new version of the containing Definition. It
 * may itself be optional (all of it may be absent), and may contain local objects.
 */
export interface ObjectField {
  readonly name: string
  readonly type: 'object'
  readonly optional?: true
  /** Its properties, under the same rules as a Definition's: names, requiredness, no others allowed. */
  readonly fields: readonly Field[]
}

export type Field = ScalarField | ObjectField

export const isOptional = (field: Pick<Field, 'optional'>) => field.optional === true
export const isObjectField = (field: Field): field is ObjectField => field.type === 'object'

/**
 * How deeply local objects may nest, in object levels. The data itself is level 1; each local object
 * is one level deeper than the object containing it (the object at path ['contact'] is level 2, at
 * ['contact', 'address'] level 3). At most 16 levels: the deepest local object has a path of 15
 * names, and the longest property path has 16. A Definition deeper than this is refused when it is
 * made, never cut short. Validation follows the Definition, never the data, so it never goes deeper
 * than the Definition it checks against, and refuses one deeper than this.
 */
export const MAX_OBJECT_LEVELS = 16

export interface DefinitionVersion extends DefinitionRef {
  /** For people to read. Never identity: two Definitions may share a name. */
  readonly name: string
  /** The workspace it belongs to, or null when Orbit provides it (visible to every workspace). */
  readonly workspaceId: string | null
  /** Each required unless marked optional; no others are allowed. Their order has no meaning. */
  readonly fields: readonly Field[]
}

/** Persistent data in one workspace, pinned to the Definition version it was written for. */
export interface WorkspaceRecord {
  readonly id: string
  readonly workspaceId: string
  readonly definition: DefinitionRef
  readonly data: Data
}

/** Data and the Definition version it satisfies. No identity, never stored. */
export interface Value {
  readonly definition: DefinitionRef
  readonly data: Data
}

export const refOf = (d: DefinitionRef): DefinitionRef => ({ id: d.id, version: d.version })
export const sameDefinition = (a: DefinitionRef, b: DefinitionRef) => a.id === b.id && a.version === b.version

/** Whether a workspace may use this Definition: its own, or one Orbit provides. */
export const visibleIn = (d: { workspaceId: string | null }, workspaceId: string) =>
  d.workspaceId === null || d.workspaceId === workspaceId

/** Freezes an object and everything inside it, so nobody downstream can change it. */
export function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const inner of Object.values(value)) deepFreeze(inner)
  }
  return value
}

/** A private, frozen copy: what a Feature receives, so it can't touch the original. */
export const frozenCopy = <T>(value: T): T => deepFreeze(structuredClone(value))

/**
 * The rule for naming properties when a version is made, the same wherever one is made (the
 * Studio, the Designer, Orbit-provided samples): a name isn't empty and doesn't start or end with
 * whitespace, and no two siblings are the same name, differ only by letter case, or are the same
 * text written with different Unicode characters (canonically equivalent, such as "é" as one
 * character or as "e" and a combining accent). Spaces inside a name, dots and any script are fine.
 *
 * This is only about making versions. Data is always matched exactly and case-sensitively, and its
 * keys are never trimmed, folded or normalized: "Email" in data never satisfies a property "email".
 * The rule exists so that no Definition has two properties that people (or tools) could confuse.
 * Names are checked, never changed: a name that breaks the rule is refused, not tidied.
 */
export type NamingIssue =
  | { readonly problem: 'empty_name'; readonly path: PropertyPath }
  | { readonly problem: 'surrounding_whitespace'; readonly path: PropertyPath }
  | { readonly problem: 'duplicate_name'; readonly path: PropertyPath }
  | { readonly problem: 'differs_only_by_case'; readonly path: PropertyPath; readonly other: string }
  | { readonly problem: 'equivalent_unicode'; readonly path: PropertyPath; readonly other: string }

/** Canonical Unicode form (NFC): canonically equivalent texts have the same one. */
const canonical = (name: string) => name.normalize('NFC')
/** Canonical form without letter case: locale-independent, upper then lower, so "ß" and "SS" meet. */
const caseless = (name: string) => canonical(canonical(name).toUpperCase().toLowerCase())

/**
 * Whether sibling property names (one object's) follow the naming rule. `parent` is where they
 * are; each issue's path ends with the name it is about (an empty name: ''). Each name is compared
 * with the names before it, and reports the first it conflicts with.
 */
export function checkPropertyNames(names: readonly string[], parent: PropertyPath = []): NamingIssue[] {
  const issues: NamingIssue[] = []
  names.forEach((name, i) => {
    const path = [...parent, name]
    if (!name) return issues.push({ problem: 'empty_name', path })
    if (/^\s|\s$/u.test(name)) issues.push({ problem: 'surrounding_whitespace', path })
    const earlier = names.slice(0, i).filter(Boolean)
    if (earlier.includes(name)) return issues.push({ problem: 'duplicate_name', path })
    const equivalent = earlier.find((other) => canonical(other) === canonical(name))
    if (equivalent !== undefined) return issues.push({ problem: 'equivalent_unicode', path, other: equivalent })
    const cased = earlier.find((other) => caseless(other) === caseless(name))
    if (cased !== undefined) issues.push({ problem: 'differs_only_by_case', path, other: cased })
  })
  return issues
}

/**
 * Why some properties can't be a Definition version: the naming rule within each object, and the
 * shape of each property. Each issue's path is the property it is about.
 *   too_deep      a local object below level MAX_OBJECT_LEVELS
 *   malformed     not a property Orbit knows: an unknown type, a value property with properties of
 *                 its own, an object without them, or anything more (such as an identity: a local
 *                 object has none)
 */
export type DefinitionIssue =
  | NamingIssue
  | { readonly problem: 'too_deep'; readonly path: PropertyPath; readonly level: number }
  | { readonly problem: 'malformed'; readonly path: PropertyPath }

const SCALAR_TYPES: readonly string[] = ['string', 'number', 'boolean'] satisfies FieldType[]
const FIELD_KEYS = new Set(['name', 'type', 'optional', 'fields'])

/** Every reason these properties (a Definition's, at level 1) can't be a version. None: they can. */
export function checkFields(fields: readonly Field[]): DefinitionIssue[] {
  const issues: DefinitionIssue[] = []
  const visit = (list: readonly Field[], at: PropertyPath, level: number) => {
    issues.push(...checkPropertyNames(list.map((f) => f.name), at))
    for (const field of list) {
      const path = [...at, field.name]
      const extra = Object.keys(field).some((key) => !FIELD_KEYS.has(key))
      if (field.type === 'object') {
        if (extra || !Array.isArray(field.fields)) issues.push({ problem: 'malformed', path })
        else if (level + 1 > MAX_OBJECT_LEVELS) issues.push({ problem: 'too_deep', path, level: level + 1 })
        else visit(field.fields, path, level + 1)
      } else if (extra || !SCALAR_TYPES.includes(field.type) || 'fields' in field) {
        issues.push({ problem: 'malformed', path })
      }
    }
  }
  visit(fields, [], 1)
  return issues
}

/**
 * The canonical form: required is the default and is never written down, so a value property is
 * { name, type } or { name, type, optional: true }, and a local object has its `fields` too. Two
 * versions that mean the same thing look the same. Only for fields checkFields accepted.
 */
const canonicalFields = (fields: readonly Field[]): Field[] => fields.map((f): Field => {
  const base = { name: f.name, ...(f.optional === true ? { optional: true as const } : {}) }
  return f.type === 'object' ? { ...base, type: 'object', fields: canonicalFields(f.fields) } : { ...base, type: f.type }
})

/**
 * A new, immutable Definition version, frozen all the way down, local objects included. Refused,
 * never tidied or cut short, when checkFields finds anything wrong.
 */
export function defineVersion(definition: DefinitionVersion): DefinitionVersion {
  const issues = checkFields(definition.fields)
  if (issues.length) {
    throw new Error(`Definition ${definition.id}@${definition.version} can’t be made (${issues.map((i) => `${i.problem} at ${propertyPathWords(i.path)}`).join('; ')})`)
  }
  return frozenCopy({ ...definition, fields: canonicalFields(definition.fields) })
}

/** The paths of every local object in these properties, outermost first. */
export function localObjectPaths(fields: readonly Field[], at: PropertyPath = []): PropertyPath[] {
  return fields.flatMap((f) => (f.type === 'object' ? [[...at, f.name], ...localObjectPaths(f.fields, [...at, f.name])] : []))
}

/** What kind of thing a value is, in the words validation uses. Never the value itself. */
export type Kind = FieldType | 'null' | 'undefined' | 'array' | 'object' | 'other'
export function kindOf(value: unknown): Kind {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  if (typeof value === 'number') return Number.isFinite(value) ? 'number' : 'other'
  switch (typeof value) {
    case 'string': return 'string'
    case 'boolean': return 'boolean'
    case 'undefined': return 'undefined'
    case 'object': return 'object'
    default: return 'other'
  }
}

/**
 * Where in some data a problem is: the property name at each level, outermost first. The data
 * itself is the empty path. A path is a list, never a string joined with dots or anything else,
 * so a property literally named "a.b" (['a.b']) can't be mistaken for a property b inside a
 * local object a (['a', 'b']). A path has at most MAX_OBJECT_LEVELS names.
 */
export type PropertyPath = readonly string[]

/**
 * A problem with data, described by where it is (a PropertyPath) and kinds only. Issues never
 * carry the data itself, so they can be shown, kept as evidence or reported without exposing what
 * a Record contains.
 */
export type Issue =
  | { readonly problem: 'not_an_object'; readonly path: PropertyPath; readonly actual: Kind }
  | { readonly problem: 'missing'; readonly path: PropertyPath; readonly expected: PropertyType }
  | { readonly problem: 'unexpected'; readonly path: PropertyPath }
  | { readonly problem: 'wrong_type'; readonly path: PropertyPath; readonly expected: PropertyType; readonly actual: Kind }

/**
 * Whether `data` satisfies `definition` exactly. Returns every problem found; none means valid.
 * One validator at every level: a local object is checked by the same rules as the data itself.
 *   - A required property must be there; an optional one may be absent. An absent optional object
 *     requires nothing inside it. A present one must satisfy its own properties, all of them.
 *   - Null is never absence: it is a value of the wrong type (for an object too).
 *   - Nothing unexpected, at any level.
 * Validation follows the Definition: it looks inside a value only where the Definition has a local
 * object, so data nested deeper than its Definition is a wrong type where the Definition ends, and
 * an unexpected property is reported as one, whatever it holds. Nothing is skipped or cut short.
 */
export function validate(definition: DefinitionVersion, data: unknown): Issue[] {
  const kind = kindOf(data)
  if (kind !== 'object') return [{ problem: 'not_an_object', path: [], actual: kind }]
  const issues: Issue[] = []
  validateObject(definition.fields, data as Record<string, unknown>, [], 1, issues)
  return issues
}

function validateObject(fields: readonly Field[], object: Record<string, unknown>, at: PropertyPath, level: number, issues: Issue[]): void {
  // Only a Definition defineVersion refused could be this deep: refuse it here too, never guess.
  if (level > MAX_OBJECT_LEVELS) throw new Error(`A Definition can’t have more than ${MAX_OBJECT_LEVELS} object levels`)
  for (const field of fields) {
    const path = [...at, field.name]
    if (!Object.hasOwn(object, field.name)) {
      if (field.optional !== true) issues.push({ problem: 'missing', path, expected: field.type })
      continue
    }
    const actual = kindOf(object[field.name])
    if (actual !== field.type) issues.push({ problem: 'wrong_type', path, expected: field.type, actual })
    else if (field.type === 'object') validateObject(field.fields, object[field.name] as Record<string, unknown>, path, level + 1, issues)
  }
  for (const name of Object.keys(object)) {
    if (!fields.some((f) => f.name === name)) issues.push({ problem: 'unexpected', path: [...at, name] })
  }
}

/**
 * A path in words, for people: names joined with " › " (the data itself: "the data"). For display
 * only: never parsed back, never used to find anything; the path itself is the location.
 */
export const propertyPathWords = (path: PropertyPath): string => (path.length ? path.join(' › ') : 'the data')

/**
 * Whether two lists of fields describe the same contract: the same names, each with the same type
 * and the same requiredness, and each local object with the same contract inside it. Order is
 * presentation, never part of a contract, so it is ignored at every level. Names are compared
 * exactly, as validation matches them. The one comparison of structures: every "is this the same
 * version?" and "do these look alike?" question asks it.
 */
export function sameFields(a: readonly Field[], b: readonly Field[]): boolean {
  if (a.length !== b.length) return false
  const byName = new Map(b.map((f) => [f.name, f]))
  if (byName.size !== b.length || new Set(a.map((f) => f.name)).size !== a.length) return false
  return a.every((f) => {
    const other = byName.get(f.name)
    if (other === undefined || other.type !== f.type || (other.optional === true) !== (f.optional === true)) return false
    return f.type !== 'object' || sameFields(f.fields, (other as ObjectField).fields)
  })
}

/** Whether two pieces of data are the same, field for field (for JSON-like data). */
export function sameData(a: unknown, b: unknown): boolean {
  if (a === b) return true
  const ka = kindOf(a)
  if (ka !== kindOf(b) || (ka !== 'object' && ka !== 'array')) return false
  const ea = Object.keys(a as object)
  const eb = Object.keys(b as object)
  return ea.length === eb.length
    && ea.every((k) => Object.hasOwn(b as object, k) && sameData((a as any)[k], (b as any)[k]))
}
