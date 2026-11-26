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
 * A Definition is an object of fields (properties), each a string, a number, a boolean, a local
 * object (an object with fields of its own, under the same rules, belonging to the Definition
 * version that contains it: ObjectField), or a reference to another published Definition version,
 * pinned exactly (ReferenceField). Nothing else is allowed (no extra fields, at any level). There
 * are no lists and no Record relationships: a reference describes structure, never a Record. A field is required unless it is marked
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
 * Records, Mappings and evidence keep meaning exactly what they meant.
 *
 * Decided, not built yet (no deprecation exists here):
 *   - A deprecated version may still be referenced by a new version, deliberately and with a
 *     warning, never by default. The rule is the same whoever owns the deprecated version: the
 *     referencing workspace's own, another's it may see, or Orbit's.
 *   - Archival is deferred: no archived state, and no rule for it, until it's needed.
 *
 * Names. A version's name (DefinitionVersion.name) is the name it was published with, frozen with
 * it: a later rename never changes it. Whatever a catalogue keeps beside the versions (a current
 * name, a description, an appearance) is metadata for people, mutable, and never part of a version.
 * Words about a historical version should use its own publication-time name. What is guaranteed
 * today: each version's name is frozen with it (renaming in the Studio changes only its catalogue
 * metadata), and the playground's and Designer's words for their own sample and applied versions
 * use those versions' own names. Not yet: the Studio labels a reference with the Definition's
 * current catalogue name, and the Designer labels a Definition handed over from the Studio with the
 * name it had when handed over. Evidence records identities and versions only, never names, so no
 * history needs rewriting: only the words made from it. The order of fields is
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
 *   - References are enforced here when they are resolved: by exact identity, by owner, without
 *     cycles, within the depth limit (checkFields, checkContract), against whatever resolver the
 *     caller supplies. What only persistence can guarantee: that every referenced version stays
 *     resolvable for as long as anything references it (deprecating or archiving must not remove
 *     it, and a workspace's versions can't disappear while its own versions reference them); that a
 *     version is stored only if its references resolved at that moment, atomically with the check,
 *     so no reference ever points at nothing; that Orbit-provided versions are never stored with a
 *     dependency on a workspace's; and that resolution is by exact identity only, with no "latest"
 *     lookup anywhere on the path. Until then, references are only as durable as the in-memory lists
 *     a caller resolves against.
 */

/** The types of a value property: text, a number, or yes/no. */
export type FieldType = 'string' | 'number' | 'boolean'
/** What a property's value must be: a scalar, or an object (a local object's or a referenced Definition's). */
export type ValueType = FieldType | 'object'
/** Every type a property can have: a value, a local object, or a reference to a Definition version. */
export type PropertyType = FieldType | 'object' | 'reference'
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

/**
 * A Definition reference: a property whose value is an object described by another published
 * Definition version, pinned exactly (its id and version; never "the latest"). It describes the
 * structure of a nested value, nothing more: it doesn't refer to a Record, create one or relate
 * Records. The referenced version stays its own: it is never copied into the referencing version,
 * and a newer version of it changes nothing here. Which version is referenced is part of the
 * contract, so changing it means a new version. Only the identity is held: a reference never
 * carries a name or appearance, and two Definitions that look alike are still different references.
 * A reference is never the same contract as a local object, even one with the same properties.
 */
export interface ReferenceField {
  readonly name: string
  readonly type: 'reference'
  readonly optional?: true
  /** Exactly the version referenced: { id, version } and nothing else. */
  readonly definition: DefinitionRef
}

export type Field = ScalarField | ObjectField | ReferenceField

export const isOptional = (field: Pick<Field, 'optional'>) => field.optional === true
export const isObjectField = (field: Field): field is ObjectField => field.type === 'object'
export const isScalarField = (field: Field): field is ScalarField => field.type !== 'object' && field.type !== 'reference'
/** What a property's value must be: a reference's value is an object, like a local object's. */
export const valueTypeOf = (field: Field): ValueType => (field.type === 'reference' ? 'object' : field.type)

