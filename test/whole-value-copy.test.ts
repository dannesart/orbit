// Phase 4.4, whole-value copying in Transform v3 (provisional): a value of exactly the target's
// referenced Definition version, copied as validated. Identity and version decide; never names or
// structures. Local objects are never copied whole. Availability is the existing model.
import { describe, expect, it } from 'vitest'
import { type Data, type DefinitionVersion, type Field, defineVersion, refOf } from '../shared/features/definitions'
import { type Catalog, invoke, mappingCompatibility, orbitTransformV2, orbitTransformV3 } from '../shared/features/features'
import { type Expression, type Mapping, type MappingProperty, checkNestedMapping, evaluatePresent, resolveCopySource, sameMappingProperties } from '../shared/features/mappings'

const W = 'ws-copy'
const s = (name: string, optional = false): Field => (optional ? { name, type: 'string', optional: true } : { name, type: 'string' })
const only = (...vs: DefinitionVersion[]) => (r: { id: string; version: number }) => vs.find((v) => v.id === r.id && v.version === r.version) ?? null
const ADDRESS = defineVersion({ id: 'addr', version: 1, name: 'Address', workspaceId: W, fields: [s('street'), s('city'), s('postcode', true)] })
const ADDRESS_2 = defineVersion({ id: 'addr', version: 2, name: 'Address', workspaceId: W, fields: [s('street'), s('city'), s('postcode', true)] })
const LOOKALIKE = defineVersion({ id: 'addr-lookalike', version: 1, name: 'Address', workspaceId: W, fields: [s('street'), s('city'), s('postcode', true)] })
const NOTE = defineVersion({ id: 'note', version: 1, name: 'Note', workspaceId: W, fields: [s('text', true)] })
const THEIRS = defineVersion({ id: 'their-addr', version: 1, name: 'Address', workspaceId: 'ws-other', fields: [s('street'), s('city')] })
const ref = (name: string, to: DefinitionVersion, optional = false): Field => (optional ? { name, type: 'reference', definition: refOf(to), optional: true } : { name, type: 'reference', definition: refOf(to) })
const INPUT = defineVersion({ id: 'in', version: 1, name: 'In', workspaceId: W, fields: [
  ref('home', ADDRESS),
  { name: 'contact', type: 'object', optional: true, fields: [s('email'), ref('mail', ADDRESS, true), { name: 'box', type: 'object', fields: [ref('inner', ADDRESS)] }] },
  ref('newer', ADDRESS_2), ref('other', LOOKALIKE), ref('note', NOTE),
  { name: 'local', type: 'object', fields: [s('street'), s('city')] },
] }, only(ADDRESS, ADDRESS_2, LOOKALIKE, NOTE))
const OUTPUT = defineVersion({ id: 'out', version: 1, name: 'Out', workspaceId: W, fields: [
  ref('Home', ADDRESS), ref('Mail', ADDRESS, true), ref('Note', NOTE, true),
  { name: 'Box', type: 'object', optional: true, fields: [ref('where', ADDRESS)] },
  { name: 'Local', type: 'object', optional: true, fields: [s('street'), s('city')] },
  s('title', true),
] }, only(ADDRESS, NOTE))
const SELF = defineVersion({ id: 'self', version: 1, name: 'Self', workspaceId: W, fields: [ref('all', INPUT)] }, only(INPUT, ADDRESS, ADDRESS_2, LOOKALIKE, NOTE))
const resolve = only(ADDRESS, ADDRESS_2, LOOKALIKE, NOTE, INPUT, OUTPUT, SELF)
const ALL = [ADDRESS, ADDRESS_2, LOOKALIKE, NOTE, INPUT, OUTPUT, SELF]

const copy = (...from: string[]): Expression => ({ kind: 'copy', from })
const build = (presence: { when: 'always' } | { when: 'present'; source: string[] }, properties: MappingProperty[]): Expression => ({ kind: 'construct', presence, properties })
const HOME: MappingProperty = { name: 'Home', source: copy('home') }
const FULL: Data = {
  home: { street: 'Ockham Park', city: 'Ockham' },
  contact: { email: 'ada@example.com', mail: { street: 'St James’s Square', city: 'London', postcode: 'SW1Y' }, box: { inner: { street: 'Box', city: 'B' } } },
  newer: { street: 'N', city: 'N' }, other: { street: 'O', city: 'O' }, note: {},
  local: { street: 'L', city: 'L' },
}
const BARE: Data = { home: { street: 'Ockham Park', city: 'Ockham' }, newer: { street: 'N', city: 'N' }, other: { street: 'O', city: 'O' }, note: { text: 'hi' }, local: { street: 'L', city: 'L' } }
const at = (output: string[], expression: (string | number)[] = []) => ({ output, expression })
const check = (properties: MappingProperty[], output = OUTPUT, r = resolve) => checkNestedMapping({ properties }, INPUT, output, { resolve: r }).issues
const run = (properties: MappingProperty[], data: Data = FULL, output = OUTPUT, definitions = ALL, input = INPUT, feature = orbitTransformV3) => {
  const mapping: Mapping = Object.freeze({ id: 'm', version: 1, workspaceId: W, from: refOf(input), to: refOf(output), properties })
  const catalog: Catalog = { definitions, records: [{ id: 'r', workspaceId: W, definition: refOf(input), data }], mappings: [mapping] }
  return invoke(catalog, { workspaceId: W, feature, input: { record: 'r' }, mapping: { id: 'm', version: 1 } })
}

