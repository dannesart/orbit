// The Feature playground's experiment, apart from its page: in-memory fixtures, the chain
// Record A → Orbit.Console → Orbit.Transform → Orbit.Console composed right here (deliberately
// not a reusable orchestration abstraction), and plain words for outcomes and issues.
// Development only: the page that uses this is registered only by `nuxt dev` (nuxt.config.ts).
import {
  type Data, type DefinitionRef, type DefinitionVersion, type Field, type FieldType, type Issue, type Kind, type NamingIssue, type PropertyType, type DefinitionIssue, MAX_OBJECT_LEVELS,
  deepFreeze, defineVersion, propertyPathWords, sameDefinition,
} from '#shared/features/definitions'
import {
  type ArgumentType, type Expression, type Mapping, type MappingIssue, type MappingProperty, type Path, checkMapping,
} from '#shared/features/mappings'
import {
  type Catalog, type FeatureRef, type InvocationResult, type Outcome, type PassThroughFeature, invoke, orbitConsole, orbitTransformV2,
} from '#shared/features/features'

export const WORKSPACE = 'ws-playground'
export const ELSEWHERE = 'ws-elsewhere'
export const RECORD_ID = 'record-a'

const nameFields: Field[] = [{ name: 'firstName', type: 'string' }, { name: 'lastName', type: 'string' }]
export const A1 = defineVersion({ id: 'person-name', version: 1, name: 'Definition A', workspaceId: WORKSPACE, fields: nameFields })
export const B1 = defineVersion({ id: 'full-name', version: 1, name: 'Definition B', workspaceId: WORKSPACE, fields: [{ name: 'fullName', type: 'string' }] })

export const DEFINITIONS: readonly DefinitionVersion[] = deepFreeze([
  A1,
  defineVersion({ id: 'person-name', version: 2, name: 'Definition A', workspaceId: WORKSPACE, fields: [...nameFields, { name: 'email', type: 'string' }] }),
  defineVersion({ id: 'person-name-copy', version: 1, name: 'A look-alike of Definition A', workspaceId: WORKSPACE, fields: nameFields }),
  defineVersion({ id: 'their-person-name', version: 1, name: 'Another workspace’s Definition A', workspaceId: ELSEWHERE, fields: nameFields }),
  B1,
])

/** What Record A can be pinned to, to see how exact identity and workspace scoping behave. */
export const PINS: readonly { key: string; ref: DefinitionRef; note: string }[] = [
  { key: 'a1', ref: { id: 'person-name', version: 1 }, note: 'What the Mapping reads.' },
  { key: 'a2', ref: { id: 'person-name', version: 2 }, note: 'A newer version of the same Definition, with an email field.' },
  { key: 'copy', ref: { id: 'person-name-copy', version: 1 }, note: 'The same fields, but a different Definition.' },
  { key: 'elsewhere', ref: { id: 'their-person-name', version: 1 }, note: 'Belongs to another workspace.' },
]

export const INITIAL_DATA: Data = { firstName: '  Ada  ', lastName: 'Lovelace' }

const prop = (name: string): Expression => ({ kind: 'property', name })
const text = (value: string): Expression => ({ kind: 'literal', value })

/** join([trim(firstName), " ", lastName], "") → "Ada Lovelace". */
export const INITIAL_MAPPING: Mapping = deepFreeze({
  id: 'full-name-from-person',
  version: 1,
  workspaceId: WORKSPACE,
  from: { id: A1.id, version: A1.version },
  to: { id: B1.id, version: B1.version },
  properties: [{
    name: 'fullName',
    source: { kind: 'call', fn: 'join', args: [{ kind: 'list', items: [{ kind: 'call', fn: 'trim', args: [prop('firstName')] }, text(' '), prop('lastName')] }, text('')] },
  }],
})

/**
 * Consoles that misbehave on purpose, to see the boundary hold. Each has its own identity, so
 * evidence names the Feature that actually ran.
 */
export const CONSOLES: readonly { feature: PassThroughFeature; label: string }[] = [
  { feature: orbitConsole, label: 'Orbit.Console' },
  {
    label: 'A Console that tries to change the value',
    feature: { id: 'playground.console-that-edits', version: 1, contract: 'pass-through', localObjects: 'unsupported', references: 'unsupported', run(input, { inspect }) {
      inspect(input)
      ;(input as Record<string, unknown>).firstName = 'Grace' // the input is frozen: this throws
      return input
    } },
  },
  {
    label: 'A Console that hands on something else',
    feature: { id: 'playground.console-that-swaps', version: 1, contract: 'pass-through', localObjects: 'unsupported', references: 'unsupported', run(input, { inspect }) {
      inspect(input)
      return { ...input, firstName: 'Grace' }
    } },
  },
]

