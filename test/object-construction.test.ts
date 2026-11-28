// Phase 4.3, object construction in Transform v3 (provisional): output objects (local ones and
// values of exactly referenced Definition versions) are built property by property, with explicit
// presence and presence guarantees that never leave their construction.
import { describe, expect, it } from 'vitest'
import { type Data, type DefinitionVersion, type Field, defineVersion, refOf } from '../shared/features/definitions'
import { type Catalog, invoke, mappingCompatibility, orbitTransformV1, orbitTransformV2, orbitTransformV3 } from '../shared/features/features'
import { type Expression, type Mapping, type MappingProperty, type Presence, checkNestedMapping, evaluatePresent, sameMappingProperties } from '../shared/features/mappings'

const W = 'ws-build'
const s = (name: string, optional = false): Field => (optional ? { name, type: 'string', optional: true } : { name, type: 'string' })
const only = (...vs: DefinitionVersion[]) => (r: { id: string; version: number }) => vs.find((v) => v.id === r.id && v.version === r.version) ?? null
const ADDRESS = defineVersion({ id: 'addr', version: 1, name: 'Address', workspaceId: W, fields: [s('street'), s('city'), s('postcode', true)] })
const INPUT = defineVersion({ id: 'in', version: 1, name: 'In', workspaceId: W, fields: [
  s('name'),
  { name: 'contact', type: 'object', optional: true, fields: [s('email'), s('phone', true), { name: 'mail', type: 'reference', definition: refOf(ADDRESS), optional: true }] },
  { name: 'home', type: 'reference', definition: refOf(ADDRESS) },
  { name: 'flags', type: 'object', fields: [{ name: 'active', type: 'boolean' }, { name: 'count', type: 'number' }, s('note')] },
] }, only(ADDRESS))
const OUTPUT = defineVersion({ id: 'out', version: 1, name: 'Out', workspaceId: W, fields: [
  s('title', true),
  { name: 'Contact', type: 'object', optional: true, fields: [s('Email'), s('Phone', true), { name: 'Mail', type: 'reference', definition: refOf(ADDRESS), optional: true }] },
  { name: 'Home', type: 'reference', definition: refOf(ADDRESS) },
  { name: 'Prefs', type: 'object', optional: true, fields: [s('Note', true)] },
  { name: 'Flags', type: 'object', optional: true, fields: [{ name: 'Active', type: 'boolean' }, { name: 'Count', type: 'number' }, s('Note')] },
] }, only(ADDRESS))
const resolve = only(ADDRESS, INPUT, OUTPUT)

const path = (...p: string[]): Expression => p.length === 1 ? { kind: 'property', name: p[0]! } : { kind: 'path', path: p }
const always: Presence = { when: 'always' }
const when = (...source: string[]): Presence => ({ when: 'present', source })
const build = (presence: Presence, properties: MappingProperty[]): Expression => ({ kind: 'construct', presence, properties })
const HOME: MappingProperty = { name: 'Home', source: build(always, [{ name: 'street', source: path('home', 'street') }, { name: 'city', source: path('home', 'city') }, { name: 'postcode', source: path('home', 'postcode') }]) }
const CONTACT: MappingProperty = { name: 'Contact', source: build(when('contact'), [{ name: 'Email', source: path('contact', 'email') }, { name: 'Phone', source: path('contact', 'phone') }]) }

const FULL: Data = {
  name: 'Ada',
  contact: { email: 'ada@example.com', phone: '', mail: { street: 'St James’s Square', city: 'London' } },
  home: { street: 'Ockham Park', city: 'Ockham', postcode: 'KT11' },
  flags: { active: false, count: 0, note: '' },
}
const BARE: Data = { name: 'Ada', home: { street: 'Ockham Park', city: 'Ockham' }, flags: { active: true, count: 1, note: 'n' } }

