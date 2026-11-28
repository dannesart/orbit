// Phase 4.4, part A. Transform v3 refuses an incomplete or mismatched Mapping before running at
// every level, the output itself included; v1 and v2 keep refusing it after running, exactly as they
// always have. Valid Mappings make exactly what they made. And a construction's condition names its
// source object on purpose: never taken from the contract's order.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { refOf } from '../shared/features/definitions'
import { type MappingFeature, invoke, orbitTransformV1, orbitTransformV2, orbitTransformV3 } from '../shared/features/features'
import { type Expression, type Mapping, type MappingProperty, checkNestedMapping } from '../shared/features/mappings'
import { A1, APPLICANT, B1, DEFINITIONS, INITIAL_DATA, INITIAL_MAPPING, PINS, RECORD_ID, WORKSPACE } from '../app/dev/features/experiment'

const prop = (name: string): Expression => ({ kind: 'property', name })
const run = (feature: MappingFeature, properties: readonly MappingProperty[]) => {
  const mapping: Mapping = { ...INITIAL_MAPPING, version: 7, properties }
  return invoke({ definitions: [A1, B1], records: [{ id: RECORD_ID, workspaceId: WORKSPACE, definition: refOf(A1), data: INITIAL_DATA }], mappings: [mapping] },
    { workspaceId: WORKSPACE, feature, input: { record: RECORD_ID }, mapping: { id: mapping.id, version: 7 } })
}
const at = (output: string[]) => ({ output, expression: [] })

describe('Completeness at every level', () => {
  it('v3 refuses a Mapping that misses a required output property before running; v1 and v2 run and fail, as always', () => {
    for (const f of [orbitTransformV1, orbitTransformV2]) expect(run(f, []).evidence.outcome).toEqual({ kind: 'failed', reason: 'invalid_output', issues: [{ problem: 'missing', path: ['fullName'], expected: 'string' }] })
    expect(run(orbitTransformV3, []).evidence.outcome).toEqual({ kind: 'not_attempted', reason: 'invalid_mapping', issues: [{ problem: 'missing_output_property', at: at(['fullName']), name: 'fullName' }] })
  })

  it('and a property the output doesn’t have, or of another type', () => {
    expect(run(orbitTransformV2, [...INITIAL_MAPPING.properties, { name: 'extra', source: prop('lastName') }]).evidence.outcome).toMatchObject({ kind: 'failed', reason: 'invalid_output' })
    expect(run(orbitTransformV3, [...INITIAL_MAPPING.properties, { name: 'extra', source: prop('lastName') }]).evidence.outcome)
      .toEqual({ kind: 'not_attempted', reason: 'invalid_mapping', issues: [{ problem: 'unknown_output_property', at: at(['extra']), name: 'extra' }] })
    expect(run(orbitTransformV3, [{ name: 'fullName', source: { kind: 'literal', value: 7 } }]).evidence.outcome)
      .toEqual({ kind: 'not_attempted', reason: 'invalid_mapping', issues: [{ problem: 'wrong_output_type', at: at(['fullName']), expected: 'string', actual: 'number' }] })
  })

  it('leaves valid Mappings making exactly what they made, on every version', () => {
    expect([orbitTransformV1, orbitTransformV2, orbitTransformV3].map((f) => run(f, INITIAL_MAPPING.properties).output!.data))
      .toEqual([{ fullName: 'Ada Lovelace' }, { fullName: 'Ada Lovelace' }, { fullName: 'Ada Lovelace' }])
  })

  it('leaves the output’s own completeness to whoever has all its properties, when checking some on their own', () => {
    expect(checkNestedMapping({ properties: [] }, A1, B1).issues).toEqual([{ problem: 'missing_output_property', at: at(['fullName']), name: 'fullName' }])
    expect(checkNestedMapping({ properties: [] }, A1, B1, { partial: true }).issues).toEqual([])
  })
})
