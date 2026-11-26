import {
  type DefinitionRef, type DefinitionVersion, type Data, type Field, type FieldType, type PropertyPath, type Resolve, type Scalar,
  MAX_OBJECT_LEVELS, deepFreeze, frozenCopy, kindOf, resolveReference, sameData,
} from './definitions'

/**
 * Mappings: how Orbit.Transform builds one object from another.
 *
 * A Mapping is a list of output properties, each with a name and a source. A source is a small,
 * closed expression tree: a literal, a property of the incoming value, or a call to one of a
 * fixed set of functions. It is data, never code: nothing is parsed from text and nothing is
 * evaluated as JavaScript. Adding a function means adding one entry to FUNCTIONS (its parameter
 * types, its result type and what it does); the tree, the checks and the Transform Feature stay
 * as they are.
 *
 * A Mapping belongs to a workspace, names exact input and output Definition versions, and is
 * immutable once made: changing it makes a new version (reviseMapping). The order of its output
 * properties is presentation, like the order of a Definition's properties: each is built
 * independently of the others, so reordering them never makes a version (sameMappingProperties).
 * Order inside a source is meaning: a function's arguments and a list's items stay in order.
 *
 * Absence. An optional input property may be absent, and nothing here invents a value for it: a
 * source that reads an absent property has no value at all, so its output property is left out
 * (evaluatePresent). That is only allowed where the output property is optional too: a required
 * output fed by a source that may be absent is refused before anything runs (may_be_absent),
 * because Orbit can't promise a value it might not have. There is no fallback in the language yet.
 * This is Orbit.Transform v2's behaviour; v1 predates optional properties and refuses such sources
 * (absence_unsupported), keeping exactly the behaviour it was published with.
 *
 * Local objects and references. A source reads only top-level value properties: never a local object
 * or a referenced Definition, and nothing inside one (object_property). Nested reads and nested
 * output are future work, for a later Transform version. Decided for it, not built:
 *   - A whole value may be copied only between references to exactly the same Definition identity
 *     and version. Between different identities or versions it isn't supported, however alike they
 *     look; building the target property by property, explicitly, stays possible.
 *   - Copying a whole local object is deferred, not ruled out: an explicit structural transformation
 *     may come later, but no local object is ever given an identity of its own to make it possible.
 *   - An object is never left out automatically because it ended up empty: absent, empty ({}) and
 *     incomplete stay distinct, exactly as the validator tells them apart.
 *   - Open, for building objects (4.3): when an optional output object is built only while an
 *     optional source object is present, the source object's required properties may be guaranteed
 *     available within that condition. Its semantics are to be established before it is accepted
 *     or refused.
 *
 * Nested reads (Transform v3, provisional). A source may read a value inside a local object or a
 * referenced Definition by its structured path: { kind: 'path', path: ['contact', 'email'] }. A
 * path is a list of exact property names, at least two (a top-level read is a 'property' source, so
 * each read has one way to be written). Names are matched exactly, case included, and never split,
 * trimmed or corrected: a property literally named "a.b" is ['a.b'], never ['a', 'b']. The path is
 * resolved through the input contract (local objects, and references resolved exactly with the
 * domain's resolver) and must end at a value: reading a whole object as a value stays unsupported.
 * Absence follows the contract, never example data: a nested read may be absent when any property
 * along its path is optional (the leaf, or any parent), and then v2's rule applies unchanged (an
 * optional output is left out; a required one fed that way is refused before running). Only the
 * Feature versions that declare nested sources (MappingFeature['sources']) check them; the others
 * refuse a path source like any source they don't have (unsupported_source), and their problems keep
 * their Path. Problems checked for nested sources are located by MappingProblemLocation.
 *
 * The source language is closed. A source of any other kind (one a later Transform version may
 * understand, or something malformed) is refused before anything runs (unsupported_source), never
 * guessed at and never evaluated: a version only runs what it was published to run. Sources of the
 * kinds below, well formed, mean exactly what they always meant.
 */

export type Expression =
  | { readonly kind: 'literal'; readonly value: Scalar }
  | { readonly kind: 'property'; readonly name: string }
  | { readonly kind: 'call'; readonly fn: string; readonly args: readonly Argument[] }
  /** A value inside a local object or a referenced Definition: exact names, at least two (Transform v3). */
  | { readonly kind: 'path'; readonly path: PropertyPath }