/**
 * How deeply local objects may nest, in object levels. The data itself is level 1; each local object
 * is one level deeper than the object containing it (the object at path ['contact'] is level 2, at
 * ['contact', 'address'] level 3). At most 16 levels: the deepest local object has a path of 15
 * names, and the longest property path has 16. A Definition deeper than this is refused when it is
 * made, never cut short. Validation follows the Definition, never the data, so it never goes deeper
 * than the Definition it checks against, and refuses one deeper than this.
 *
 * References count the same way, across the complete resolved structure: a referenced Definition's
 * data is one level deeper than the object containing the reference, like a local object, and its
 * own levels count on from there, through every reference it makes in turn. Process (level 1) with a
 * reference candidate puts Candidate's data at level 2; a local object inside Candidate is level 3.
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

/**
 * How references are resolved: exactly the version named, or null. Supplied by whoever holds
 * versions (the boundary's catalog today, persistence later), never the Studio's own state and never
 * "the latest". An answer that isn't exactly the version asked for counts as no answer: nothing ever
 * falls back to another Definition or another version.
 */
export type Resolve = (ref: DefinitionRef) => DefinitionVersion | null

/**
 * Who may depend on whom. A workspace's version may reference its own workspace's versions and
 * Orbit-provided ones; an Orbit-provided version only Orbit-provided ones; nothing references
 * another workspace's versions. Ownership is the referencing version's, at every step, so a
 * workspace can never reach another's versions through a chain of references.
 */
export const mayReference = (owner: string | null, referenced: { workspaceId: string | null }) =>
  referenced.workspaceId === null || (owner !== null && referenced.workspaceId === owner)

/** The version a reference names, if it resolves exactly here and `owner` may depend on it. */
export function resolveReference(ref: DefinitionRef, owner: string | null, resolve?: Resolve): { readonly version: DefinitionVersion } | { readonly problem: 'unresolved_reference' | 'unavailable_reference' } {
  const found = resolve?.(refOf(ref)) ?? null
  if (!found || !sameDefinition(found, ref)) return { problem: 'unresolved_reference' }
  if (!mayReference(owner, found)) return { problem: 'unavailable_reference' }
  return { version: found }
}

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
 *
 * Known limits of the case comparison (accepted: they only ever refuse more names, never fewer, and
 * only when a version is made). It uses JavaScript's locale-independent upper- then lower-casing,
 * not Unicode case folding (CaseFolding.txt) or any language's rules:
 *   - "ß" and "SS" (and "ss") count as differing only by case: upper-casing "ß" gives "SS".
 *   - Turkish dotless "ı" and "i" count as differing only by case (both upper-case to "I"), and so
 *     do "İ" and "i̇" (i with a combining dot); a Turkish speaker would call these different letters.
 *   - Some letters with several case forms, such as Greek final "ς" and "σ", meet in the same way.
 *   - Ligatures that upper-case to several letters meet too: "ﬁ" (one character) and "fi" count as
 *     differing only by case (both upper-case to "FI").
 *   - Compatibility characters otherwise aren't equivalent: a full-width "Ａ" and "A" are different
 *     names (NFC, not NFKC). Only canonical equivalence and case count.
 *   - The comparison depends on the Unicode version of the JavaScript engine; a newer one may know
 *     case pairs an older one didn't. A version once made is never re-judged, so this can't change it.
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
 * Why some properties can't be (or no longer resolve as) a Definition version. Each issue's path is
 * the property it is about; inside a referenced version, the path runs on across the reference.
 *   too_deep               the complete resolved structure goes below level MAX_OBJECT_LEVELS; level
 *                          is the deepest level it would reach
 *   malformed              not a property Orbit knows: an unknown type, a value property with
 *                          properties of its own, an object without them, a reference that isn't
 *                          exactly { id, version }, or anything more (such as an identity on a local
 *                          object, which has none)
 *   unresolved_reference   no such version where it is resolved (a missing identity or version alike)
 *   unavailable_reference  it exists, but this version may not depend on it (mayReference)
 *   cyclic_reference       it leads back to a version that contains it, so the contract has no end
 */