/** One step of the chain: its result, or null when it was never invoked. */
export type Step = InvocationResult | null

/**
 * Record A → Console → Transform → Console. Each step is its own invocation; a step is invoked
 * only with the previous step's output, so nothing follows a step that didn't succeed.
 * Every step runs within one workspace: the playground's own, unless the caller names another.
 */
export function runExperiment(catalog: Catalog, options: { console: PassThroughFeature; mapping: FeatureRef; workspaceId?: string }): [Step, Step, Step] {
  const workspaceId = options.workspaceId ?? WORKSPACE
  const first = invoke(catalog, { workspaceId, feature: options.console, input: { record: RECORD_ID } })
  const second = first.output ? invoke(catalog, { workspaceId, feature: orbitTransformV2, input: first.output, mapping: options.mapping }) : null
  const third = second?.output ? invoke(catalog, { workspaceId, feature: orbitConsole, input: second.output }) : null
  return [first, second, third]
}

/** Record A's data as typed into the playground: JSON, or why it isn't. */
export function parseRecordData(text: string): { data: unknown } | { error: string } {
  try {
    return { data: JSON.parse(text) }
  } catch {
    return { error: 'This isn’t valid JSON yet.' }
  }
}

// --- Words ---

export const definitionLabel = (ref: DefinitionRef) => {
  const d = DEFINITIONS.find((x) => sameDefinition(x, ref))
  return `${d?.name ?? ref.id} · v${ref.version}`
}

/** A version's structure in one line: `{ fullName: string, alias?: string }` (`?`: optional). */
export const shapeOf = (d: DefinitionVersion) => `{ ${d.fields.map((f) => `${f.name}${f.optional === true ? '?' : ''}: ${f.type}`).join(', ')} }`

const kindWords: Record<Kind | ArgumentType | 'invalid', string> = {
  string: 'text', number: 'a number', boolean: 'yes or no', 'string[]': 'a list of text', null: 'null',
  undefined: 'missing', array: 'an array', object: 'an object', other: 'something else', invalid: 'something invalid',
}

export function describeIssue(issue: Issue): string {
  switch (issue.problem) {
    case 'not_an_object': return `The data must be an object, not ${kindWords[issue.actual]}.`
    case 'missing': return `${propertyPathWords(issue.path)} is missing (it should be ${kindWords[issue.expected]}).`
    case 'unexpected': return `${propertyPathWords(issue.path)} isn’t part of this Definition.`
    case 'wrong_type': return `${propertyPathWords(issue.path)} should be ${kindWords[issue.expected]}, not ${kindWords[issue.actual]}.`
  }
}

/**
 * The naming rule (checkPropertyNames) in words, the same in the Studio and the Designer. Deduplicated:
 * several names with surrounding spaces make one sentence.
 */
export function describeNamingIssues(issues: readonly NamingIssue[]): string[] {
  return [...new Set(issues.map((issue) => {
    const name = issue.path.at(-1) ?? ''
    const within = issue.path.length > 1 ? `In ${propertyPathWords(issue.path.slice(0, -1))}: ` : ''
    switch (issue.problem) {
      case 'empty_name': return `${within}Every property needs a name.`
      case 'surrounding_whitespace': return `${within}Property names can’t start or end with a space.`
      case 'duplicate_name': return `${within}Two properties are called “${name}”.`
      case 'differs_only_by_case': return `${within}“${issue.other}” and “${name}” differ only in capital letters. Use one name, or two clearly different ones.`
      case 'equivalent_unicode': return `${within}“${issue.other}” and “${name}” are the same name, written with different characters.`
    }
  }))]
}

/** Where in a property's source: "fullName › join › argument 1 › item 2 › trim". */
export function formatPath(path: Path): string {
  return path.map((segment, i) => {
    if (typeof segment === 'string') return segment
    if (i === 0) return `property ${segment + 1}`
    return typeof path[i - 1] === 'string' ? `argument ${segment + 1}` : `item ${segment + 1}`
  }).join(' › ')
}