/** A function's argument: one expression, or a list of them where the function takes a list. */
export type Argument = Expression | { readonly kind: 'list'; readonly items: readonly Expression[] }

/** What an argument can be: one value of a field type, or a list of strings. */
export type ArgumentType = FieldType | 'string[]'

interface FunctionSpec {
  readonly params: readonly ArgumentType[]
  readonly returns: FieldType
  readonly apply: (args: readonly unknown[]) => Scalar
}

/** The functions a source may call. The only place their behaviour is defined. */
export const FUNCTIONS = {
  /** Removes whitespace from both ends. */
  trim: { params: ['string'], returns: 'string', apply: ([text]) => (text as string).trim() },
  /** Joins strings, with `separator` between each two. */
  join: { params: ['string[]', 'string'], returns: 'string', apply: ([items, separator]) => (items as string[]).join(separator as string) },
} as const satisfies Record<string, FunctionSpec>

export type FunctionName = keyof typeof FUNCTIONS
const functionSpec = (fn: string): FunctionSpec | null => (Object.hasOwn(FUNCTIONS, fn) ? FUNCTIONS[fn as FunctionName] : null)

export interface MappingProperty {
  readonly name: string
  readonly source: Expression
}

export interface Mapping {
  readonly id: string
  readonly version: number
  readonly workspaceId: string
  readonly from: DefinitionRef
  readonly to: DefinitionRef
  readonly properties: readonly MappingProperty[]
}

/** Where in a Mapping a problem is: the property, then each step into its source. */
export type Path = readonly (string | number)[]

/**
 * A problem with a Mapping itself, found before anything runs. Like data issues, these name
 * properties, functions and types, never the data a Mapping would be applied to.
 */
export type MappingIssue =
  | { readonly problem: 'empty_name'; readonly path: Path }
  | { readonly problem: 'duplicate_name'; readonly path: Path }
  | { readonly problem: 'unknown_property'; readonly path: Path; readonly name: string }
  | { readonly problem: 'unknown_function'; readonly path: Path; readonly fn: string }
  | { readonly problem: 'argument_count'; readonly path: Path; readonly fn: string; readonly expected: number; readonly actual: number }
  | { readonly problem: 'argument_type'; readonly path: Path; readonly fn: string; readonly expected: ArgumentType; readonly actual: ArgumentType | 'invalid' }
  | { readonly problem: 'list_item_type'; readonly path: Path; readonly expected: 'string'; readonly actual: ArgumentType }
  | { readonly problem: 'list_not_allowed'; readonly path: Path }
  | { readonly problem: 'invalid_literal'; readonly path: Path }
  /** The source reads an optional input property, so it may have no value, but the output property is required. */
  | { readonly problem: 'may_be_absent'; readonly path: Path; readonly optional: readonly string[] }
  /** The source reads a local object or a referenced Definition as if it were a value. Sources read text, numbers and yes/no only; there are no nested reads. */
  | { readonly problem: 'object_property'; readonly path: Path; readonly name: string }
  /** The source reads an optional input property, and the Feature version applying it has no behaviour for absence. */
  | { readonly problem: 'absence_unsupported'; readonly path: Path; readonly optional: readonly string[] }
  /**
   * Not a source this language has (an unknown kind, or a known kind that isn't well formed). Says
   * where, never what it held: it may be anything.
   */
  | { readonly problem: 'unsupported_source'; readonly path: Path }

/**
 * Where a problem in a nested Mapping is (for a later Transform version; v1 and v2 use Path): the
 * output property it's about, as a PropertyPath (['contact', 'email']), and where inside that
 * property's source, as steps into the expression (function names and argument or item positions,
 * as Path does after the property today). Two separate lists, never one joined path, so an output
 * property named like a function, or a number, can't be mistaken for a step into its source.
 */
export interface MappingProblemLocation {
  readonly output: PropertyPath
  readonly expression: ExpressionPath
}
/** Steps into a source: a function's name, then an argument's or a list item's position. */
export type ExpressionPath = readonly (string | number)[]

/**
 * A problem as the checker finds it, before it's reported the way the Feature version reports
 * problems: Path for flat versions (MappingIssue), MappingProblemLocation for nested ones.
 */
