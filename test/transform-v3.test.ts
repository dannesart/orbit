// Phase 4.2, Orbit.Transform v3 (provisional): nested reads. Mappings read values inside local
// objects and referenced Definitions by structured path; types and absence come from the resolved
// input contract; the output stays flat. v1 and v2 stay exactly as published.
import { describe, expect, it } from 'vitest'
import { type Data, type DefinitionVersion, type Field, defineVersion, refOf } from '../shared/features/definitions'
import { type Catalog, type MappingFeature, contractCompatibility, invoke, mappingCompatibility, orbitConsoleV2, orbitTransformV1, orbitTransformV2, orbitTransformV3 } from '../shared/features/features'
import { type Expression, type Mapping, type MappingProperty, checkMapping, checkNestedMapping, evaluatePresent, readablePaths, resolvePath, sameMappingProperties } from '../shared/features/mappings'
import { A1, B1, INITIAL_DATA, INITIAL_MAPPING, RECORD_ID, WORKSPACE, describeOutcome, outcomeIssues } from '../app/dev/features/experiment'

const W = WORKSPACE
const s = (name: string, optional = false): Field => (optional ? { name, type: 'string', optional: true } : { name, type: 'string' })
const ADDRESS = defineVersion({ id: 'addr', version: 1, name: 'Address', workspaceId: W, fields: [s('street'), s('city'), s('postcode', true)] })
const only = (...vs: DefinitionVersion[]) => (r: { id: string; version: number }) => vs.find((v) => v.id === r.id && v.version === r.version) ?? null
const PERSON = defineVersion({
  id: 'person', version: 1, name: 'Person', workspaceId: W,
  fields: [
    s('firstName'),
    s('a.b'),
    { name: 'flags', type: 'object', fields: [{ name: 'active', type: 'boolean' }, { name: 'count', type: 'number' }, s('note')] },
    { name: 'contact', type: 'object', optional: true, fields: [
      s('email'), s('phone', true),
      { name: 'details', type: 'object', fields: [{ name: 'deeper', type: 'object', optional: true, fields: [s('deep')] }] },
      { name: 'mail', type: 'reference', definition: refOf(ADDRESS), optional: true },
    ] },
    { name: 'home', type: 'reference', definition: refOf(ADDRESS) },
  ],
}, only(ADDRESS))
const resolve = only(ADDRESS, PERSON)
const FULL: Data = {
  'firstName': 'Ada', 'a.b': 'dotted',
  'flags': { active: false, count: 0, note: '' },
  'contact': { email: 'ada@example.com', details: { deeper: { deep: 'down' } }, mail: { street: 'St James’s Square', city: 'London' } },
  'home': { street: 'Ockham Park', city: 'Ockham' },
}
const BARE: Data = { 'firstName': 'Ada', 'a.b': 'x', 'flags': { active: true, count: 2, note: 'n' }, 'home': { street: 'Ockham Park', city: 'Ockham' } }
const out = (...fields: Field[]) => defineVersion({ id: `out-${fields.map((f) => f.name).join('-')}`, version: 1, name: 'Out', workspaceId: W, fields })
const path = (...p: string[]): Expression => ({ kind: 'path', path: p })
const prop = (name: string): Expression => ({ kind: 'property', name })

const mappingOf = (properties: MappingProperty[], output: DefinitionVersion, input: DefinitionVersion = PERSON): Mapping =>
  Object.freeze({ id: 'm', version: 1, workspaceId: W, from: refOf(input), to: refOf(output), properties })
const run = (feature: MappingFeature, properties: MappingProperty[], output: DefinitionVersion, data: Data = FULL, input: DefinitionVersion = PERSON, extra: DefinitionVersion[] = [ADDRESS]) => {
  const mapping = mappingOf(properties, output, input)
  const catalog: Catalog = { definitions: [input, output, ...extra], records: [{ id: 'r', workspaceId: W, definition: refOf(input), data }], mappings: [mapping] }
  return invoke(catalog, { workspaceId: W, feature, input: { record: 'r' }, mapping: { id: 'm', version: 1 } })
}
const check = (properties: MappingProperty[], output?: DefinitionVersion, r = resolve) => checkNestedMapping({ properties }, PERSON, output, { resolve: r }).issues