describe('Exact identity and version decide', () => {
  it('copies a value of exactly the same Definition version, as it is: absent optional properties stay absent', () => {
    expect(check([HOME])).toEqual([])
    expect(run([HOME]).output!.data).toEqual({ Home: { street: 'Ockham Park', city: 'Ockham' } })
  })

  it('never copies another version of the same Definition', () => {
    expect(check([{ name: 'Home', source: copy('newer') }])).toEqual([{ problem: 'copy_identity_mismatch', at: at(['Home']), expected: { id: 'addr', version: 1 }, actual: { id: 'addr', version: 2 } }])
  })

  it('never copies another Definition, whatever it contains', () => {
    expect(check([{ name: 'Home', source: copy('other') }])).toEqual([{ problem: 'copy_identity_mismatch', at: at(['Home']), expected: { id: 'addr', version: 1 }, actual: { id: 'addr-lookalike', version: 1 } }])
  })

  it('never treats a local object as a referenced value, either way', () => {
    expect(check([HOME, { name: 'Box', source: build({ when: 'always' }, [{ name: 'where', source: copy('contact', 'box') }]) }]))
      .toEqual([{ problem: 'copy_from_local_object', at: at(['Box', 'where']) }])
    expect(check([HOME, { name: 'Local', source: copy('local') }])).toEqual([{ problem: 'copy_into_local_object', at: at(['Local']) }])
    expect(check([HOME, { name: 'title', source: copy('home') }])).toEqual([{ problem: 'copy_into_value', at: at(['title']) }])
    expect(check([HOME, { name: 'Mail', source: copy('home', 'city') }])).toEqual([{ problem: 'copy_from_value', at: at(['Mail']) }])
  })

  it('copies the whole input when the target is exactly its Definition version', () => {
    const r = run([{ name: 'all', source: copy() }], FULL, SELF)
    expect(r.evidence.outcome).toEqual({ kind: 'succeeded' })
    expect(r.output!.data).toEqual({ all: FULL })
    expect(checkNestedMapping({ properties: [{ name: 'Home', source: copy() }] }, INPUT, OUTPUT, { resolve }).issues)
      .toEqual([{ problem: 'copy_identity_mismatch', at: at(['Home']), expected: { id: 'addr', version: 1 }, actual: { id: 'in', version: 1 } }])
  })
})

describe('Availability', () => {
  it('refuses a required property from a source that may be absent; leaves an optional one out', () => {
    expect(check([{ name: 'Home', source: copy('contact', 'mail') }])).toEqual([{ problem: 'may_be_absent', at: at(['Home']), optional: [['contact'], ['contact', 'mail']] }])
    expect(check([{ name: 'Home', source: copy('contact', 'box', 'inner') }])).toEqual([{ problem: 'may_be_absent', at: at(['Home']), optional: [['contact']] }])
    const mail = [HOME, { name: 'Mail', source: copy('contact', 'mail') }]
    expect(check(mail)).toEqual([])
    expect(run(mail).output!.data.Mail).toEqual({ street: 'St James’s Square', city: 'London', postcode: 'SW1Y' })
    expect(run(mail, BARE).output!.data).not.toHaveProperty('Mail')
  })

  it('takes a presence guarantee within its construction only', () => {
    const box = { name: 'Box', source: build({ when: 'present', source: ['contact', 'mail'] }, [{ name: 'where', source: copy('contact', 'mail') }]) }
    expect(check([HOME, box])).toEqual([])
    expect(run([HOME, box]).output!.data.Box).toEqual({ where: { street: 'St James’s Square', city: 'London', postcode: 'SW1Y' } })
    expect(run([HOME, box], BARE).output!.data).not.toHaveProperty('Box')
    // A required sibling gets no guarantee.
    const sibling = { name: 'Box', source: build({ when: 'present', source: ['contact', 'mail'] }, [{ name: 'where', source: copy('contact', 'box', 'inner') }]) }
    expect(check([{ name: 'Home', source: copy('contact', 'mail') }, sibling])).toEqual([{ problem: 'may_be_absent', at: at(['Home']), optional: [['contact'], ['contact', 'mail']] }])
  })

  it('copies an empty referenced value as a present, empty value; null is never absence', () => {
    expect(run([HOME, { name: 'Note', source: copy('note') }]).output!.data.Note).toEqual({})
    expect(run([HOME], { ...FULL, contact: null } as unknown as Data).evidence.outcome).toMatchObject({ kind: 'not_attempted', reason: 'invalid_input' })
  })
})

