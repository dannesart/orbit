// Phase 4.0, compatibility groundwork: Transform v1 and v2 refuse, before running, any source the
// language doesn't have (an unknown kind, such as one a later version may understand, or a
// malformed one), never crashing and never reinterpreting it. Sources they support mean exactly
// what they always meant. And the location type for future nested Mapping problems keeps the
// output property apart from the place in its source.
import { describe, expect, expectTypeOf, it } from 'vitest'
import { type Data, deepFreeze, refOf } from '../shared/features/definitions'
import { type Catalog, type MappingFeature, invoke, orbitConsole, orbitTransformV1, orbitTransformV2 } from '../shared/features/features'
import { type Expression, type ExpressionPath, type Mapping, type MappingProblemLocation, checkMapping, formatSource } from '../shared/features/mappings'
import { A1, B1, INITIAL_DATA, INITIAL_MAPPING, RECORD_ID, WORKSPACE, describeMappingIssue } from '../app/dev/features/experiment'
import type { PropertyPath } from '../shared/features/definitions'

const withSource = (source: unknown): Mapping => deepFreeze({ ...INITIAL_MAPPING, version: 9, properties: [{ name: 'fullName', source: source as Expression }] })
const catalog = (mapping: Mapping): Catalog => ({
  definitions: [A1, B1],
  records: [{ id: RECORD_ID, workspaceId: WORKSPACE, definition: refOf(A1), data: INITIAL_DATA as Data }],
  mappings: [mapping],
})
/** A Transform version that records whether it was ever run. */
const watched = (feature: MappingFeature) => {
  const seen = { ran: false }
  return { seen, feature: { ...feature, run: (input: Data, mapping: Mapping) => { seen.ran = true; return feature.run(input, mapping) } } as MappingFeature }
}
const transform = (feature: MappingFeature, mapping: Mapping) => {
  const consoled = invoke(catalog(mapping), { workspaceId: WORKSPACE, feature: orbitConsole, input: { record: RECORD_ID } })
  return invoke(catalog(mapping), { workspaceId: WORKSPACE, feature, input: consoled.output!, mapping: { id: mapping.id, version: mapping.version } })
}

const UNSUPPORTED: [string, unknown, (string | number)[]][] = [
  ['a kind a later version may have', { kind: 'path', path: ['contact', 'email'] }, ['fullName']],
  ['a kind nobody has', { kind: 'script', code: 'return 1' }, ['fullName']],
  ['no kind at all', { name: 'firstName' }, ['fullName']],
  ['not even an object', 'firstName', ['fullName']],
  ['nothing', null, ['fullName']],
  ['a property without a name', { kind: 'property' }, ['fullName']],
  ['a call without arguments', { kind: 'call', fn: 'trim' }, ['fullName']],
  ['a list without items', { kind: 'call', fn: 'join', args: [{ kind: 'list' }, { kind: 'literal', value: '' }] }, ['fullName', 'join', 0]],
  ['a literal without a value', { kind: 'call', fn: 'trim', args: [{ kind: 'literal' }] }, ['fullName', 'trim', 0]],
  ['an unknown kind deep inside a list', { kind: 'call', fn: 'join', args: [{ kind: 'list', items: [{ kind: 'property', name: 'firstName' }, { kind: 'path', path: ['a', 'b'] }] }, { kind: 'literal', value: ' ' }] }, ['fullName', 'join', 0, 1]],
]

describe('Transform v1 and v2 refuse sources they don’t have, before running', () => {
  for (const [what, source, path] of UNSUPPORTED) {
    it(`refuses ${what}, at exactly where it is, for both versions`, () => {
      expect(() => checkMapping({ properties: [{ name: 'fullName', source: source as Expression }] }, A1, B1)).not.toThrow()
      for (const version of [orbitTransformV1, orbitTransformV2]) {
        const { seen, feature } = watched(version)
        const result = transform(feature, withSource(source))
        expect(result.evidence.outcome).toEqual({ kind: 'not_attempted', reason: 'invalid_mapping', issues: [{ problem: 'unsupported_source', path }] })
        expect(result.evidence.feature).toEqual({ id: 'orbit.transform', version: version.version })
        expect(seen.ran).toBe(false)
        expect(result.output).toBeUndefined()
      }
    })
  }

  it('says so in words, without quoting what the source held', () => {
    const words = describeMappingIssue({ problem: 'unsupported_source', path: ['fullName'] })
    expect(words).toBe('This version of the Transform doesn’t understand this kind of source.')
    expect(formatSource({ kind: 'path', path: ['a'] } as unknown as Expression)).toBe('?')
  })

  it('runs the sources they support exactly as before', () => {
    for (const version of [orbitTransformV1, orbitTransformV2]) {
      const result = transform(version, INITIAL_MAPPING)
      expect(result.evidence.outcome).toEqual({ kind: 'succeeded' })
      expect(result.output!.data).toEqual({ fullName: 'Ada Lovelace' })
    }
    // Existing problems keep their representation.
    expect(checkMapping({ properties: [{ name: 'fullName', source: { kind: 'property', name: 'middleName' } }] }, A1, B1).issues)
      .toEqual([{ problem: 'unknown_property', path: ['fullName'], name: 'middleName' }])
    expect(checkMapping({ properties: [{ name: 'fullName', source: { kind: 'call', fn: 'trim', args: [] } }] }, A1, B1).issues)
      .toEqual([{ problem: 'argument_count', path: ['fullName', 'trim'], fn: 'trim', expected: 1, actual: 0 }])
  })
})

describe('Locations for future nested Mapping problems', () => {
  it('keeps the output property and the place in its source apart', () => {
    expectTypeOf<MappingProblemLocation['output']>().toEqualTypeOf<PropertyPath>()
    expectTypeOf<MappingProblemLocation['expression']>().toEqualTypeOf<ExpressionPath>()
    const at: MappingProblemLocation = { output: ['contact', 'email'], expression: ['join', 0, 1] }
    expect(at.output).not.toBe(at.expression)
  })
})
