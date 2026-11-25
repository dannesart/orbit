// Experiment #9, Phase 1: local objects. A Definition's property may be an object with properties
// of its own, belonging to the containing version, with no identity of its own. These test the
// domain itself (shared/features): validation, naming, equality, immutability, depth, and what
// existing Feature versions do with Definitions that contain local objects.
import { describe, expect, it } from 'vitest'
import {
  type DefinitionVersion, type Field, MAX_OBJECT_LEVELS, checkFields, defineVersion, localObjectPaths, refOf, sameFields, validate,
} from '../shared/features/definitions'
import { type Mapping, checkMapping } from '../shared/features/mappings'
import {
  type Feature, type InvocationResult, contractCompatibility, invoke, mappingCompatibility, orbitConsole, orbitTransformV1, orbitTransformV2,
} from '../shared/features/features'
import { A1, DEFINITIONS, INITIAL_DATA, INITIAL_MAPPING, RECORD_ID, WORKSPACE, describeOutcome } from '../app/dev/features/experiment'
import { draftFrom } from '../app/dev/definitions/model'

const W = 'w'
const text = (name: string, optional = false): Field => (optional ? { name, type: 'string', optional: true } : { name, type: 'string' })
const object = (name: string, fields: Field[], optional = false): Field => (optional ? { name, type: 'object', optional: true, fields } : { name, type: 'object', fields })
const version = (fields: Field[], id = 'candidate'): DefinitionVersion => defineVersion({ id, version: 1, name: 'Candidate', workspaceId: W, fields })

/** The owners' example. */
const CANDIDATE_FIELDS: Field[] = [
  text('firstName'),
  text('lastName'),
  object('contact', [text('email'), text('phone', true)]),
  object('address', [text('street'), text('postcode'), text('city')], true),
]
const CANDIDATE = version(CANDIDATE_FIELDS)
const ADA = { firstName: 'Ada', lastName: 'Lovelace', contact: { email: 'ada@example.com' } }

/** Properties nested `levels` object levels deep, counting the data itself as level 1: a › b › … › leaf. */
function nested(levels: number): Field[] {
  let fields: Field[] = [text('leaf')]
  for (let level = levels; level > 1; level--) fields = [object(`o${level}`, fields)]
  return fields
}
/** Data matching nested(levels). */
function nestedData(levels: number, leaf: unknown = 'x'): Record<string, unknown> {
  let data: Record<string, unknown> = { leaf }
  for (let level = levels; level > 1; level--) data = { [`o${level}`]: data }
  return data
}

