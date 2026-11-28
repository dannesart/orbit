// Phase 4.1, Orbit.Console v2: v1's very behaviour for composed Definitions too. The boundary
// resolves the complete pinned contract and validates the information with the one validator;
// Console v2 shows exactly what it receives and passes it on unchanged, with the same Definition
// version. Console v1 stays exactly as published: flat contracts only.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { type Data, type DefinitionVersion, type Field, defineVersion, refOf, validate } from '../shared/features/definitions'
import { type Catalog, type PassThroughFeature, contractCompatibility, invoke, orbitConsole, orbitConsoleV2 } from '../shared/features/features'
import { APPLICANT as SAMPLE, CONSOLES, DEFINITIONS, PINS, featureKey } from '../app/dev/features/experiment'

const W = 'ws-a'
const text = (name: string, optional = false): Field => (optional ? { name, type: 'string', optional: true } : { name, type: 'string' })
const ADDRESS_1 = defineVersion({ id: 'address', version: 1, name: 'Address', workspaceId: W, fields: [text('street'), text('city'), text('postcode', true)] })
const ADDRESS_2 = defineVersion({ id: 'address', version: 2, name: 'Address', workspaceId: W, fields: [text('street'), text('city'), text('postcode', true), text('country')] })
const THEIR_ADDRESS = defineVersion({ id: 'their-address', version: 1, name: 'Address', workspaceId: 'ws-b', fields: [text('city')] })
const resolver = (...vs: DefinitionVersion[]) => (r: { id: string; version: number }) => vs.find((v) => v.id === r.id && v.version === r.version) ?? null
const FLAT = defineVersion({ id: 'name', version: 1, name: 'Name', workspaceId: W, fields: [text('firstName'), text('nickname', true)] })
const APPLICANT = defineVersion({
  id: 'applicant', version: 1, name: 'Applicant', workspaceId: W,
  fields: [
    text('firstName'),
    { name: 'contact', type: 'object', optional: true, fields: [text('email'), { name: 'mail', type: 'reference', definition: { id: 'address', version: 1 }, optional: true }] },
    { name: 'home', type: 'reference', definition: { id: 'address', version: 1 } },
    { name: 'previous', type: 'reference', definition: { id: 'address', version: 1 }, optional: true },
    { name: 'preferences', type: 'object', optional: true, fields: [text('tone', true)] },
  ],
}, resolver(ADDRESS_1))
// Forged: defineVersion refuses to make it (another workspace's Definition can't be referenced), so the boundary must refuse it too.
const REF_ONLY: DefinitionVersion = Object.freeze({ id: 'ref-only', version: 1, name: 'Ref only', workspaceId: W, fields: [{ name: 'home', type: 'reference', definition: { id: 'their-address', version: 1 } }] })

const ADA: Data = {
  firstName: 'Ada',
  contact: { email: 'ada@example.com', mail: { street: '12 St James’s Square', city: 'London', postcode: 'SW1Y' } },
  home: { street: 'Ockham Park', city: 'Ockham' },
  preferences: {},
}
const catalog = (definitions: DefinitionVersion[], definition: DefinitionVersion, data: unknown): Catalog => ({
  definitions,
  records: [{ id: 'r', workspaceId: W, definition: refOf(definition), data: data as Data }],
  mappings: [],
})
const watched = (feature: PassThroughFeature) => {
  const seen = { ran: false }
  return { seen, feature: { ...feature, run: (input: Data, ctx: Parameters<PassThroughFeature['run']>[1]) => { seen.ran = true; return feature.run(input, ctx) } } as PassThroughFeature }
}
const run = (feature: PassThroughFeature, definitions: DefinitionVersion[], definition: DefinitionVersion, data: unknown) =>
  invoke(catalog(definitions, definition, data), { workspaceId: W, feature, input: { record: 'r' } })