describe('Transform v3 is declared for what it is', () => {
  it('is provisional, reads nested sources, and accepts composed contracts on both sides', () => {
    expect(orbitTransformV3).toMatchObject({ id: 'orbit.transform', version: 3, provisional: true, sources: 'nested', absence: 'omitted', localObjects: 'supported', references: 'supported' })
    expect(contractCompatibility(orbitTransformV3, PERSON, 'input')).toEqual([])
    // Since Phase 4.3 it builds objects too, so composed output is accepted.
    expect(contractCompatibility(orbitTransformV3, PERSON, 'output')).toEqual([])
    expect([orbitTransformV1, orbitTransformV2].map((f) => [f.sources, f.provisional])).toEqual([['flat', undefined], ['flat', undefined]])
  })
})

describe('Existing flat Mappings across versions', () => {
  const flat = (feature: MappingFeature) => {
    const catalog: Catalog = { definitions: [A1, B1], records: [{ id: RECORD_ID, workspaceId: W, definition: refOf(A1), data: INITIAL_DATA }], mappings: [INITIAL_MAPPING] }
    return invoke(catalog, { workspaceId: W, feature, input: { record: RECORD_ID }, mapping: { id: INITIAL_MAPPING.id, version: 1 } })
  }
  it('makes exactly the same output with v1, v2 and v3, each named in its own evidence', () => {
    const results = [orbitTransformV1, orbitTransformV2, orbitTransformV3].map(flat)
    expect(results.map((r) => r.output!.data)).toEqual([{ fullName: 'Ada Lovelace' }, { fullName: 'Ada Lovelace' }, { fullName: 'Ada Lovelace' }])
    expect(results.map((r) => r.evidence.feature.version)).toEqual([1, 2, 3])
    expect(results.every((r) => r.evidence.mapping!.version === 1)).toBe(true)
  })
  it('keeps v1’s and v2’s problems as they were; v3 locates the same problem in two parts', () => {
    const wrong = { properties: [{ name: 'fullName', source: prop('middleName') }] }
    expect(mappingCompatibility(orbitTransformV2, wrong, A1, B1)).toEqual([{ problem: 'unknown_property', path: ['fullName'], name: 'middleName' }])
    expect(mappingCompatibility(orbitTransformV3, wrong, A1, B1)).toEqual([{ problem: 'unknown_property', at: { output: ['fullName'], expression: [] }, name: 'middleName' }])
  })
})

describe('Nested reads', () => {
  const target = out(s('a'), s('b'), s('c'), s('d'))
  it('read through local objects, references, and both mixed, deeply', () => {
    const properties = [
      { name: 'a', source: path('flags', 'note') },
      { name: 'b', source: path('home', 'city') },
      { name: 'c', source: path('contact', 'mail', 'city') },
      { name: 'd', source: path('contact', 'details', 'deeper', 'deep') },
    ]
    expect(check(properties, out(s('a'), s('b'), s('c', true), s('d', true)))).toEqual([])
    const result = run(orbitTransformV3, properties, out(s('a'), s('b'), s('c', true), s('d', true)))
    expect(result.evidence.outcome).toEqual({ kind: 'succeeded' })
    expect(result.output!.data).toEqual({ a: '', b: 'Ockham', c: 'London', d: 'down' })
    expect(target.fields).toHaveLength(4)
  })

  it('treats a dotted name as one name, never as a path', () => {
    expect(run(orbitTransformV3, [{ name: 'a', source: prop('a.b') }], out(s('a'))).output!.data).toEqual({ a: 'dotted' })
    expect(check([{ name: 'a', source: path('a', 'b') }], out(s('a')))).toEqual([{ problem: 'unknown_path_property', at: { output: ['a'], expression: [] }, step: 0, name: 'a' }])
  })

  it('matches names exactly, case included', () => {
    expect(check([{ name: 'a', source: path('home', 'City') }], out(s('a')))).toEqual([{ problem: 'unknown_path_property', at: { output: ['a'], expression: [] }, step: 1, name: 'City' }])
    expect(resolvePath(PERSON, ['Home', 'city'], resolve)).toEqual({ problem: 'unknown_path_property', step: 0 })
  })

  it('refuses unknown and malformed paths, and paths that end at or go past the wrong thing', () => {
    const at = { output: ['a'], expression: [] }
    const one = (source: unknown) => check([{ name: 'a', source: source as Expression }], out(s('a')))
    expect(one(path('nobody', 'city'))).toEqual([{ problem: 'unknown_path_property', at, step: 0, name: 'nobody' }])
    expect(one(path('home'))).toEqual([{ problem: 'malformed_path', at }])
    expect(one({ kind: 'path', path: 'home.city' })).toEqual([{ problem: 'malformed_path', at }])
    expect(one({ kind: 'path', path: ['home', 7] })).toEqual([{ problem: 'malformed_path', at }])
    expect(one({ kind: 'path' })).toEqual([{ problem: 'malformed_path', at }])
    expect(one(path('home', 'city', 'x'))).toEqual([{ problem: 'path_through_value', at, step: 1 }])
    expect(one(path('contact', 'details'))).toEqual([{ problem: 'path_to_object', at }])
    expect(one(prop('home'))).toEqual([{ problem: 'object_property', at, name: 'home' }])
  })

  it('refuses a path through a referenced version that can’t be found; the boundary refuses the contract first', () => {
    expect(check([{ name: 'a', source: path('home', 'city') }], out(s('a')), only(PERSON))).toEqual([{ problem: 'unresolved_path', at: { output: ['a'], expression: [] }, step: 0 }])
    expect(run(orbitTransformV3, [{ name: 'a', source: path('home', 'city') }], out(s('a')), FULL, PERSON, []).evidence.outcome)
      .toMatchObject({ kind: 'not_attempted', reason: 'invalid_contract', definition: { id: 'person', version: 1 } })
  })

  it('locates a problem exactly: the output property, then the place in its source', () => {
    const join = { kind: 'call', fn: 'join', args: [{ kind: 'list', items: [prop('firstName'), path('home', 'town')] }, { kind: 'literal', value: ' ' }] } as Expression
    expect(check([{ name: 'a', source: join }], out(s('a')))).toEqual([{ problem: 'unknown_path_property', at: { output: ['a'], expression: ['join', 0, 1] }, step: 1, name: 'town' }])
    const outcome = run(orbitTransformV3, [{ name: 'a', source: join }], out(s('a'))).evidence.outcome
    expect(outcomeIssues(outcome)).toEqual(['a › join › argument 1 › item 2: The input has no property “town” there.'])
    expect(describeOutcome(outcome)).toMatch(/Mapping/)
  })
})