export type FoundMappingIssue =
  | Exclude<MappingIssue, { readonly problem: 'may_be_absent' | 'absence_unsupported' }>
  /** The optional properties the source depends on, each by its full path (the leaf or a parent). */
  | { readonly problem: 'may_be_absent' | 'absence_unsupported'; readonly path: Path; readonly optional: readonly PropertyPath[] }
  /** A path source that isn't a list of at least two names. */
  | { readonly problem: 'malformed_path'; readonly path: Path }
  /** No property with exactly this name at that step of the path (`step`: its position, from 0). */
  | { readonly problem: 'unknown_path_property'; readonly path: Path; readonly step: number; readonly name: string }
  /** The path goes on past a value, as if it were an object. */
  | { readonly problem: 'path_through_value'; readonly path: Path; readonly step: number }
  /** The path ends at a local object or a referenced Definition: a source reads values only. */
  | { readonly problem: 'path_to_object'; readonly path: Path }
  /** A reference along the path doesn't resolve here (missing, or not allowed). */
  | { readonly problem: 'unresolved_path'; readonly path: Path; readonly step: number }

type Locate<T> = T extends { readonly path: Path } ? { readonly [K in keyof T as K extends 'path' ? never : K]: T[K] } & { readonly at: MappingProblemLocation } : never
/** A problem with a Mapping checked for nested sources (Transform v3): located in two parts. */
export type LocatedMappingIssue = Locate<FoundMappingIssue>
/** A Mapping problem in either representation: Path (flat versions) or located (nested ones). */
export type AnyMappingIssue = MappingIssue | LocatedMappingIssue

/** `reads`: the optional input properties the argument depends on, by full path (absent if any of them is). */
type Checked = { type: ArgumentType | 'invalid'; issues: FoundMappingIssue[]; reads: PropertyPath[] }

/** What a check may accept: nested sources (and how references resolve for them), or flat ones only. */
interface Accepts {
  readonly nested: boolean
  readonly resolve?: Resolve
}

/** Whether something is a source of a kind this language has, with each part of the shape that kind needs. */
function wellFormed(arg: unknown, accepts: Accepts): arg is Argument {
  if (kindOf(arg) !== 'object') return false
  const a = arg as Record<string, unknown>
  switch (a.kind) {
    case 'literal': return Object.hasOwn(a, 'value')
    case 'property': return typeof a.name === 'string'
    case 'list': return Array.isArray(a.items)
    case 'call': return typeof a.fn === 'string' && Array.isArray(a.args)
    // Its shape is checked where it's resolved (malformed_path), so that problem can say so.
    case 'path': return accepts.nested
    default: return false
  }
}

/** One value a source may read, wherever it is in the input contract. */
export interface ReadablePath {
  /** Exact names, outermost first. */
  readonly path: PropertyPath
  readonly type: FieldType
  /** The optional properties along the path (the leaf or any parent), each by its full path: it may be absent if any is. */
  readonly optional: readonly PropertyPath[]
}

type Resolved = { readonly readable: ReadablePath } | { readonly problem: 'malformed_path' | 'path_to_object' } | { readonly problem: 'unknown_path_property' | 'path_through_value' | 'unresolved_path'; readonly step: number }

/**
 * Where a path leads in a contract: a value (its type, and what may make it absent), or why it
 * doesn't. Through local objects, and through references resolved exactly (the containing version's
 * owner decides what it may reference, as everywhere). Names match exactly; nothing is guessed.
 */
export function resolvePath(input: DefinitionVersion, path: unknown, resolve?: Resolve): Resolved {
  if (!Array.isArray(path) || path.length < 2 || path.length > MAX_OBJECT_LEVELS || !path.every((n) => typeof n === 'string')) return { problem: 'malformed_path' }
  let fields: readonly Field[] = input.fields
  let owner = input.workspaceId
  const optional: PropertyPath[] = []
  for (const [step, name] of path.entries()) {
    const field = fields.find((f) => f.name === name)
    if (!field) return { problem: 'unknown_path_property', step }
    if (field.optional === true) optional.push(path.slice(0, step + 1))
    const last = step === path.length - 1
    if (field.type === 'object') {
      if (last) return { problem: 'path_to_object' }
      fields = field.fields
    } else if (field.type === 'reference') {
      if (last) return { problem: 'path_to_object' }
      const found = resolveReference(field.definition, owner, resolve)
      if ('problem' in found) return { problem: 'unresolved_path', step }
      fields = found.version.fields
      owner = found.version.workspaceId
    } else {
      if (!last) return { problem: 'path_through_value', step }
      return { readable: { path: [...path], type: field.type, optional } }
    }
  }
  return { problem: 'malformed_path' }
}