export type DefinitionIssue =
  | NamingIssue
  | { readonly problem: 'too_deep'; readonly path: PropertyPath; readonly level: number }
  | { readonly problem: 'malformed'; readonly path: PropertyPath }
  | { readonly problem: 'unresolved_reference' | 'unavailable_reference' | 'cyclic_reference'; readonly path: PropertyPath; readonly definition: DefinitionRef }

const SCALAR_TYPES: readonly string[] = ['string', 'number', 'boolean'] satisfies FieldType[]
const KEYS = {
  scalar: new Set(['name', 'type', 'optional']),
  object: new Set(['name', 'type', 'optional', 'fields']),
  reference: new Set(['name', 'type', 'optional', 'definition']),
}
const only = (value: object, keys: Set<string>) => Object.keys(value).every((key) => keys.has(key))
/** Exactly an identity and a version: { id, version }, nothing else (no name, no structure). */
const isExactRef = (ref: unknown): ref is DefinitionRef =>
  !!ref && typeof ref === 'object' && !Array.isArray(ref) && only(ref, new Set(['id', 'version']))
  && typeof (ref as DefinitionRef).id === 'string' && (ref as DefinitionRef).id !== ''
  && Number.isInteger((ref as DefinitionRef).version) && (ref as DefinitionRef).version >= 1
function wellFormed(field: Field): boolean {
  if (!field || typeof field !== 'object') return false
  if (field.type === 'object') return only(field, KEYS.object) && Array.isArray(field.fields)
  if (field.type === 'reference') return only(field, KEYS.reference) && isExactRef(field.definition)
  return SCALAR_TYPES.includes(field.type) && only(field, KEYS.scalar)
}

/** What checkFields checks against. */
export interface ContractContext {
  /** The workspace owning the version these properties belong to; null when Orbit provides it. */
  readonly owner: string | null
  /** Resolves references. Without one, no reference resolves. */
  readonly resolve?: Resolve
  /** The version these properties are, when it has an identity: a reference back to it is a cycle. */
  readonly self?: DefinitionRef
  /** Apply the naming rule (making a version: the default) or not (resolving one already made). */
  readonly naming?: boolean
}

/**
 * Every reason these properties (a Definition's, at level 1) can't be a version, judged as the
 * complete resolved contract: each object's names (the naming rule, unless context.naming is
 * false), each property's shape, every reference resolved exactly and allowed for its owner, no
 * cycles, and the depth limit across local objects and references together. None: they can.
 *
 * Each referenced version is checked once, however often it is referenced (so shared dependencies
 * cost nothing extra), and a reference back to a version already being checked is a cycle. Cycles
 * are about exact versions: Process v2 may reference Process v1 (a different, finite contract);
 * only a version that leads back to itself is refused. The naming rule isn't reapplied inside a
 * referenced version: it was applied when that version was made, and a reference never re-judges it.
 */
