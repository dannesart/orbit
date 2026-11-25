import { type DefinitionRef, type DefinitionVersion, type Data, type FieldType, type Scalar, deepFreeze, frozenCopy, kindOf, sameData } from './definitions'

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
 * output are future work.
 */

export type Expression =
  | { readonly kind: 'literal'; readonly value: Scalar }
  | { readonly kind: 'property'; readonly name: string }
  | { readonly kind: 'call'; readonly fn: string; readonly args: readonly Argument[] }

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

/** `reads`: the optional input properties the argument depends on (absent if any of them is). */
type Checked = { type: ArgumentType | 'invalid'; issues: MappingIssue[]; reads: string[] }

function checkArgument(arg: Argument, input: DefinitionVersion, path: Path): Checked {
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
      return { type: field.type, issues: [], reads: field.optional === true ? [field.name] : [] }
    }
    case 'list': {
      const items = arg.items.map((item, i) => checkArgument(item, input, [...path, i]))
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
      const issues: MappingIssue[] = []
      const reads: string[] = []
      for (const [i, a] of arg.args.entries()) {
        const c = checkArgument(a, input, [...here, i])
        issues.push(...c.issues)
        reads.push(...c.reads)
        if (c.type !== 'invalid' && c.type !== spec.params[i]) issues.push({ problem: 'argument_type', path: [...here, i], fn: arg.fn, expected: spec.params[i]!, actual: c.type })
      }
      return { type: issues.length ? 'invalid' : spec.returns, issues, reads }
    }
  }
}

/** Checks one property's source: its type (or why it has none) and the optional input it reads. */
function checkSource(source: Expression, input: DefinitionVersion, path: Path): { type: FieldType | null; issues: MappingIssue[]; reads: string[] } {
  const c = checkArgument(source, input, path)
  const reads = [...new Set(c.reads)]
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
  const issues: MappingIssue[] = []
  const types: (FieldType | null)[] = []
  const absent: string[][] = []
  const seen = new Set<string>()
  for (const [i, { name, source }] of mapping.properties.entries()) {
    const path = [name || i]
    if (!name) issues.push({ problem: 'empty_name', path })
    else if (seen.has(name)) issues.push({ problem: 'duplicate_name', path })
    seen.add(name)
    const checked = checkSource(source, input, path)
    issues.push(...checked.issues)
    types.push(checked.type)
    absent.push(checked.reads)
    const target = output?.fields.find((f) => f.name === name)
    if (checked.reads.length && absence === 'unsupported') issues.push({ problem: 'absence_unsupported', path, optional: checked.reads })
    else if (checked.reads.length && target && target.optional !== true) issues.push({ problem: 'may_be_absent', path, optional: checked.reads })
  }
  return { issues, types, absent }
}

function evaluateArgument(arg: Argument, input: Data): Scalar | Scalar[] {
  switch (arg.kind) {
    case 'literal':
      return arg.value
    case 'property':
      if (!Object.hasOwn(input, arg.name)) throw new Error('A source refers to a property the value does not have')
      // checkMapping lets a source read only value properties (never a local object: object_property).
      return input[arg.name] as Scalar
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

/** Every input property a source reads, wherever it is in the tree. */
function propertiesRead(arg: Argument): string[] {
  switch (arg.kind) {
    case 'literal': return []
    case 'property': return [arg.name]
    case 'list': return arg.items.flatMap(propertiesRead)
    case 'call': return arg.args.flatMap(propertiesRead)
  }
}

/**
 * A property's value for `input`, or none when the source reads a property the input doesn't have
 * (an optional one, left out). Nothing is substituted: no empty text, zero, false or null.
 */
export function evaluatePresent(source: Expression, input: Data): { readonly present: true; readonly value: Scalar } | { readonly present: false } {
  if (propertiesRead(source).some((name) => !Object.hasOwn(input, name))) return { present: false }
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
  }
}
