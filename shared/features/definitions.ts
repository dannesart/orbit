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
 * In this first experiment a Definition is a flat object of fields, each a string, a number or a
 * boolean, and nothing else is allowed (no extra fields). A field is required unless it is marked
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

export type FieldType = 'string' | 'number' | 'boolean'
export type Scalar = string | number | boolean
export type Data = { readonly [field: string]: Scalar }

export interface DefinitionRef {
  readonly id: string
  readonly version: number
}

export interface Field {
  readonly name: string
  readonly type: FieldType
  /**
   * May be absent. Only ever `true` when set (defineVersion drops anything else), so a required
   * field reads exactly as every field did before optional fields existed.
   */
  readonly optional?: true
}

export const isOptional = (field: Pick<Field, 'optional'>) => field.optional === true

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

/** A new, immutable Definition version. */
export function defineVersion(definition: DefinitionVersion): DefinitionVersion {
  const names = definition.fields.map((f) => f.name)
  if (names.some((n) => !n) || new Set(names).size !== names.length) {
    throw new Error(`Definition ${definition.id}@${definition.version} needs distinct, non-empty field names`)
  }
  // Required is the default and is never written down, so a field is either { name, type } or
  // { name, type, optional: true }: two versions that mean the same thing look the same.
  const fields = definition.fields.map((f): Field => (f.optional === true ? { name: f.name, type: f.type, optional: true } : { name: f.name, type: f.type }))
  return frozenCopy({ ...definition, fields })
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
 * A problem with data, described by field and kind only. Issues never carry the data itself, so
 * they can be shown, kept as evidence or reported without exposing what a Record contains.
 */
export type Issue =
  | { readonly problem: 'not_an_object'; readonly actual: Kind }
  | { readonly problem: 'missing'; readonly field: string; readonly expected: FieldType }
  | { readonly problem: 'unexpected'; readonly field: string }
  | { readonly problem: 'wrong_type'; readonly field: string; readonly expected: FieldType; readonly actual: Kind }

/** Whether `data` satisfies `definition` exactly. Returns every problem found; none means valid. */
export function validate(definition: DefinitionVersion, data: unknown): Issue[] {
  const kind = kindOf(data)
  if (kind !== 'object') return [{ problem: 'not_an_object', actual: kind }]
  const object = data as Record<string, unknown>
  const issues: Issue[] = []
  for (const { name, type, optional } of definition.fields) {
    if (!Object.hasOwn(object, name)) {
      if (optional !== true) issues.push({ problem: 'missing', field: name, expected: type })
    } else if (kindOf(object[name]) !== type) issues.push({ problem: 'wrong_type', field: name, expected: type, actual: kindOf(object[name]) })
  }
  for (const name of Object.keys(object)) {
    if (!definition.fields.some((f) => f.name === name)) issues.push({ problem: 'unexpected', field: name })
  }
  return issues
}

/**
 * Whether two lists of fields describe the same contract: the same names, each with the same type
 * and the same requiredness. Order is presentation, never part of a contract, so it is ignored.
 * Names are compared exactly, as validation matches them. The one comparison of structures: every
 * "is this the same version?" and "do these look alike?" question asks it.
 */
export function sameFields(a: readonly Pick<Field, 'name' | 'type' | 'optional'>[], b: readonly Pick<Field, 'name' | 'type' | 'optional'>[]): boolean {
  if (a.length !== b.length) return false
  const byName = new Map(b.map((f) => [f.name, f]))
  if (byName.size !== b.length || new Set(a.map((f) => f.name)).size !== a.length) return false
  return a.every((f) => {
    const other = byName.get(f.name)
    return other !== undefined && other.type === f.type && (other.optional === true) === (f.optional === true)
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