describe('Validation, recursively, through the one domain validator', () => {
  it('accepts the example with its optional parts absent, and with them present', () => {
    expect(validate(CANDIDATE, ADA)).toEqual([])
    expect(validate(CANDIDATE, { ...ADA, contact: { email: 'ada@example.com', phone: '+44' }, address: { street: 'St James’s Square', postcode: 'SW1', city: 'London' } })).toEqual([])
  })

  it('refuses a missing required parent, once, at its own path (not each child)', () => {
    expect(validate(CANDIDATE, { firstName: 'Ada', lastName: 'Lovelace' })).toEqual([{ problem: 'missing', path: ['contact'], expected: 'object' }])
  })

  it('requires nothing inside an absent optional parent', () => {
    expect(validate(CANDIDATE, ADA)).toEqual([])
    expect('address' in ADA).toBe(false)
  })

  it('holds a present optional parent to its own structure', () => {
    expect(validate(CANDIDATE, { ...ADA, address: { street: 'St James’s Square', city: 'London' } })).toEqual([
      { problem: 'missing', path: ['address', 'postcode'], expected: 'string' },
    ])
  })

  it('treats an empty object by its children: required ones missing, optional ones fine', () => {
    expect(validate(CANDIDATE, { ...ADA, contact: {} })).toEqual([{ problem: 'missing', path: ['contact', 'email'], expected: 'string' }])
    const allOptional = version([object('prefs', [text('theme', true), text('locale', true)])], 'prefs')
    expect(validate(allOptional, { prefs: {} })).toEqual([])
    expect(validate(allOptional, {})).toEqual([{ problem: 'missing', path: ['prefs'], expected: 'object' }])
  })

  it('never takes null for absence, at any depth', () => {
    expect(validate(CANDIDATE, { ...ADA, address: null })).toEqual([{ problem: 'wrong_type', path: ['address'], expected: 'object', actual: 'null' }])
    expect(validate(CANDIDATE, { ...ADA, contact: null })).toEqual([{ problem: 'wrong_type', path: ['contact'], expected: 'object', actual: 'null' }])
    expect(validate(CANDIDATE, { ...ADA, contact: { email: 'a', phone: null } })).toEqual([{ problem: 'wrong_type', path: ['contact', 'phone'], expected: 'string', actual: 'null' }])
    const deep = version(nested(4), 'deep')
    expect(validate(deep, nestedData(4, null))).toEqual([{ problem: 'wrong_type', path: ['o2', 'o3', 'o4', 'leaf'], expected: 'string', actual: 'null' }])
  })

  it('refuses wrong types at every depth: a value for an object, an object or a list for a value', () => {
    expect(validate(CANDIDATE, { ...ADA, contact: 'ada@example.com' })).toEqual([{ problem: 'wrong_type', path: ['contact'], expected: 'object', actual: 'string' }])
    expect(validate(CANDIDATE, { ...ADA, contact: ['ada@example.com'] })).toEqual([{ problem: 'wrong_type', path: ['contact'], expected: 'object', actual: 'array' }])
    expect(validate(CANDIDATE, { ...ADA, firstName: { given: 'Ada' } })).toEqual([{ problem: 'wrong_type', path: ['firstName'], expected: 'string', actual: 'object' }])
    expect(validate(CANDIDATE, { ...ADA, contact: { email: 7 } })).toEqual([{ problem: 'wrong_type', path: ['contact', 'email'], expected: 'string', actual: 'number' }])
  })

  it('refuses unexpected properties at every level', () => {
    expect(validate(CANDIDATE, { ...ADA, contact: { email: 'a', fax: '1' } })).toEqual([{ problem: 'unexpected', path: ['contact', 'fax'] }])
    expect(validate(CANDIDATE, { ...ADA, address: { street: 's', postcode: 'p', city: 'c', country: 'UK' } })).toEqual([{ problem: 'unexpected', path: ['address', 'country'] }])
    expect(validate(CANDIDATE, { ...ADA, middleName: 'B' })).toEqual([{ problem: 'unexpected', path: ['middleName'] }])
  })

  it('reports every problem, each at its exact path, whatever the mix', () => {
    expect(validate(CANDIDATE, { lastName: 3, contact: { phone: '1', x: true }, address: {} })).toEqual([
      { problem: 'missing', path: ['firstName'], expected: 'string' },
      { problem: 'wrong_type', path: ['lastName'], expected: 'string', actual: 'number' },
      { problem: 'missing', path: ['contact', 'email'], expected: 'string' },
      { problem: 'unexpected', path: ['contact', 'x'] },
      { problem: 'missing', path: ['address', 'street'], expected: 'string' },
      { problem: 'missing', path: ['address', 'postcode'], expected: 'string' },
      { problem: 'missing', path: ['address', 'city'], expected: 'string' },
    ])
  })

  it('matches nested names exactly too: no case folding, no trimming', () => {
    expect(validate(CANDIDATE, { ...ADA, contact: { Email: 'a' } })).toEqual([
      { problem: 'missing', path: ['contact', 'email'], expected: 'string' },
      { problem: 'unexpected', path: ['contact', 'Email'] },
    ])
  })
})

describe('Paths: a literal dot is a name, never a level', () => {
  const dotted = version([text('contact.email'), object('contact', [text('email')])], 'dotted')

  it('keeps ["contact.email"] and ["contact", "email"] apart', () => {
    expect(validate(dotted, { 'contact.email': 'a', contact: { email: 'b' } })).toEqual([])
    expect(validate(dotted, { contact: {} })).toEqual([
      { problem: 'missing', path: ['contact.email'], expected: 'string' },
      { problem: 'missing', path: ['contact', 'email'], expected: 'string' },
    ])
    expect(validate(dotted, { 'contact.email': 'a', contact: { email: 'b' }, 'contact.phone': 'c' })).toEqual([{ problem: 'unexpected', path: ['contact.phone'] }])
  })
})