/**
 * Every value a source may read in a contract, depth-first in the contract's order: top-level ones
 * (read as 'property') and nested ones (read as 'path'). A reference that doesn't resolve here
 * offers nothing inside it. For choosing a source; the check is still resolvePath.
 */
export function readablePaths(input: DefinitionVersion, resolve?: Resolve): ReadablePath[] {
  const out: ReadablePath[] = []
  const walk = (fields: readonly Field[], owner: string | null, at: PropertyPath, optional: readonly PropertyPath[], level: number) => {
    if (level > MAX_OBJECT_LEVELS) return
    for (const f of fields) {
      const here = [...at, f.name]
      const absent = f.optional === true ? [...optional, here] : optional
      if (f.type === 'object') walk(f.fields, owner, here, absent, level + 1)
      else if (f.type === 'reference') {
        const found = resolveReference(f.definition, owner, resolve)
        if (!('problem' in found)) walk(found.version.fields, found.version.workspaceId, here, absent, level + 1)
      } else out.push({ path: here, type: f.type, optional: absent })
    }
  }
  walk(input.fields, input.workspaceId, [], [], 1)
  return out
}

function checkArgument(arg: Argument, input: DefinitionVersion, path: Path, accepts: Accepts): Checked {
  if (!wellFormed(arg, accepts)) return { type: 'invalid', issues: [{ problem: 'unsupported_source', path }], reads: [] }
  switch (arg.kind) {
    case 'literal': {
      const kind = kindOf(arg.value)
      return kind === 'string' || kind === 'number' || kind === 'boolean'
        ? { type: kind, issues: [], reads: [] }
        : { type: 'invalid', issues: [{ problem: 'invalid_literal', path }], reads: [] }
    }
    case 'property': {
      const field = input.fields.find((f) => f.name === arg.name)
      if (!field) return { type: 'invalid', issues: [{ problem: 'unknown_property', path, name: arg.name }], reads: [] }
      if (field.type === 'object' || field.type === 'reference') return { type: 'invalid', issues: [{ problem: 'object_property', path, name: arg.name }], reads: [] }
      return { type: field.type, issues: [], reads: field.optional === true ? [[field.name]] : [] }
    }
    case 'path': {
      const found = resolvePath(input, arg.path, accepts.resolve)
      if ('readable' in found) return { type: found.readable.type, issues: [], reads: [...found.readable.optional] }
      const issue: FoundMappingIssue = !('step' in found)
        ? { problem: found.problem, path }
        : found.problem === 'unknown_path_property'
          ? { problem: 'unknown_path_property', path, step: found.step, name: arg.path[found.step]! }
          : { problem: found.problem, path, step: found.step }
      return { type: 'invalid', issues: [issue], reads: [] }
    }
    case 'list': {
      const items = arg.items.map((item, i) => checkArgument(item, input, [...path, i], accepts))
      const issues = items.flatMap((c) => c.issues)
      for (const [i, c] of items.entries()) {
        if (c.type !== 'invalid' && c.type !== 'string') issues.push({ problem: 'list_item_type', path: [...path, i], expected: 'string', actual: c.type })
      }
      return { type: issues.length ? 'invalid' : 'string[]', issues, reads: items.flatMap((c) => c.reads) }
    }
    case 'call': {
      const spec = functionSpec(arg.fn)
      if (!spec) return { type: 'invalid', issues: [{ problem: 'unknown_function', path, fn: arg.fn }], reads: [] }
      const here = [...path, arg.fn]
      if (arg.args.length !== spec.params.length) {
        return { type: 'invalid', issues: [{ problem: 'argument_count', path: here, fn: arg.fn, expected: spec.params.length, actual: arg.args.length }], reads: [] }
      }
      const issues: FoundMappingIssue[] = []
      const reads: PropertyPath[] = []
      for (const [i, a] of arg.args.entries()) {
        const c = checkArgument(a, input, [...here, i], accepts)
        issues.push(...c.issues)
        reads.push(...c.reads)
        if (c.type !== 'invalid' && c.type !== spec.params[i]) issues.push({ problem: 'argument_type', path: [...here, i], fn: arg.fn, expected: spec.params[i]!, actual: c.type })
      }
      return { type: issues.length ? 'invalid' : spec.returns, issues, reads }
    }
  }
}