const check = (properties: MappingProperty[], r = resolve) => checkNestedMapping({ properties }, INPUT, OUTPUT, { resolve: r }).issues
const run = (properties: MappingProperty[], data: Data = FULL, definitions: DefinitionVersion[] = [INPUT, OUTPUT, ADDRESS], feature = orbitTransformV3) => {
  const mapping: Mapping = Object.freeze({ id: 'm', version: 1, workspaceId: W, from: refOf(INPUT), to: refOf(OUTPUT), properties })
  const catalog: Catalog = { definitions, records: [{ id: 'r', workspaceId: W, definition: refOf(INPUT), data }], mappings: [mapping] }
  return invoke(catalog, { workspaceId: W, feature, input: { record: 'r' }, mapping: { id: 'm', version: 1 } })
}

describe('Presence', () => {
  it('always builds a required object, here a value of exactly the referenced Address version', () => {
    expect(check([HOME])).toEqual([])
    expect(run([HOME]).output!.data).toEqual({ Home: { street: 'Ockham Park', city: 'Ockham', postcode: 'KT11' } })
    // Its optional property follows its source: absent here, so left out, the object still made.
    expect(run([HOME], BARE).output!.data).toEqual({ Home: { street: 'Ockham Park', city: 'Ockham' } })
  })

  it('refuses a required object built only when an optional source object is present', () => {
    const conditional = { name: 'Home', source: build(when('contact', 'mail'), [{ name: 'street', source: path('contact', 'mail', 'street') }, { name: 'city', source: path('contact', 'mail', 'city') }]) }
    expect(check([conditional])).toEqual([{ problem: 'may_be_absent', at: { output: ['Home'], expression: ['presence'] }, optional: [['contact'], ['contact', 'mail']] }])
  })

  it('leaves an optional object out when it isn’t in the Mapping', () => {
    expect(run([HOME]).output!.data).not.toHaveProperty('Contact')
  })

  it('makes an always-built object even when everything in it is absent, and an empty one when its contract allows', () => {
    const prefs = (properties: MappingProperty[]) => ({ name: 'Prefs', source: build(always, properties) })
    expect(check([HOME, prefs([])])).toEqual([])
    expect(run([HOME, prefs([])]).output!.data.Prefs).toEqual({})
    expect(run([HOME, prefs([{ name: 'Note', source: path('contact', 'phone') }])], BARE).output!.data.Prefs).toEqual({})
  })

  it('refuses an incomplete object before running, naming exactly what is missing', () => {
    const incomplete = { name: 'Home', source: build(always, [{ name: 'street', source: path('home', 'street') }]) }
    expect(check([incomplete])).toEqual([{ problem: 'missing_output_property', at: { output: ['Home', 'city'], expression: [] }, name: 'city' }])
    expect(run([incomplete]).evidence.outcome).toMatchObject({ kind: 'not_attempted', reason: 'invalid_mapping' })
  })
})