describe('Naming: one rule, within each object', () => {
  it('refuses duplicates within one object, by the shared rule', () => {
    expect(checkFields([object('contact', [text('email'), text('email')])])).toEqual([{ problem: 'duplicate_name', path: ['contact', 'email'] }])
    expect(checkFields([object('contact', [text('Email'), text('email')])])).toEqual([{ problem: 'differs_only_by_case', path: ['contact', 'email'], other: 'Email' }])
    expect(checkFields([object('contact', [text(' email')])])).toEqual([{ problem: 'surrounding_whitespace', path: ['contact', ' email'] }])
    expect(checkFields([object('a', [object('b', [text('café'), text('café')])])])).toEqual([{ problem: 'equivalent_unicode', path: ['a', 'b', 'café'], other: 'café' }])
    expect(() => version([object('contact', [text('email'), text('email')])])).toThrow(/duplicate_name at contact › email/)
  })

  it('allows the same name in separate objects, and in an object and its parent', () => {
    const fine = [text('name'), object('home', [text('name'), text('city')]), object('work', [text('name'), text('city'), object('home', [text('name')])])]
    expect(checkFields(fine)).toEqual([])
    expect(validate(version(fine), { name: 'a', home: { name: 'b', city: 'c' }, work: { name: 'd', city: 'e', home: { name: 'f' } } })).toEqual([])
  })
})

describe('Semantic equality ignores order at every level', () => {
  it('is the same contract in any order, outside and inside objects', () => {
    const reordered: Field[] = [
      object('address', [text('city'), text('street'), text('postcode')], true),
      object('contact', [text('phone', true), text('email')]),
      text('lastName'),
      text('firstName'),
    ]
    expect(sameFields(CANDIDATE.fields, reordered)).toBe(true)
  })

  it('tells apart any change inside an object: name, type, requiredness, structure', () => {
    const change = (contact: Field[]) => sameFields(CANDIDATE.fields, [text('firstName'), text('lastName'), object('contact', contact), CANDIDATE.fields[3]!])
    expect(change([text('email'), text('phone', true)])).toBe(true)
    expect(change([text('email'), text('mobile', true)])).toBe(false)
    expect(change([text('email'), text('phone')])).toBe(false)
    expect(change([text('email'), { name: 'phone', type: 'number', optional: true }])).toBe(false)
    expect(change([text('email'), object('phone', [text('number')], true)])).toBe(false)
    expect(change([text('email')])).toBe(false)
    expect(sameFields([object('contact', [text('email')])], [object('contact', [text('email')], true)])).toBe(false)
  })

  it('so a structural change anywhere needs a new version, and reordering alone never does', async () => {
    const { createDefinition, addVersion } = await import('../app/dev/definitions/model')
    // The Studio has no object editor, so its versions stay flat; the domain comparison is what a
    // version store asks, and it is the same function (sameFields) the Studio and the Designer ask.
    const made = createDefinition({ id: 'd', workspaceId: W, name: 'D', description: '', draft: { basedOn: null, fields: [{ key: 0, name: 'a', type: 'string', optional: false }, { key: 1, name: 'b', type: 'string', optional: false }], nextKey: 2 } })
    expect(() => addVersion(made, { basedOn: 1, fields: [{ key: 1, name: 'b', type: 'string', optional: false }, { key: 0, name: 'a', type: 'string', optional: false }], nextKey: 2 })).toThrow('This is exactly version 1')
  })
})

