// Phase 4.0, compatibility groundwork: Transform v1 and v2 refuse, before running, any source the
// language doesn't have (an unknown kind, such as one a later version may understand, or a
// malformed one), never crashing and never reinterpreting it. Sources they support mean exactly
// what they always meant. And the location type for future nested Mapping problems keeps the
// output property apart from the place in its source.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, expectTypeOf, it } from 'vitest'
import { type Data, deepFreeze, refOf } from '../shared/features/definitions'
import { type Catalog, type MappingFeature, invoke, orbitConsole, orbitTransformV1, orbitTransformV2 } from '../shared/features/features'
import { type Expression, type ExpressionPath, type Mapping, type MappingProblemLocation, checkMapping, formatSource } from '../shared/features/mappings'
import { A1, B1, CONSOLES, INITIAL_DATA, INITIAL_MAPPING, RECORD_ID, TRANSFORMS, WORKSPACE, describeMappingIssue, featureKey } from '../app/dev/features/experiment'
import { INITIAL_CONNECTIONS, INITIAL_STEP_FEATURES, type StepFeatures, runFlow } from '../app/dev/designer/flow'
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
    expect(formatSource({ kind: 'script', code: '1' } as unknown as Expression)).toBe('?')
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

describe('Each Designer step names the exact Feature version it invokes', () => {
  const root = join(import.meta.dirname, '..')
  const designer = readFileSync(join(root, 'app/dev/designer/SpatialDesigner.vue'), 'utf8')
  const pick = (key: string) => [...CONSOLES, ...TRANSFORMS].find((c) => featureKey(c.feature) === key)!.feature
  const stepsFrom = (keys: Record<string, string>) => ({ 'console-in': pick(keys['console-in']!), 'transform': pick(keys.transform!), 'console-out': pick(keys['console-out']!) }) as StepFeatures
  const flow = (keys: Record<string, string>) => runFlow(catalog(INITIAL_MAPPING), INITIAL_CONNECTIONS, { features: stepsFrom(keys), mapping: { id: INITIAL_MAPPING.id, version: 1 }, workspaceId: WORKSPACE })

  it('keeps the versions the steps have always run: Console v1, Transform v2, Console v1', () => {
    expect(INITIAL_STEP_FEATURES).toEqual({ 'console-in': 'orbit.console@1', 'transform': 'orbit.transform@2', 'console-out': 'orbit.console@1' })
    const run = flow(INITIAL_STEP_FEATURES)
    expect(['console-in', 'transform', 'console-out'].map((s) => run.steps[s as 'transform']!.evidence.feature)).toEqual([
      { id: 'orbit.console', version: 1 }, { id: 'orbit.transform', version: 2 }, { id: 'orbit.console', version: 1 },
    ])
    expect(run.steps['console-out']!.output!.data).toEqual({ fullName: 'Ada Lovelace' })
  })

  it('invokes, and names in evidence, exactly the version chosen for each step; an earlier run keeps its own', () => {
    const before = flow(INITIAL_STEP_FEATURES)
    const after = flow({ ...INITIAL_STEP_FEATURES, 'console-out': 'playground.console-that-swaps@1' })
    expect(after.steps['console-out']!.evidence).toMatchObject({ feature: { id: 'playground.console-that-swaps', version: 1 }, outcome: { kind: 'failed', reason: 'pass_through_broken' } })
    expect(before.steps['console-out']!.evidence).toMatchObject({ feature: { id: 'orbit.console', version: 1 }, outcome: { kind: 'succeeded' } })
    expect(Object.isFrozen(before.steps['console-out']!.evidence)).toBe(true)
  })

  it('assumes no version in the flow, and changes one only when someone picks another', () => {
    expect(designer).not.toMatch(/import \{[^}]*orbitConsole[^}]*\} from '#shared\/features\/features'/)
    // Each workflow starts its steps on the versions it names (workflows.ts); the simple one on the playground's own.
    expect(designer).toContain('const stepFeatures = ref<Record<FeatureStep, string>>({ ...preset.features })')
    expect(readFileSync(join(root, 'app/dev/designer/workflows.ts'), 'utf8')).toContain('features: INITIAL_STEP_FEATURES, mapping: INITIAL_MAPPING')
    // A step's version is pinned only from the development control (FeatureVersions.vue).
    expect(designer).toContain('@pin="pinVersion"')
    expect(designer).toMatch(/function pinVersion\(step: string, key: string\) \{\s*stepFeatures\.value = \{ \.\.\.stepFeatures\.value, \[step as FeatureStep\]: key \}\s*\}/)
    expect(designer).not.toMatch(/stepFeatures\.value(\[[^\]]+\]|\.\w+) =/)
    // Choosing another version makes the last run stale, and starting over or leaving says so.
    expect(designer).toContain('JSON.stringify([selectedRecord.value, pinKey.value, recordText.value, stepFeatures.value,')
    expect(designer).toContain("['The Feature versions you chose for its steps']")
  })
})