describe('Conditional availability', () => {
  it('builds Contact when contact is present: its required email is available there, its phone still may be absent', () => {
    expect(check([HOME, CONTACT])).toEqual([])
    expect(run([HOME, CONTACT]).output!.data.Contact).toEqual({ Email: 'ada@example.com', Phone: '' })
    expect(run([HOME, CONTACT], BARE).output!.data).not.toHaveProperty('Contact')
    const phoneRequired = { name: 'Contact', source: build(when('contact'), [{ name: 'Email', source: path('contact', 'phone') }]) }
    expect(check([HOME, phoneRequired])).toEqual([{ problem: 'may_be_absent', at: { output: ['Contact', 'Email'], expression: [] }, optional: [['contact', 'phone']] }])
  })

  it('covers optional ancestors of the conditioned object, and paths through references', () => {
    const mail = { name: 'Contact', source: build(when('contact', 'mail'), [
      { name: 'Email', source: path('contact', 'email') },
      { name: 'Mail', source: build(always, [{ name: 'street', source: path('contact', 'mail', 'street') }, { name: 'city', source: path('contact', 'mail', 'city') }]) },
    ]) }
    expect(check([HOME, mail])).toEqual([])
    expect(run([HOME, mail]).output!.data.Contact).toEqual({ Email: 'ada@example.com', Mail: { street: 'St James’s Square', city: 'London' } })
    expect(run([HOME, mail], { ...FULL, contact: { email: 'a@b' } } as Data).output!.data).not.toHaveProperty('Contact')
  })

  it('passes guarantees into nested constructions, where they add up', () => {
    const nested = { name: 'Contact', source: build(when('contact'), [
      { name: 'Email', source: path('contact', 'email') },
      { name: 'Mail', source: build(when('contact', 'mail'), [
        { name: 'street', source: path('contact', 'mail', 'street') },
        { name: 'city', source: { kind: 'call', fn: 'join', args: [{ kind: 'list', items: [path('contact', 'email'), path('contact', 'mail', 'city')] }, { kind: 'literal', value: ' ' }] } },
      ]) },
    ]) }
    expect(check([HOME, nested])).toEqual([])
    expect(run([HOME, nested]).output!.data.Contact).toEqual({ Email: 'ada@example.com', Mail: { street: 'St James’s Square', city: 'ada@example.com London' } })
  })

  it('never lets a guarantee leak to a sibling or anything outside its construction', () => {
    const flags = { name: 'Flags', source: build(always, [
      { name: 'Active', source: path('flags', 'active') }, { name: 'Count', source: path('flags', 'count') }, { name: 'Note', source: path('contact', 'email') },
    ]) }
    expect(check([HOME, CONTACT, flags, { name: 'title', source: path('contact', 'email') }])).toEqual([
      { problem: 'may_be_absent', at: { output: ['Flags', 'Note'], expression: [] }, optional: [['contact']] },
    ])
    // A required top-level property gets no guarantee either.
    const strict = defineVersion({ id: 'strict', version: 1, name: 'Strict', workspaceId: W, fields: [s('title')] })
    expect(checkNestedMapping({ properties: [{ name: 'title', source: path('contact', 'email') }] }, INPUT, strict, { resolve }).issues)
      .toEqual([{ problem: 'may_be_absent', at: { output: ['title'], expression: [] }, optional: [['contact']] }])
  })

  it('decides availability from the contract, never from the example', () => {
    expect(check([HOME, { name: 'Contact', source: build(always, [{ name: 'Email', source: path('contact', 'email') }]) }]))
      .toEqual([{ problem: 'may_be_absent', at: { output: ['Contact', 'Email'], expression: [] }, optional: [['contact']] }])
  })
})

describe('Values inside constructions', () => {
  it('keeps false, zero and empty text, and runs existing expressions exactly as before', () => {
    const flags = { name: 'Flags', source: build(always, [
      { name: 'Active', source: path('flags', 'active') }, { name: 'Count', source: path('flags', 'count') },
      { name: 'Note', source: { kind: 'call', fn: 'trim', args: [{ kind: 'literal', value: '  ' }] } },
    ]) }
    expect(run([HOME, flags]).output!.data.Flags).toEqual({ Active: false, Count: 0, Note: '' })
  })

  it('checks each property against its object’s contract, before running', () => {
    const at = (output: string[], expression: (string | number)[] = []) => ({ output, expression })
    expect(check([HOME, { name: 'Flags', source: build(always, [{ name: 'Active', source: path('name') }, { name: 'Count', source: path('flags', 'count') }, { name: 'Note', source: path('name') }, { name: 'Extra', source: path('name') }]) }]))
      .toEqual([
        { problem: 'wrong_output_type', at: at(['Flags', 'Active']), expected: 'boolean', actual: 'string' },
        { problem: 'unknown_output_property', at: at(['Flags', 'Extra']), name: 'Extra' },
      ])
    expect(check([HOME, { name: 'title', source: build(always, []) }])).toEqual([{ problem: 'construct_into_value', at: at(['title']) }])
    expect(check([{ name: 'Home', source: path('name') }])).toEqual([{ problem: 'value_into_object', at: at(['Home']) }])
    expect(check([HOME, { name: 'title', source: { kind: 'call', fn: 'trim', args: [build(always, [])] } }])).toEqual([{ problem: 'construction_in_expression', at: at(['title'], ['trim', 0]) }])
    expect(check([HOME, { name: 'Contact', source: build(when('name'), [{ name: 'Email', source: path('name') }]) }])).toEqual([{ problem: 'condition_not_object', at: at(['Contact'], ['presence']) }])
    expect(check([HOME, { name: 'Contact', source: build(when('nobody'), [{ name: 'Email', source: path('name') }]) }])).toEqual([{ problem: 'unknown_path_property', at: at(['Contact'], ['presence']), step: 0, name: 'nobody' }])
    expect(check([HOME, { name: 'Contact', source: { kind: 'construct', presence: { when: 'sometimes' }, properties: [] } as unknown as Expression }])).toEqual([{ problem: 'malformed_construction', at: at(['Contact']) }])
  })

  it('locates a problem deep inside exactly', () => {
    const contact = { name: 'Contact', source: build(when('contact'), [{ name: 'Email', source: { kind: 'call', fn: 'join', args: [{ kind: 'list', items: [path('contact', 'email'), path('contact', 'fax')] }, { kind: 'literal', value: '' }] } }]) }
    expect(check([HOME, contact])).toEqual([{ problem: 'unknown_path_property', at: { output: ['Contact', 'Email'], expression: ['join', 0, 1] }, step: 1, name: 'fax' }])
  })
})