describe('Published versions stay deeply immutable; local objects have no identity', () => {
  it('freezes every level, and is a private copy of what it was made from', () => {
    const source: Field[] = structuredClone(CANDIDATE_FIELDS)
    const v = version(source)
    ;((source[2] as { fields: Field[] }).fields[0] as { name: string }).name = 'changed'
    const contact = v.fields[2] as { fields: readonly Field[] }
    expect(contact.fields[0]!.name).toBe('email')
    expect(Object.isFrozen(contact) && Object.isFrozen(contact.fields) && contact.fields.every(Object.isFrozen)).toBe(true)
    expect(() => { (contact.fields as Field[]).push(text('fax')) }).toThrow(TypeError)
    expect(() => { (contact.fields[0] as { type: string }).type = 'number' }).toThrow(TypeError)
  })

  it('writes a local object canonically: name, type, its fields, and optional only when true', () => {
    expect(version([{ name: 'o', type: 'object', optional: false, fields: [{ name: 'x', type: 'string', optional: false } as never] } as never]).fields).toEqual([
      { name: 'o', type: 'object', fields: [{ name: 'x', type: 'string' }] },
    ])
  })

  it('gives a local object no identity: one with an id, a version or a workspace is refused', () => {
    for (const extra of [{ id: 'contact' }, { version: 1 }, { workspaceId: W }]) {
      expect(checkFields([{ ...object('contact', [text('email')]), ...extra } as Field])).toEqual([{ problem: 'malformed', path: ['contact'] }])
    }
    expect(Object.keys(CANDIDATE.fields[2]!)).toEqual(['name', 'type', 'fields'])
  })

  it('refuses malformed properties rather than guessing: objects without fields, values with them, unknown types', () => {
    expect(checkFields([{ name: 'o', type: 'object' } as never])).toEqual([{ problem: 'malformed', path: ['o'] }])
    expect(checkFields([{ name: 's', type: 'string', fields: [] } as never])).toEqual([{ problem: 'malformed', path: ['s'] }])
    expect(checkFields([{ name: 'l', type: 'list' } as never])).toEqual([{ problem: 'malformed', path: ['l'] }])
  })

  it('lists where its local objects are, outermost first', () => {
    expect(localObjectPaths(CANDIDATE.fields)).toEqual([['contact'], ['address']])
    expect(localObjectPaths(version(nested(4), 'deep').fields)).toEqual([['o2'], ['o2', 'o3'], ['o2', 'o3', 'o4']])
    expect(localObjectPaths(A1.fields)).toEqual([])
  })
})

describe(`Maximum depth: ${MAX_OBJECT_LEVELS} object levels, the data itself being level 1`, () => {
  it('allows exactly 16 levels: the deepest object’s path has 15 names, the longest property path 16', () => {
    expect(MAX_OBJECT_LEVELS).toBe(16)
    const deepest = version(nested(16), 'deepest')
    const paths = localObjectPaths(deepest.fields)
    expect(paths.at(-1)).toHaveLength(15)
    expect(validate(deepest, nestedData(16))).toEqual([])
    const issues = validate(deepest, nestedData(16, 1))
    expect(issues).toHaveLength(1)
    expect(issues[0]!.path).toHaveLength(16)
  })

  it('refuses 17 levels when the version is made, naming where, and makes nothing', () => {
    const fields = nested(17)
    expect(checkFields(fields)).toEqual([{ problem: 'too_deep', path: ['o2', 'o3', 'o4', 'o5', 'o6', 'o7', 'o8', 'o9', 'o10', 'o11', 'o12', 'o13', 'o14', 'o15', 'o16', 'o17'], level: 17 }])
    expect(() => version(fields, 'too-deep')).toThrow(/too_deep at o2 › o3 .* › o17/)
  })

  it('counts depth along each branch, not across siblings', () => {
    const wide = [object('a', nested(15)), object('b', nested(15)), ...nested(16)]
    expect(checkFields(wide)).toEqual([])
  })

  it('refuses, at validation too, a Definition deeper than the limit that wasn’t made by defineVersion', () => {
    const forged = { id: 'forged', version: 1, name: 'Forged', workspaceId: W, fields: nested(17) } as DefinitionVersion
    expect(() => validate(forged, nestedData(17))).toThrow(/more than 16 object levels/)
  })

  it('follows the Definition, never the data: data nested deeper is a wrong type where the Definition ends, reported whole', () => {
    const deepest = version(nested(16), 'deepest')
    let tooDeep: unknown = { more: 'x' }
    for (let i = 0; i < 10_000; i++) tooDeep = { more: tooDeep }
    const issues = validate(deepest, nestedData(16, tooDeep))
    expect(issues).toEqual([{ problem: 'wrong_type', path: [...localObjectPaths(deepest.fields).at(-1)!, 'leaf'], expected: 'string', actual: 'object' }])
    // An unexpected property is reported as one, whatever it holds: nothing is walked, nothing is cut.
    expect(validate(CANDIDATE, { ...ADA, extra: tooDeep })).toEqual([{ problem: 'unexpected', path: ['extra'] }])
  })
})