describe('Types and absence from the resolved contract', () => {
  it('lists every readable value with what may make it absent: the leaf, a parent, or several', () => {
    const readable = Object.fromEntries(readablePaths(PERSON, resolve).map((r) => [r.path.join('/'), [r.type, r.optional.map((p) => p.join('/'))]]))
    expect(readable).toEqual({
      'firstName': ['string', []],
      'a.b': ['string', []],
      'flags/active': ['boolean', []],
      'flags/count': ['number', []],
      'flags/note': ['string', []],
      'contact/email': ['string', ['contact']],
      'contact/phone': ['string', ['contact', 'contact/phone']],
      'contact/details/deeper/deep': ['string', ['contact', 'contact/details/deeper']],
      'contact/mail/street': ['string', ['contact', 'contact/mail']],
      'contact/mail/city': ['string', ['contact', 'contact/mail']],
      'contact/mail/postcode': ['string', ['contact', 'contact/mail', 'contact/mail/postcode']],
      'home/street': ['string', []],
      'home/city': ['string', []],
      'home/postcode': ['string', ['home/postcode']],
    })
  })

  it('refuses a required output fed by something that may be absent, naming every optional property on the way', () => {
    expect(check([{ name: 'a', source: path('contact', 'phone') }], out(s('a')))).toEqual([
      { problem: 'may_be_absent', at: { output: ['a'], expression: [] }, optional: [['contact'], ['contact', 'phone']] },
    ])
    expect(check([{ name: 'a', source: path('home', 'postcode') }], out(s('a', true)))).toEqual([])
    expect(check([{ name: 'a', source: path('flags', 'note') }], out(s('a')))).toEqual([])
  })

  it('leaves an optional output out when its source is absent, through a missing parent or a missing leaf', () => {
    const properties = [{ name: 'email', source: path('contact', 'email') }, { name: 'post', source: path('home', 'postcode') }, { name: 'first', source: prop('firstName') }]
    const target = out(s('email', true), s('post', true), s('first'))
    expect(run(orbitTransformV3, properties, target, BARE).output!.data).toEqual({ first: 'Ada' })
    expect(run(orbitTransformV3, properties, target, FULL).output!.data).toEqual({ email: 'ada@example.com', first: 'Ada' })
  })

  it('carries absence through functions as v2 does: one absent part leaves the whole value out', () => {
    const joined = { kind: 'call', fn: 'join', args: [{ kind: 'list', items: [prop('firstName'), { kind: 'call', fn: 'trim', args: [path('contact', 'email')] }] }, { kind: 'literal', value: ' ' }] } as Expression
    expect(evaluatePresent(joined, BARE)).toEqual({ present: false })
    expect(evaluatePresent(joined, FULL)).toEqual({ present: true, value: 'Ada ada@example.com' })
    expect(check([{ name: 'a', source: joined }], out(s('a')))).toEqual([{ problem: 'may_be_absent', at: { output: ['a'], expression: [] }, optional: [['contact']] }])
  })

  it('keeps false, zero and empty text as values; null is never absence', () => {
    const properties = [{ name: 'on', source: path('flags', 'active') }, { name: 'n', source: path('flags', 'count') }, { name: 't', source: path('flags', 'note') }]
    const target = out({ name: 'on', type: 'boolean' }, { name: 'n', type: 'number' }, s('t'))
    expect(run(orbitTransformV3, properties, target).output!.data).toEqual({ on: false, n: 0, t: '' })
    expect(run(orbitTransformV3, properties, target, { ...FULL, contact: null } as unknown as Data).evidence.outcome)
      .toEqual({ kind: 'not_attempted', reason: 'invalid_input', issues: [{ problem: 'wrong_type', path: ['contact'], expected: 'object', actual: 'null' }] })
    expect(() => evaluatePresent(path('contact', 'email'), { contact: null } as unknown as Data)).toThrow()
  })
})