export function checkFields(fields: readonly Field[], context: ContractContext = { owner: null }): DefinitionIssue[] {
  const key = (ref: DefinitionRef) => JSON.stringify([ref.id, ref.version])
  const visiting = new Set<string>(context.self ? [key(context.self)] : [])
  const checked = new Map<string, { issues: DefinitionIssue[]; levels: number }>()

  /** One object's properties at `level`: their issues, and how many object levels they span (1: none nested). */
  const visit = (list: readonly Field[], owner: string | null, at: PropertyPath, level: number, naming: boolean) => {
    const issues: DefinitionIssue[] = []
    let levels = 1
    if (naming) issues.push(...checkPropertyNames(list.map((f) => f.name), at))
    for (const field of list) {
      const path = [...at, field.name]
      if (!wellFormed(field)) {
        issues.push({ problem: 'malformed', path })
      } else if (field.type === 'object') {
        if (level + 1 > MAX_OBJECT_LEVELS) {
          issues.push({ problem: 'too_deep', path, level: level + 1 })
          levels = Math.max(levels, MAX_OBJECT_LEVELS + 1)
        } else {
          const inner = visit(field.fields, owner, path, level + 1, naming)
          issues.push(...inner.issues)
          levels = Math.max(levels, inner.levels + 1)
        }
      } else if (field.type === 'reference') {
        const definition = refOf(field.definition)
        const resolved = resolveReference(definition, owner, context.resolve)
        if ('problem' in resolved) {
          issues.push({ problem: resolved.problem, path, definition })
          continue
        }
        const k = key(definition)
        if (visiting.has(k)) {
          issues.push({ problem: 'cyclic_reference', path, definition })
          continue
        }
        let summary = checked.get(k)
        if (!summary) {
          visiting.add(k)
          summary = Array.isArray(resolved.version.fields)
            ? visit(resolved.version.fields, resolved.version.workspaceId, [], 1, false)
            : { issues: [{ problem: 'malformed', path: [] }], levels: 1 }
          visiting.delete(k)
          checked.set(k, summary)
        }
        // The referenced version's own issues, located from here (its levels counted from here too).
        issues.push(...summary.issues.map((i): DefinitionIssue => (i.problem === 'too_deep' ? { ...i, path: [...path, ...i.path], level: i.level + level } : { ...i, path: [...path, ...i.path] })))
        const reaches = level + summary.levels
        if (reaches > MAX_OBJECT_LEVELS && !summary.issues.some((i) => i.problem === 'too_deep')) issues.push({ problem: 'too_deep', path, level: reaches })
        levels = Math.max(levels, summary.levels + 1)
      }
    }
    return { issues, levels }
  }
  return visit(fields, context.owner, [], 1, context.naming ?? true).issues
}

/**
 * Whether a version already made resolves here as a whole contract: every reference exactly, each
 * allowed for its owner, no cycles, within the depth limit. What the boundary asks before using a
 * Definition. The naming rule isn't reapplied: it governs making versions, not reading them.
 */
export const checkContract = (definition: DefinitionVersion, resolve?: Resolve): DefinitionIssue[] =>
  checkFields(definition.fields, { owner: definition.workspaceId, resolve, self: refOf(definition), naming: false })

/**
 * The canonical form: required is the default and is never written down, so a value property is
 * { name, type } or { name, type, optional: true }; a local object has its `fields` too, and a
 * reference its `definition`, exactly { id, version }. Two versions that mean the same thing look
 * the same. Only for fields checkFields accepted.
 */
const canonicalFields = (fields: readonly Field[]): Field[] => fields.map((f): Field => {
  const base = { name: f.name, ...(f.optional === true ? { optional: true as const } : {}) }
  if (f.type === 'object') return { ...base, type: 'object', fields: canonicalFields(f.fields) }
  if (f.type === 'reference') return { ...base, type: 'reference', definition: refOf(f.definition) }
  return { ...base, type: f.type }
})

/**
 * A new, immutable Definition version, frozen all the way down, local objects and references
 * included. Refused, never tidied, cut short or flattened, when checkFields finds anything wrong.
 * References are resolved with `resolve`, as the version's own workspace sees them: without a
 * resolver, a version with a reference can't be made. A reference is kept as a reference (only the
 * exact { id, version }), never copied into the version as an anonymous local object.
 */
export function defineVersion(definition: DefinitionVersion, resolve?: Resolve): DefinitionVersion {
  const issues = checkFields(definition.fields, { owner: definition.workspaceId, resolve, self: refOf(definition) })
  if (issues.length) {
    throw new Error(`Definition ${definition.id}@${definition.version} can’t be made (${issues.map((i) => `${i.problem} at ${propertyPathWords(i.path)}`).join('; ')})`)
  }
  return frozenCopy({ ...definition, fields: canonicalFields(definition.fields) })
}

/** The paths of every local object in these properties, outermost first (references aren't followed). */
export function localObjectPaths(fields: readonly Field[], at: PropertyPath = []): PropertyPath[] {
  return fields.flatMap((f) => (f.type === 'object' ? [[...at, f.name], ...localObjectPaths(f.fields, [...at, f.name])] : []))
}