describe('Flat Definitions behave exactly as before', () => {
  it('validates, compares and freezes the experiment’s flat versions as it always did', () => {
    expect(validate(A1, INITIAL_DATA)).toEqual([])
    expect(validate(A1, { firstName: 'Ada' })).toEqual([{ problem: 'missing', path: ['lastName'], expected: 'string' }])
    expect(validate(A1, { firstName: 'Ada', lastName: 1, x: 2 })).toEqual([
      { problem: 'wrong_type', path: ['lastName'], expected: 'string', actual: 'number' },
      { problem: 'unexpected', path: ['x'] },
    ])
    for (const d of DEFINITIONS) {
      expect(checkFields(d.fields)).toEqual([])
      expect(localObjectPaths(d.fields)).toEqual([])
      expect(defineVersion(d)).toEqual(d)
    }
  })
})

describe('Existing Feature versions: nested contracts are refused explicitly, never silently accepted', () => {
  const PERSON = defineVersion({ id: 'person', version: 1, name: 'Person', workspaceId: W, fields: [text('name')] })
  const SUMMARY = defineVersion({ id: 'summary', version: 1, name: 'Summary', workspaceId: W, fields: [text('title')] })
  const NESTED_OUT = defineVersion({ id: 'nested-out', version: 1, name: 'Nested out', workspaceId: W, fields: [object('card', [text('title')])] })
  const prop = (name: string) => ({ kind: 'property' as const, name })
  const catalog = (mapping?: Mapping) => ({
    definitions: [CANDIDATE, PERSON, SUMMARY, NESTED_OUT],
    records: [{ id: 'cand', workspaceId: W, definition: refOf(CANDIDATE), data: ADA }, { id: 'pers', workspaceId: W, definition: refOf(PERSON), data: { name: 'Ada' } }],
    mappings: mapping ? [mapping] : [],
  })
  const mapping = (from: DefinitionVersion, to: DefinitionVersion, properties: Mapping['properties']): Mapping => ({ id: 'm', version: 1, workspaceId: W, from: refOf(from), to: refOf(to), properties })
  let runs = 0
  const counted = <F extends Feature>(feature: F): F => ({ ...feature, run: (...args: never[]) => { runs++; return (feature.run as (...a: never[]) => unknown)(...args) } }) as F
  const outcome = (r: InvocationResult) => r.evidence.outcome

  it('every existing Feature version declares no support for local objects', () => {
    for (const feature of [orbitConsole, orbitTransformV1, orbitTransformV2]) {
      expect(feature.localObjects).toBe('unsupported')
      expect(contractCompatibility(feature, CANDIDATE)).toEqual([['contact'], ['address']])
      expect(contractCompatibility(feature, A1)).toEqual([])
    }
  })

  it('Orbit.Console v1 refuses a Record of a Definition with local objects, before running', () => {
    runs = 0
    const result = invoke(catalog(), { workspaceId: W, feature: counted(orbitConsole), input: { record: 'cand' } })
    expect(outcome(result)).toEqual({ kind: 'not_attempted', reason: 'unsupported_contract', definition: refOf(CANDIDATE), paths: [['contact'], ['address']] })
    expect(result.evidence.feature).toEqual({ id: 'orbit.console', version: 1 })
    expect(result.output).toBeUndefined()
    expect(result.observations).toEqual([])
    expect(runs).toBe(0)
  })

  it('refuses the contract whatever the data, before validating it on the Feature’s behalf', () => {
    const result = invoke(catalog(), { workspaceId: W, feature: orbitConsole, input: { definition: refOf(CANDIDATE), data: { nonsense: true } as never } })
    expect(outcome(result)).toMatchObject({ reason: 'unsupported_contract' })
  })

  it('Orbit.Transform v1 and v2 refuse a nested input Definition, even if the Mapping reads only flat properties', () => {
    const m = mapping(CANDIDATE, SUMMARY, [{ name: 'title', source: prop('firstName') }])
    for (const feature of [orbitTransformV1, orbitTransformV2]) {
      runs = 0
      const result = invoke(catalog(m), { workspaceId: W, feature: counted(feature), input: { record: 'cand' }, mapping: { id: 'm', version: 1 } })
      expect(outcome(result)).toEqual({ kind: 'not_attempted', reason: 'unsupported_contract', definition: refOf(CANDIDATE), paths: [['contact'], ['address']] })
      expect(result.evidence.feature).toEqual({ id: 'orbit.transform', version: feature.version })
      expect(runs).toBe(0)
    }
  })

  it('Orbit.Transform v1 and v2 refuse a nested output Definition', () => {
    const m = mapping(PERSON, NESTED_OUT, [{ name: 'card', source: prop('name') }])
    for (const feature of [orbitTransformV1, orbitTransformV2]) {
      runs = 0
      const result = invoke(catalog(m), { workspaceId: W, feature: counted(feature), input: { record: 'pers' }, mapping: { id: 'm', version: 1 } })
      expect(outcome(result)).toEqual({ kind: 'not_attempted', reason: 'unsupported_contract', definition: refOf(NESTED_OUT), paths: [['card']] })
      expect(runs).toBe(0)
    }
  })

  it('a Mapping can’t read a local object as a value, whichever version checks it', () => {
    const m = mapping(CANDIDATE, SUMMARY, [{ name: 'title', source: prop('contact') }])
    expect(checkMapping(m, CANDIDATE).issues).toEqual([{ problem: 'object_property', path: ['title'], name: 'contact' }])
    expect(mappingCompatibility(orbitTransformV2, m, CANDIDATE, SUMMARY)).toEqual([{ problem: 'object_property', path: ['title'], name: 'contact' }])
    // Nested names aren't paths: "contact.email" is just a property the input doesn't have.
    expect(checkMapping(mapping(CANDIDATE, SUMMARY, [{ name: 'title', source: prop('contact.email') }]), CANDIDATE).issues).toEqual([{ problem: 'unknown_property', path: ['title'], name: 'contact.email' }])
  })

  it('flat contracts run exactly as before', () => {
    const catalogFlat = { definitions: DEFINITIONS, records: [{ id: RECORD_ID, workspaceId: WORKSPACE, definition: refOf(A1), data: INITIAL_DATA }], mappings: [INITIAL_MAPPING] }
    const consoleRun = invoke(catalogFlat, { workspaceId: WORKSPACE, feature: orbitConsole, input: { record: RECORD_ID } })
    expect(outcome(consoleRun)).toEqual({ kind: 'succeeded' })
    for (const feature of [orbitTransformV1, orbitTransformV2]) {
      const result = invoke(catalogFlat, { workspaceId: WORKSPACE, feature, input: { record: RECORD_ID }, mapping: { id: INITIAL_MAPPING.id, version: 1 } })
      expect(outcome(result)).toEqual({ kind: 'succeeded' })
      expect(result.output!.data).toEqual({ fullName: 'Ada Lovelace' })
    }
  })

  it('evidence of a refusal carries Definition references and paths, never the data', () => {
    const result = invoke(catalog(), { workspaceId: W, feature: orbitConsole, input: { record: 'cand' } })
    expect(JSON.stringify(result.evidence)).not.toMatch(/Ada|example\.com/)
    expect(Object.isFrozen(result.evidence)).toBe(true)
  })

  it('says so in plain words', () => {
    const result = invoke(catalog(), { workspaceId: W, feature: orbitConsole, input: { record: 'cand' } })
    expect(describeOutcome(outcome(result))).toBe('This version of the Feature doesn’t accept candidate · v1: it has objects or other Definitions inside it (contact, address). The Feature didn’t run.')
  })
})

describe('The Studio and the Designer stay flat, and say so rather than flattening', () => {
  it('the Studio refuses to open a version with local objects as a draft', () => {
    expect(() => draftFrom(CANDIDATE)).toThrow(/has local objects or references, which the Studio can’t edit yet/)
  })
})