export function describeMappingIssue(issue: MappingIssue): string {
  switch (issue.problem) {
    case 'empty_name': return 'Give this property a name.'
    case 'duplicate_name': return 'Another property already has this name.'
    case 'unknown_property': return `The input has no property “${issue.name}”.`
    case 'unknown_function': return `Orbit has no function “${issue.fn}”.`
    case 'argument_count': return `${issue.fn} takes ${issue.expected} arguments, not ${issue.actual}.`
    case 'argument_type': return `${issue.fn} needs ${kindWords[issue.expected]} here, not ${kindWords[issue.actual]}.`
    case 'list_item_type': return `Only strings can be joined; this is ${kindWords[issue.actual]}.`
    case 'list_not_allowed': return 'A property can’t be a list.'
    case 'invalid_literal': return 'That isn’t a usable number.'
    case 'may_be_absent': return `${issue.optional.join(', ')} may be missing, but this property is required. Orbit won’t invent a value.`
    case 'object_property': return `${issue.name} is an object. A source can read text, numbers and yes or no, not a whole object.`
    case 'absence_unsupported': return `${issue.optional.join(', ')} may be missing, and this version of the Transform has no behaviour for that.`
    case 'unsupported_source': return 'This version of the Transform doesn’t understand this kind of source.'
  }
}

export const outcomeLabel = (outcome: Outcome) =>
  ({ succeeded: 'Succeeded', failed: 'Failed', not_attempted: 'Not attempted' })[outcome.kind]

export function describeOutcome(outcome: Outcome): string {
  if (outcome.kind === 'succeeded') return ''
  switch (outcome.reason) {
    case 'not_found': return 'Something it refers to doesn’t exist in this workspace, so the Feature didn’t run.'
    case 'invalid_input': return 'The input doesn’t match its own Definition, so the Feature didn’t run.'
    case 'contract_mismatch': return `It reads ${definitionLabel(outcome.expected)}, but received ${definitionLabel(outcome.actual)}. Exact versions only, so the Feature didn’t run.`
    case 'invalid_mapping': return 'The Mapping can’t be applied to this input, so the Feature didn’t run.'
    case 'invalid_contract': return `${definitionLabel(outcome.definition)} doesn’t hold together here as a contract, so the Feature didn’t run.`
    case 'unsupported_contract': return `This version of the Feature doesn’t accept ${definitionLabel(outcome.definition)}: it has objects or other Definitions inside it (${outcome.paths.map(propertyPathWords).join(', ')}). The Feature didn’t run.`
    case 'threw': return `The Feature stopped with an error (${outcome.error}). Nothing was handed on.`
    case 'invalid_output': return 'Its output doesn’t satisfy the target Definition, so it went no further.'
    case 'pass_through_broken': return 'It handed on something different from what it received. The boundary stopped it there.'
  }
}

/** A problem with a contract (checkFields, checkContract), in words. `label` names a referenced version. */
export function describeDefinitionIssue(issue: DefinitionIssue, label: (ref: DefinitionRef) => string = definitionLabel): string {
  const at = propertyPathWords(issue.path)
  switch (issue.problem) {
    case 'unresolved_reference': return `${at} refers to ${label(issue.definition)}, which can’t be found here.`
    case 'unavailable_reference': return `${at} refers to ${label(issue.definition)}, which this Definition may not depend on.`
    case 'cyclic_reference': return `${at} refers back to ${label(issue.definition)}, which contains it, so it never ends.`
    case 'too_deep': return `${at} would nest ${issue.level} levels deep. At most ${MAX_OBJECT_LEVELS} are allowed.`
    case 'malformed': return `${at} isn’t a property Orbit understands.`
    default: return describeNamingIssues([issue])[0]!
  }
}

export const outcomeIssues = (outcome: Outcome): string[] => {
  if (!('issues' in outcome)) return []
  if (outcome.reason === 'invalid_mapping') return outcome.issues.map((i) => `${formatPath(i.path)}: ${describeMappingIssue(i)}`)
  if (outcome.reason === 'invalid_contract') return outcome.issues.map((i) => describeDefinitionIssue(i))
  return outcome.issues.map(describeIssue)
}

/**
 * Hints while editing a Mapping, before anything runs: each property's type (from its source),
 * what the target Definition expects of it, and what the target needs that nothing produces yet.
 * Only hints: the boundary still validates the actual output.
 */
export function mappingHints(properties: readonly MappingProperty[], input: DefinitionVersion, target: DefinitionVersion) {
  const names = properties.map((p) => p.name)
  const rows = properties.map((property) => {
    const { issues, types } = checkMapping({ properties: [property] }, input)
    const own = [...issues]
    if (property.name && names.filter((n) => n === property.name).length > 1) own.push({ problem: 'duplicate_name', path: [property.name] })
    const expected: PropertyType | null = target.fields.find((f) => f.name === property.name)?.type ?? null
    const where = (i: MappingIssue) => (i.path.length > 1 ? `${formatPath(i.path.slice(1))}: ` : '')
    return { type: types[0] ?? null, expected, issues: own.map((i) => where(i) + describeMappingIssue(i)) }
  })
  const missing = target.fields.filter((f) => !names.includes(f.name))
  return { rows, missing }
}