describe('Exact references and resolution', () => {
  it('builds a value of exactly the referenced version; one that can’t be resolved is refused, never guessed', () => {
    expect(check([HOME], only(INPUT, OUTPUT))).toEqual([{ problem: 'unresolved_output', at: { output: ['Home'], expression: [] } }])
    expect(run([HOME], FULL, [INPUT, OUTPUT]).evidence.outcome).toMatchObject({ kind: 'not_attempted', reason: 'invalid_contract' })
  })
})

describe('Compatibility and history', () => {
  it('older versions refuse a construction as a source they don’t have', () => {
    for (const f of [orbitTransformV1, orbitTransformV2]) {
      expect(mappingCompatibility(f, { properties: [HOME] }, INPUT, OUTPUT)).toEqual([{ problem: 'unsupported_source', path: ['Home'] }])
      expect(run([HOME], FULL, undefined, f).evidence.outcome).toMatchObject({ kind: 'not_attempted', reason: 'unsupported_contract' })
    }
  })

  it('names the exact versions in evidence, and hands on deeply frozen output', () => {
    const result = run([HOME, CONTACT])
    expect(result.evidence).toMatchObject({ feature: { id: 'orbit.transform', version: 3 }, mapping: { id: 'm', version: 1 }, output: { definition: { id: 'out', version: 1 } }, outcome: { kind: 'succeeded' } })
    expect(Object.isFrozen(result.output!.data)).toBe(true)
    expect(Object.isFrozen((result.output!.data as Record<string, object>).Home)).toBe(true)
    expect(Object.isFrozen((result.output!.data as Record<string, object>).Contact)).toBe(true)
  })

  it('evaluates as the Transform runs (one function for preview and execution)', () => {
    expect(evaluatePresent(CONTACT.source, BARE)).toEqual({ present: false })
    expect(evaluatePresent(CONTACT.source, FULL)).toEqual({ present: true, value: { Email: 'ada@example.com', Phone: '' } })
  })
})

describe('Semantic Mapping equality', () => {
  it('ignores the order of properties at every depth, never the presence or the source paths', () => {
    const a = [HOME, CONTACT]
    const reordered = [
      { name: 'Contact', source: build(when('contact'), [{ name: 'Phone', source: path('contact', 'phone') }, { name: 'Email', source: path('contact', 'email') }]) },
      { name: 'Home', source: build(always, [{ name: 'postcode', source: path('home', 'postcode') }, { name: 'city', source: path('home', 'city') }, { name: 'street', source: path('home', 'street') }]) },
    ]
    expect(sameMappingProperties(a, reordered)).toBe(true)
    expect(sameMappingProperties([CONTACT], [{ name: 'Contact', source: build(always, (CONTACT.source as { properties: MappingProperty[] }).properties) }])).toBe(false)
    expect(sameMappingProperties([CONTACT], [{ name: 'Contact', source: build(when('contact', 'mail'), (CONTACT.source as { properties: MappingProperty[] }).properties) }])).toBe(false)
    expect(sameMappingProperties([HOME], [{ name: 'Home', source: build(always, [{ name: 'street', source: path('home', 'city') }, { name: 'city', source: path('home', 'street') }, { name: 'postcode', source: path('home', 'postcode') }]) }])).toBe(false)
  })
})