describe('Console v1 stays exactly as published', () => {
  it('passes flat information on, unchanged, naming v1', () => {
    const result = run(orbitConsole, [FLAT], FLAT, { firstName: 'Ada' })
    expect(result.evidence).toMatchObject({ feature: { id: 'orbit.console', version: 1 }, outcome: { kind: 'succeeded' }, output: { definition: { id: 'name', version: 1 } } })
    expect(result.output!.data).toEqual({ firstName: 'Ada' })
    expect(result.observations).toEqual([{ firstName: 'Ada' }])
  })

  it('refuses composed contracts before running, naming every local object and reference', () => {
    expect(orbitConsole).toMatchObject({ localObjects: 'unsupported', references: 'unsupported' })
    const { seen, feature } = watched(orbitConsole)
    const result = run(feature, [APPLICANT, ADDRESS_1], APPLICANT, ADA)
    expect(result.evidence.outcome).toEqual({
      kind: 'not_attempted', reason: 'unsupported_contract', definition: { id: 'applicant', version: 1 },
      paths: [['contact'], ['preferences'], ['contact', 'mail'], ['home'], ['previous']],
    })
    expect(seen.ran).toBe(false)
    expect(result.observations).toEqual([])
  })
})

describe('Console v2 accepts flat and composed contracts', () => {
  it('declares it, and is v1’s very behaviour', () => {
    expect(orbitConsoleV2).toMatchObject({ id: 'orbit.console', version: 2, contract: 'pass-through', localObjects: 'supported', references: 'supported' })
    expect(orbitConsoleV2.run).toBe(orbitConsole.run)
    expect(contractCompatibility(orbitConsoleV2, APPLICANT)).toEqual([])
  })

  it('passes flat information on exactly as v1 does', () => {
    const v1 = run(orbitConsole, [FLAT], FLAT, { firstName: 'Ada' })
    const v2 = run(orbitConsoleV2, [FLAT], FLAT, { firstName: 'Ada' })
    expect(v2.output).toEqual(v1.output)
    expect(v2.observations).toEqual(v1.observations)
    expect(v2.evidence.feature).toEqual({ id: 'orbit.console', version: 2 })
  })

  it('passes nested information through exactly: nested values, an absent optional object and reference, an empty object', () => {
    const result = run(orbitConsoleV2, [APPLICANT, ADDRESS_1], APPLICANT, ADA)
    expect(result.evidence).toEqual({
      workspaceId: W, feature: { id: 'orbit.console', version: 2 },
      input: { record: 'r', definition: { id: 'applicant', version: 1 } },
      output: { definition: { id: 'applicant', version: 1 } },
      outcome: { kind: 'succeeded' },
    })
    expect(result.output!.definition).toEqual({ id: 'applicant', version: 1 })
    expect(result.output!.data).toEqual(ADA)
    expect(result.observations).toEqual([ADA])
    // Nothing invented: absent stays absent (no key at all), empty stays empty.
    expect(Object.hasOwn(result.output!.data, 'previous')).toBe(false)
    expect(Object.hasOwn(result.output!.data.home as object, 'postcode')).toBe(false)
    expect(result.output!.data.preferences).toEqual({})
    expect(Object.isFrozen((result.output!.data.contact as Data).mail)).toBe(true)
  })

  it('passes on with optional objects absent altogether', () => {
    const minimal = { firstName: 'Ada', home: { street: 'Ockham Park', city: 'Ockham' } }
    expect(run(orbitConsoleV2, [APPLICANT, ADDRESS_1], APPLICANT, minimal).output!.data).toEqual(minimal)
  })

  it('refuses invalid nested information before running, at exactly its path', () => {
    const { seen, feature } = watched(orbitConsoleV2)
    const wrong = { ...ADA, contact: { email: 'ada@example.com', mail: { street: 'x', city: 7 } }, home: { street: 'x' }, preferences: null }
    expect(run(feature, [APPLICANT, ADDRESS_1], APPLICANT, wrong).evidence.outcome).toEqual({
      kind: 'not_attempted', reason: 'invalid_input', issues: [
        { problem: 'wrong_type', path: ['contact', 'mail', 'city'], expected: 'string', actual: 'number' },
        { problem: 'missing', path: ['home', 'city'], expected: 'string' },
        { problem: 'wrong_type', path: ['preferences'], expected: 'object', actual: 'null' },
      ],
    })
    expect(seen.ran).toBe(false)
  })

  it('says apart a contract that doesn’t resolve here: a missing dependency, or another workspace’s', () => {
    const missing = run(orbitConsoleV2, [APPLICANT], APPLICANT, ADA).evidence.outcome
    expect(missing).toMatchObject({ kind: 'not_attempted', reason: 'invalid_contract', definition: { id: 'applicant', version: 1 } })
    expect(missing.kind === 'not_attempted' && missing.reason === 'invalid_contract' && missing.issues.map((i) => i.problem)).toContain('unresolved_reference')
    const theirs = run(orbitConsoleV2, [REF_ONLY, THEIR_ADDRESS], REF_ONLY, { home: { city: 'x' } }).evidence.outcome
    expect(theirs).toEqual({ kind: 'not_attempted', reason: 'invalid_contract', definition: { id: 'ref-only', version: 1 }, issues: [{ problem: 'unresolved_reference', path: ['home'], definition: { id: 'their-address', version: 1 } }] })
  })

  it('resolves exactly the pinned version: never another version of the same Definition', () => {
    // Only v2 of Address is here: v1, the one pinned, doesn't resolve; nothing falls back.
    const onlyNewer = run(orbitConsoleV2, [APPLICANT, ADDRESS_2], APPLICANT, ADA).evidence.outcome
    expect(onlyNewer).toMatchObject({ reason: 'invalid_contract' })
    // With both, the data is judged by v1: v2's extra required property is no part of it.
    const withCountry = { ...ADA, home: { street: 'Ockham Park', city: 'Ockham', country: 'UK' } }
    expect(run(orbitConsoleV2, [APPLICANT, ADDRESS_1, ADDRESS_2], APPLICANT, withCountry).evidence.outcome)
      .toEqual({ kind: 'not_attempted', reason: 'invalid_input', issues: [{ problem: 'unexpected', path: ['home', 'country'] }] })
  })

  it('still fails, apart from refusals, when a Feature breaks its contract', () => {
    const swaps: PassThroughFeature = { ...orbitConsoleV2, id: 'playground.console-that-swaps', run: (input) => ({ ...input, home: { street: 'x', city: 'y' } }) }
    expect(run(swaps, [APPLICANT, ADDRESS_1], APPLICANT, ADA).evidence.outcome).toEqual({ kind: 'failed', reason: 'pass_through_broken' })
  })
})