describe('Compatibility, before execution', () => {
  it('older versions refuse a nested source as one they don’t have, and refuse composed inputs anyway', () => {
    const properties = [{ name: 'a', source: path('home', 'city') }]
    for (const f of [orbitTransformV1, orbitTransformV2]) {
      expect(mappingCompatibility(f, { properties }, PERSON, out(s('a')))).toEqual([{ problem: 'unsupported_source', path: ['a'] }])
      expect(run(f, properties, out(s('a'))).evidence.outcome).toMatchObject({ kind: 'not_attempted', reason: 'unsupported_contract', definition: { id: 'person', version: 1 } })
    }
    // On a flat input too, the nested source alone is refused.
    expect(checkMapping({ properties }, A1, B1).issues).toEqual([{ problem: 'unsupported_source', path: ['a'] }])
  })

  it('at the top level, a required object nothing builds fails after running, as a flat property always has', () => {
    const composedOut = defineVersion({ id: 'out-composed', version: 1, name: 'Out', workspaceId: W, fields: [{ name: 'where', type: 'reference', definition: refOf(ADDRESS) }] }, only(ADDRESS))
    expect(run(orbitTransformV3, [], composedOut).evidence.outcome).toEqual({ kind: 'failed', reason: 'invalid_output', issues: [{ problem: 'missing', path: ['where'], expected: 'object' }] })
  })

  it('evidence of an earlier run keeps the version that ran when the step changes version', () => {
    const properties = [{ name: 'a', source: prop('firstName') }]
    const flatInput = defineVersion({ id: 'flat', version: 1, name: 'Flat', workspaceId: W, fields: [s('firstName')] })
    const earlier = run(orbitTransformV2, properties, out(s('a')), { firstName: 'Ada' }, flatInput, [])
    const later = run(orbitTransformV3, properties, out(s('a')), { firstName: 'Ada' }, flatInput, [])
    expect([earlier.evidence.feature, later.evidence.feature]).toEqual([{ id: 'orbit.transform', version: 2 }, { id: 'orbit.transform', version: 3 }])
    expect(Object.isFrozen(earlier.evidence)).toBe(true)
    expect(earlier.output!.data).toEqual(later.output!.data)
  })

  it('a Console v2 output can be read by v3 straight on', () => {
    const consoled = invoke({ definitions: [PERSON, ADDRESS], records: [{ id: 'r', workspaceId: W, definition: refOf(PERSON), data: FULL }], mappings: [] }, { workspaceId: W, feature: orbitConsoleV2, input: { record: 'r' } })
    expect(consoled.evidence.outcome).toEqual({ kind: 'succeeded' })
  })
})

describe('Semantic Mapping equality', () => {
  it('compares paths exactly: order of properties is presentation, a path is never a dotted name', () => {
    const a = [{ name: 'x', source: path('home', 'city') }, { name: 'y', source: prop('firstName') }]
    expect(sameMappingProperties(a, [...a].reverse())).toBe(true)
    expect(sameMappingProperties([{ name: 'x', source: path('a', 'b') }], [{ name: 'x', source: prop('a.b') }])).toBe(false)
    expect(sameMappingProperties([{ name: 'x', source: path('home', 'city') }], [{ name: 'x', source: path('home', 'City') }])).toBe(false)
  })
})