/** Checks one property's source: its type (or why it has none) and the optional input it reads. */
function checkSource(source: Expression, input: DefinitionVersion, path: Path, accepts: Accepts): { type: FieldType | null; issues: FoundMappingIssue[]; reads: PropertyPath[] } {
  const c = checkArgument(source, input, path, accepts)
  const reads = [...new Map(c.reads.map((r) => [JSON.stringify(r), r])).values()]
  if (c.type === 'string[]') return { type: null, issues: [...c.issues, { problem: 'list_not_allowed', path }], reads }
  return { type: c.type === 'invalid' ? null : c.type, issues: c.issues, reads }
}

/**
 * Whether a Mapping can be applied to values of `input`, the type each property will have, and
 * which may be absent (`absent`: the optional input properties each one reads). Checked before
 * Transform runs. Given the `output` Definition, a required output property that may be absent is
 * refused too. `absence` is what the Feature version applying it does with an absent input
 * (MappingFeature['absence']): one without behaviour for it ('unsupported') can't take a source
 * that reads an optional property at all. Whether the result satisfies the target is a separate
 * question, answered by validating the output (the boundary never trusts a Feature's result).
 */
export function checkMapping(mapping: Pick<Mapping, 'properties'>, input: DefinitionVersion, output?: DefinitionVersion, absence: 'unsupported' | 'omitted' = 'omitted') {
  const { found, types, absent } = checkProperties(mapping, input, output, absence, { nested: false })
  // Flat sources read top-level properties only, so each optional one is named as it always was.
  const issues = found.map(({ issue }) => ('optional' in issue ? { ...issue, optional: issue.optional.map((p) => p[0]!) } : issue) as MappingIssue)
  return { issues, types, absent: absent.map((reads) => reads.map((p) => p[0]!)) }
}

/**
 * checkMapping for a Feature version that reads nested sources (Transform v3): paths resolved
 * through the input contract with `resolve`, absence through every optional property along them,
 * problems located in two parts (the output property, and the place in its source).
 */
export function checkNestedMapping(mapping: Pick<Mapping, 'properties'>, input: DefinitionVersion, output: DefinitionVersion | undefined, options: { absence?: 'unsupported' | 'omitted'; resolve?: Resolve } = {}) {
  const { found, types, absent } = checkProperties(mapping, input, output, options.absence ?? 'omitted', { nested: true, resolve: options.resolve })
  const issues = found.map(({ name, issue }): LocatedMappingIssue => {
    const { path, ...rest } = issue
    return { ...rest, at: { output: [name], expression: path.slice(1) } } as LocatedMappingIssue
  })
  return { issues, types, absent }
}

function checkProperties(mapping: Pick<Mapping, 'properties'>, input: DefinitionVersion, output: DefinitionVersion | undefined, absence: 'unsupported' | 'omitted', accepts: Accepts) {
  const found: { name: string; issue: FoundMappingIssue }[] = []
  const types: (FieldType | null)[] = []
  const absent: PropertyPath[][] = []
  const seen = new Set<string>()
  for (const [i, { name, source }] of mapping.properties.entries()) {
    const path = [name || i]
    const add = (issue: FoundMappingIssue) => found.push({ name, issue })
    if (!name) add({ problem: 'empty_name', path })
    else if (seen.has(name)) add({ problem: 'duplicate_name', path })
    seen.add(name)
    const checked = checkSource(source, input, path, accepts)
    checked.issues.forEach(add)
    types.push(checked.type)
    absent.push(checked.reads)
    const target = output?.fields.find((f) => f.name === name)
    if (checked.reads.length && absence === 'unsupported') add({ problem: 'absence_unsupported', path, optional: checked.reads })
    else if (checked.reads.length && target && target.optional !== true) add({ problem: 'may_be_absent', path, optional: checked.reads })
  }
  return { found, types, absent }
}