describe('Console v2 in the Designer', () => {
  const root = join(import.meta.dirname, '..')
  const read = (p: string) => readFileSync(join(root, p), 'utf8')

  it('is chosen explicitly, by exact version, beside v1', () => {
    expect(CONSOLES.slice(0, 2).map((c) => [featureKey(c.feature), c.label])).toEqual([['orbit.console@1', 'Orbit.Console v1'], ['orbit.console@2', 'Orbit.Console v2']])
    expect(CONSOLES[1]!.feature).toBe(orbitConsoleV2)
  })

  it('offers a composed sample whose example data is used only on purpose', () => {
    const pin = PINS.find((p) => p.key === 'applicant')!
    expect(pin.ref).toEqual({ id: SAMPLE.id, version: SAMPLE.version })
    const all = (r: { id: string; version: number }) => DEFINITIONS.find((d) => d.id === r.id && d.version === r.version) ?? null
    expect(validate(SAMPLE, pin.example, all)).toEqual([])
    expect(read('app/dev/designer/SpatialDesigner.vue')).toMatch(/v-if="pin\.example && recordText !== JSON\.stringify\(pin\.example, null, 2\)"[^>]*@click="recordText = JSON\.stringify\(pin\.example, null, 2\)"/)
  })

  it('shows the actual observation as a tree, with raw JSON one click away', () => {
    const result = read('app/dev/designer/RunResult.vue')
    expect(result).toContain('const raw = ref(false)')
    expect(result).toMatch(/<pre v-if="raw"[^>]*>\{\{ json\(seen\) \}\}<\/pre>\s*<template v-else>[\s\S]*?<ObservedTree :data="seen"/)
    const tree = read('app/dev/designer/ObservedTree.vue')
    // Folded until opened; absent and empty said as they are, never filled in.
    expect(tree).toContain('const open = ref(new Set<string>())')
    expect(tree).toContain('<span v-else class="text-xs text-slate-400">absent</span>')
    expect(tree).toContain(": 'empty' }}")
  })
})