describe('Resolution and isolation', () => {
  it('refuses when a dependency can’t be found, before anything runs', () => {
    expect(check([HOME], OUTPUT, only(INPUT, OUTPUT, NOTE))).toEqual([{ problem: 'unresolved_path', at: at(['Home']), step: 0 }])
    expect(run([HOME], FULL, OUTPUT, [INPUT, OUTPUT, NOTE, ADDRESS_2, LOOKALIKE]).evidence.outcome).toMatchObject({ kind: 'not_attempted', reason: 'invalid_contract' })
  })

  it('never reaches another workspace’s Definition', () => {
    const forged: DefinitionVersion = Object.freeze({ id: 'forged', version: 1, name: 'Forged', workspaceId: W, fields: [ref('home', THEIRS)] })
    expect(resolveCopySource(forged, ['home'], only(THEIRS))).toEqual({ problem: 'unresolved_path', step: 0 })
  })
})

describe('Immutability, equality, locations and versions', () => {
  it('hands on a deeply frozen value that is no alias of the input', () => {
    const data = JSON.parse(JSON.stringify(FULL)) as Data
    const r = run([HOME, { name: 'Mail', source: copy('contact', 'mail') }], data)
    const home = (r.output!.data as Record<string, object>).Home!
    expect(Object.isFrozen(home)).toBe(true)
    expect(home).not.toBe((data as Record<string, object>).home)
    expect(() => { (home as Record<string, string>).city = 'x' }).toThrow()
    expect((data as Record<string, Record<string, string>>).home!.city).toBe('Ockham')
  })

  it('never takes a copy for a construction, or one path for another', () => {
    const built = { name: 'Home', source: build({ when: 'always' }, [{ name: 'street', source: { kind: 'path', path: ['home', 'street'] } }, { name: 'city', source: { kind: 'path', path: ['home', 'city'] } }]) }
    expect(sameMappingProperties([HOME], [built])).toBe(false)
    expect(sameMappingProperties([HOME], [{ name: 'Home', source: copy('contact', 'mail') }])).toBe(false)
    expect(sameMappingProperties([HOME, { name: 'Mail', source: copy('contact', 'mail') }], [{ name: 'Mail', source: copy('contact', 'mail') }, HOME])).toBe(true)
  })

  it('locates problems exactly, a copy inside an expression included', () => {
    expect(check([HOME, { name: 'title', source: { kind: 'call', fn: 'trim', args: [copy('home')] } }])).toEqual([{ problem: 'copy_in_expression', at: at(['title'], ['trim', 0]) }])
    expect(check([HOME, { name: 'Mail', source: { kind: 'copy', from: 'contact.mail' } as unknown as Expression }])).toEqual([{ problem: 'malformed_copy', at: at(['Mail']) }])
  })

  it('refuses an incomplete Mapping before running, at every level', () => {
    expect(check([])).toEqual([{ problem: 'missing_output_property', at: at(['Home']), name: 'Home' }])
  })

  it('older versions refuse a copy as a source they don’t have; evidence names the version that ran', () => {
    expect(mappingCompatibility(orbitTransformV2, { properties: [HOME] }, INPUT, OUTPUT)).toEqual([{ problem: 'unsupported_source', path: ['Home'] }])
    expect(run([HOME], FULL, OUTPUT, ALL, INPUT, orbitTransformV2).evidence).toMatchObject({ feature: { id: 'orbit.transform', version: 2 }, outcome: { reason: 'unsupported_contract' } })
    expect(run([HOME]).evidence).toMatchObject({ feature: { id: 'orbit.transform', version: 3 }, mapping: { id: 'm', version: 1 }, outcome: { kind: 'succeeded' } })
  })

  it('evaluates as the Transform runs', () => {
    expect(evaluatePresent(copy('contact', 'mail'), BARE)).toEqual({ present: false })
    expect(evaluatePresent(copy('home'), FULL)).toEqual({ present: true, value: FULL.home })
  })
})