function evaluateArgument(arg: Argument, input: Data): Scalar | Scalar[] {
  switch (arg.kind) {
    case 'literal':
      return arg.value
    case 'property':
      if (!Object.hasOwn(input, arg.name)) throw new Error('A source refers to a property the value does not have')
      // checkMapping lets a source read only value properties (never a local object: object_property).
      return input[arg.name] as Scalar
    case 'path': {
      const found = valueAt(input, arg.path)
      if (!found.present) throw new Error('A source refers to a property the value does not have')
      return found.value as Scalar
    }
    case 'list':
      return arg.items.map((item) => evaluateArgument(item, input) as Scalar)
    case 'call': {
      const spec = functionSpec(arg.fn)
      if (!spec) throw new Error('A source calls a function Orbit does not have')
      return spec.apply(arg.args.map((a) => evaluateArgument(a, input)))
    }
  }
}

/** A property's value for `input`. Only for Mappings checkMapping found sound, and complete input. */
export const evaluate = (source: Expression, input: Data): Scalar => evaluateArgument(source, input) as Scalar

/** Every input property a source reads, by full path, wherever it is in the tree. */
function propertiesRead(arg: Argument): PropertyPath[] {
  switch (arg.kind) {
    case 'literal': return []
    case 'property': return [[arg.name]]
    case 'path': return [arg.path]
    case 'list': return arg.items.flatMap(propertiesRead)
    case 'call': return arg.args.flatMap(propertiesRead)
  }
}

/**
 * The value at a path in some (validated) data, or that it isn't there: a property absent at any
 * step means absent. Only a missing property is absence: anything else where an object should be
 * (null included) means the data doesn't fit its contract, so it is refused, never read as absent.
 */
function valueAt(data: Data, path: PropertyPath): { readonly present: true; readonly value: unknown } | { readonly present: false } {
  let here: unknown = data
  for (const name of path) {
    if (kindOf(here) !== 'object') throw new Error('A source reads through something that isn’t an object')
    if (!Object.hasOwn(here as object, name)) return { present: false }
    here = (here as Record<string, unknown>)[name]
  }
  return { present: true, value: here }
}

/**
 * A property's value for `input`, or none when the source reads a property the input doesn't have
 * (an optional one, left out). Nothing is substituted: no empty text, zero, false or null.
 */
export function evaluatePresent(source: Expression, input: Data): { readonly present: true; readonly value: Scalar } | { readonly present: false } {
  if (propertiesRead(source).some((path) => !valueAt(input, path).present)) return { present: false }
  return { present: true, value: evaluate(source, input) }
}

/**
 * Whether two lists of output properties say the same thing: each name built from exactly the same
 * source. Their order is ignored (presentation); everything inside a source is compared exactly,
 * argument order and list order included. Lists with a repeated name (which checkMapping refuses)
 * are only the same when identical, in order: nothing is guessed about which is which.
 */
export function sameMappingProperties(a: readonly MappingProperty[], b: readonly MappingProperty[]): boolean {
  if (a.length !== b.length) return false
  const byName = new Map(b.map((p) => [p.name, p]))
  if (byName.size !== b.length || new Set(a.map((p) => p.name)).size !== a.length) return sameData(a, b)
  return a.every((p) => byName.has(p.name) && sameData(p.source, byName.get(p.name)!.source))
}

/** A Mapping's next version: same identity and contracts, new properties, frozen. */
export function reviseMapping(previous: Mapping, properties: readonly MappingProperty[]): Mapping {
  return deepFreeze({ ...previous, version: previous.version + 1, properties: frozenCopy(properties) })
}

/** A compact, read-only rendering of a source, e.g. join([trim(firstName), " ", lastName], ""). */
export function formatSource(arg: Argument): string {
  switch (arg.kind) {
    case 'literal':
      return JSON.stringify(arg.value) ?? String(arg.value)
    case 'property':
      return arg.name || '?'
    case 'list':
      return `[${arg.items.map(formatSource).join(', ')}]`
    case 'call':
      return `${arg.fn}(${arg.args.map(formatSource).join(', ')})`
    case 'path':
      return arg.path.join(' › ')
    default:
      return '?'
  }
}