/** The paths of every reference in these properties, including inside local objects (not resolved). */
export function referencePaths(fields: readonly Field[], at: PropertyPath = []): PropertyPath[] {
  return fields.flatMap((f) => (f.type === 'reference' ? [[...at, f.name]] : f.type === 'object' ? referencePaths(f.fields, [...at, f.name]) : []))
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
  | { readonly problem: 'missing'; readonly path: PropertyPath; readonly expected: ValueType }
  | { readonly problem: 'unexpected'; readonly path: PropertyPath }
  | { readonly problem: 'wrong_type'; readonly path: PropertyPath; readonly expected: ValueType; readonly actual: Kind }

/**
 * Whether `data` satisfies `definition` exactly. Returns every problem found; none means valid.
 * One validator at every level: a local object is checked by the same rules as the data itself.
 *   - A required property must be there; an optional one may be absent. An absent optional object
 *     requires nothing inside it. A present one must satisfy its own properties, all of them.
 *   - Null is never absence: it is a value of the wrong type (for an object too).
 *   - Nothing unexpected, at any level.
 * Validation follows the Definition: it looks inside a value only where the Definition has a local
 * object or a reference, so data nested deeper than its Definition is a wrong type where the
 * Definition ends, and an unexpected property is reported as one, whatever it holds. Nothing is
 * skipped or cut short.
 *
 * A reference is validated by the same validator against exactly the referenced version, resolved
 * by `resolve`; paths run straight across the boundary (['candidate', 'email']). A contract that
 * doesn't resolve isn't a data problem, so it isn't reported as one: check the contract first
 * (checkContract, as the boundary does). Validating against one that doesn't resolve throws.
 */
export function validate(definition: DefinitionVersion, data: unknown, resolve?: Resolve): Issue[] {
  const kind = kindOf(data)
  if (kind !== 'object') return [{ problem: 'not_an_object', path: [], actual: kind }]
  const issues: Issue[] = []
  validateObject(definition.fields, data as Record<string, unknown>, [], 1, definition.workspaceId, resolve, issues)
  return issues
}

function validateObject(fields: readonly Field[], object: Record<string, unknown>, at: PropertyPath, level: number, owner: string | null, resolve: Resolve | undefined, issues: Issue[]): void {
  // Only a contract checkFields refused could be this deep (a cycle included): refuse it here too, never guess.
  if (level > MAX_OBJECT_LEVELS) throw new Error(`A Definition can’t have more than ${MAX_OBJECT_LEVELS} object levels`)
  for (const field of fields) {
    const path = [...at, field.name]
    if (!Object.hasOwn(object, field.name)) {
      if (field.optional !== true) issues.push({ problem: 'missing', path, expected: valueTypeOf(field) })
      continue
    }
    const actual = kindOf(object[field.name])
    const value = object[field.name] as Record<string, unknown>
    if (actual !== valueTypeOf(field)) issues.push({ problem: 'wrong_type', path, expected: valueTypeOf(field), actual })
    else if (field.type === 'object') validateObject(field.fields, value, path, level + 1, owner, resolve, issues)
    else if (field.type === 'reference') {
      const resolved = resolveReference(field.definition, owner, resolve)
      if ('problem' in resolved) throw new Error(`The reference at ${propertyPathWords(path)} doesn’t resolve here (${resolved.problem}): check the contract before validating`)
      validateObject(resolved.version.fields, value, path, level + 1, resolved.version.workspaceId, resolve, issues)
    }
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
 * and the same requiredness, each local object with the same contract inside it, and each reference
 * to exactly the same Definition version (identity, not structure: a reference is never the same as
 * a local object, or as a reference to another Definition that looks alike). Order is
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
    if (f.type === 'object') return sameFields(f.fields, (other as ObjectField).fields)
    if (f.type === 'reference') return sameDefinition(f.definition, (other as ReferenceField).definition)
    return true
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
