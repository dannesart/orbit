import { type DefinitionRef, type DefinitionVersion, type Data, type FieldType, type Scalar, deepFreeze, frozenCopy, kindOf } from './definitions'

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
 * immutable once made: changing it makes a new version (reviseMapping).
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

type Checked = { type: ArgumentType | 'invalid'; issues: MappingIssue[] }

function checkArgument(arg: Argument, input: DefinitionVersion, path: Path): Checked {
  switch (arg.kind) {
    case 'literal': {
      const kind = kindOf(arg.value)
      return kind === 'string' || kind === 'number' || kind === 'boolean'
        ? { type: kind, issues: [] }
        : { type: 'invalid', issues: [{ problem: 'invalid_literal', path }] }
    }
    case 'property': {
      const field = input.fields.find((f) => f.name === arg.name)
      return field ? { type: field.type, issues: [] } : { type: 'invalid', issues: [{ problem: 'unknown_property', path, name: arg.name }] }
    }
    case 'list': {
      const items = arg.items.map((item, i) => checkArgument(item, input, [...path, i]))
      const issues = items.flatMap((c) => c.issues)
      for (const [i, c] of items.entries()) {
        if (c.type !== 'invalid' && c.type !== 'string') issues.push({ problem: 'list_item_type', path: [...path, i], expected: 'string', actual: c.type })
      }
      return { type: issues.length ? 'invalid' : 'string[]', issues }
    }
    case 'call': {
      const spec = functionSpec(arg.fn)
      if (!spec) return { type: 'invalid', issues: [{ problem: 'unknown_function', path, fn: arg.fn }] }
      const here = [...path, arg.fn]
      if (arg.args.length !== spec.params.length) {
        return { type: 'invalid', issues: [{ problem: 'argument_count', path: here, fn: arg.fn, expected: spec.params.length, actual: arg.args.length }] }
      }
      const issues: MappingIssue[] = []
      for (const [i, a] of arg.args.entries()) {
        const c = checkArgument(a, input, [...here, i])
        issues.push(...c.issues)
        if (c.type !== 'invalid' && c.type !== spec.params[i]) issues.push({ problem: 'argument_type', path: [...here, i], fn: arg.fn, expected: spec.params[i]!, actual: c.type })
      }
      return { type: issues.length ? 'invalid' : spec.returns, issues }
    }
  }
}

/** Checks one property's source: its type, or why it has none. */
function checkSource(source: Expression, input: DefinitionVersion, path: Path): { type: FieldType | null; issues: MappingIssue[] } {
  const c = checkArgument(source, input, path)
  if (c.type === 'string[]') return { type: null, issues: [...c.issues, { problem: 'list_not_allowed', path }] }
  return { type: c.type === 'invalid' ? null : c.type, issues: c.issues }
}

/**
 * Whether a Mapping can be applied to values of `input`, and the type each property will have.
 * Checked before Transform runs. Whether the result satisfies the target Definition is a separate
 * question, answered by validating the output (the boundary never trusts a Feature's result).
 */
export function checkMapping(mapping: Pick<Mapping, 'properties'>, input: DefinitionVersion) {
  const issues: MappingIssue[] = []
  const types: (FieldType | null)[] = []
  const seen = new Set<string>()
  for (const [i, { name, source }] of mapping.properties.entries()) {
    const path = [name || i]
    if (!name) issues.push({ problem: 'empty_name', path })
    else if (seen.has(name)) issues.push({ problem: 'duplicate_name', path })
    seen.add(name)
    const checked = checkSource(source, input, path)
    issues.push(...checked.issues)
    types.push(checked.type)
  }
  return { issues, types }
}

function evaluateArgument(arg: Argument, input: Data): Scalar | Scalar[] {
  switch (arg.kind) {
    case 'literal':
      return arg.value
    case 'property':
      if (!Object.hasOwn(input, arg.name)) throw new Error('A source refers to a property the value does not have')
      return input[arg.name]!
    case 'list':
      return arg.items.map((item) => evaluateArgument(item, input) as Scalar)
    case 'call': {
      const spec = functionSpec(arg.fn)
      if (!spec) throw new Error('A source calls a function Orbit does not have')
      return spec.apply(arg.args.map((a) => evaluateArgument(a, input)))
    }
  }
}

/** A property's value for `input`. Only for Mappings checkMapping found sound. */
export const evaluate = (source: Expression, input: Data): Scalar => evaluateArgument(source, input) as Scalar

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
