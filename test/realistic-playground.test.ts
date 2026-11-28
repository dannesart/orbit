// The realistic playground (app/dev/features/realistic.ts): large synthetic Definitions, several
// Records and Mappings, checked against the domain itself, never restated. Every contract holds
// together; every Record satisfies its own Definition version; the Mappings are what Transform v3
// accepts and runs; Console v2 observes and hands on every structure unchanged; Console v1 and
// Transform v2 still refuse composed contracts, as they always have.
import { describe, expect, it } from 'vitest'
import { type DefinitionVersion, type Field, checkContract, validate } from '../shared/features/definitions'
import { invoke, mappingCompatibility, orbitConsole, orbitConsoleV2, orbitTransformV2, orbitTransformV3, resolverIn } from '../shared/features/features'
import { DEFINITIONS, WORKSPACE } from '../app/dev/features/experiment'
import {
  CANDIDATE, CANDIDATE_CONTACT, CANDIDATE_CONTACT_MAPPING, CANDIDATE_RECORDS, CANDIDATE_TO_EMPLOYEE, EMPLOYEE, REALISTIC_DEFINITIONS, REALISTIC_WORKSPACE,
} from '../app/dev/features/realistic'

const resolve = resolverIn(DEFINITIONS, WORKSPACE)
const catalog = { definitions: DEFINITIONS, records: CANDIDATE_RECORDS.map((r) => ({ id: r.id, workspaceId: WORKSPACE, definition: r.definition, data: r.data })), mappings: [CANDIDATE_TO_EMPLOYEE, CANDIDATE_CONTACT_MAPPING] }
const depth = (fields: readonly Field[]): number => 1 + Math.max(0, ...fields.map((f) => (f.type === 'object' ? depth(f.fields) : f.type === 'reference' ? depth(resolve(f.definition)!.fields) : 0)))
const types = (fields: readonly Field[]): Set<string> => new Set(fields.flatMap((f) => [f.type, ...(f.type === 'object' ? types(f.fields) : [])]))

describe('Realistic Definitions', () => {
  it('belong to the playground’s workspace and are part of its catalogue', () => {
    expect(REALISTIC_WORKSPACE).toBe(WORKSPACE)
    for (const d of REALISTIC_DEFINITIONS) expect(DEFINITIONS).toContain(d)
  })

  it('hold together as contracts, every reference resolved exactly', () => {
    for (const d of REALISTIC_DEFINITIONS) expect(checkContract(d, resolve), d.id).toEqual([])
  })

  it('are realistically large: about forty top-level properties, every type, optional ones, nesting several levels deep, long names', () => {
    expect(CANDIDATE.fields.length).toBeGreaterThanOrEqual(38)
    expect([...types(CANDIDATE.fields)].sort()).toEqual(['boolean', 'number', 'object', 'reference', 'string'])
    expect(CANDIDATE.fields.filter((f) => f.optional).length).toBeGreaterThan(10)
    expect(depth(CANDIDATE.fields)).toBeGreaterThanOrEqual(4)
    expect(depth(EMPLOYEE.fields)).toBeGreaterThanOrEqual(4)
    expect(Math.max(...CANDIDATE.fields.map((f) => f.name.length))).toBeGreaterThan(35)
  })

  it('pin reusable Definitions to exact versions, not always the latest', () => {
    const refs = (d: DefinitionVersion) => d.fields.flatMap((f) => (f.type === 'reference' ? [`${f.definition.id}@${f.definition.version}`] : []))
    expect(refs(CANDIDATE)).toContain('address@2')
    expect(refs(DEFINITIONS.find((d) => d.id === 'emergency-contact')!)).toEqual(['address@1'])
  })
})

describe('Candidate Records', () => {
  it('are two Records on the same Candidate version, with different values and different optional presence', () => {
    const [amara, tomasz] = CANDIDATE_RECORDS
    expect(amara!.definition).toEqual(tomasz!.definition)
    for (const r of CANDIDATE_RECORDS) expect(validate(CANDIDATE, r.data, resolve), r.id).toEqual([])
    expect(Object.keys(amara!.data).length).toBeGreaterThan(Object.keys(tomasz!.data).length + 10)
    expect('offer' in tomasz!.data).toBe(false)
    expect('emergencyContact' in amara!.data).toBe(true)
  })
})

describe('Console v2 observes and hands on every structure unchanged', () => {
  it('passes each Candidate on exactly, with its Definition version; v1 still refuses composed contracts before running', () => {
    for (const r of CANDIDATE_RECORDS) {
      const v2 = invoke(catalog, { workspaceId: WORKSPACE, feature: orbitConsoleV2, input: { record: r.id } })
      expect(v2.evidence.outcome.kind, r.id).toBe('succeeded')
      expect(v2.output).toEqual({ definition: { id: CANDIDATE.id, version: 1 }, data: r.data })
      const v1 = invoke(catalog, { workspaceId: WORKSPACE, feature: orbitConsole, input: { record: r.id } })
      expect(v1.evidence.outcome).toMatchObject({ kind: 'not_attempted', reason: 'unsupported_contract' })
    }
  })

  it('still refuses data that doesn’t satisfy its own Definition: the boundary’s check, not the Console’s', () => {
    const broken = { ...catalog, records: [{ id: 'broken', workspaceId: WORKSPACE, definition: { id: CANDIDATE.id, version: 1 }, data: { candidateReference: 'X' } }] }
    expect(invoke(broken, { workspaceId: WORKSPACE, feature: orbitConsoleV2, input: { record: 'broken' } }).evidence.outcome).toMatchObject({ kind: 'not_attempted', reason: 'invalid_input' })
  })
})

describe('Realistic Mappings', () => {
  it('are accepted by Transform v3 and refused by v2, which can’t take composed contracts', () => {
    expect(mappingCompatibility(orbitTransformV3, CANDIDATE_TO_EMPLOYEE, CANDIDATE, EMPLOYEE, resolve)).toEqual([])
    expect(mappingCompatibility(orbitTransformV3, CANDIDATE_CONTACT_MAPPING, CANDIDATE, CANDIDATE_CONTACT, resolve)).toEqual([])
    const r = invoke(catalog, { workspaceId: WORKSPACE, feature: orbitTransformV2, input: { record: 'candidate-amara' }, mapping: { id: CANDIDATE_TO_EMPLOYEE.id, version: 1 } })
    expect(r.evidence.outcome).toMatchObject({ kind: 'not_attempted', reason: 'unsupported_contract' })
  })

  it('run for both Candidates; what one doesn’t have is left out, never invented', () => {
    const run = (record: string, mapping: { id: string }) => invoke(catalog, { workspaceId: WORKSPACE, feature: orbitTransformV3, input: { record }, mapping: { id: mapping.id, version: 1 } })
    const amara = run('candidate-amara', CANDIDATE_TO_EMPLOYEE)
    expect(amara.evidence.outcome.kind).toBe('succeeded')
    expect(amara.output!.data).toMatchObject({ employeeNumber: 'CAND-2026-00417', employment: { jobTitle: 'Lead product designer', compensation: { currencyCode: 'SEK' } } })
    const tomasz = run('candidate-tomasz', CANDIDATE_TO_EMPLOYEE)
    expect(tomasz.evidence.outcome.kind).toBe('succeeded')
    expect(Object.keys(tomasz.output!.data)).not.toContain('employment')
    expect(Object.keys(tomasz.output!.data)).not.toContain('emergencyContact')
    for (const record of ['candidate-amara', 'candidate-tomasz']) expect(run(record, CANDIDATE_CONTACT_MAPPING).evidence.outcome.kind, record).toBe('succeeded')
  })
})

describe('Experimental workflows (workflows.ts)', async () => {
  const { RECORDS, SIMPLE, WORKFLOWS, recordOf, workflowOf } = await import('../app/dev/designer/workflows')
  const { INITIAL_CONNECTIONS, INITIAL_STEP_FEATURES, flowOutcome, runFlow } = await import('../app/dev/designer/flow')
  const { CONSOLES, INITIAL_DATA, INITIAL_MAPPING, TRANSFORMS, featureKey } = await import('../app/dev/features/experiment')
  const { readFileSync } = await import('node:fs')
  const { join } = await import('node:path')
  const featureOf = (key: string) => [...CONSOLES, ...TRANSFORMS].find((c) => featureKey(c.feature) === key)!.feature

  it('keeps the simple workflow exactly as the playground always started, Record A included', () => {
    expect(WORKFLOWS[0]).toBe(SIMPLE)
    expect(SIMPLE).toMatchObject({ records: ['record-a'], record: 'record-a', features: INITIAL_STEP_FEATURES, mapping: INITIAL_MAPPING, connections: INITIAL_CONNECTIONS })
    expect(recordOf('record-a')).toMatchObject({ definition: { id: 'person-name', version: 1 }, data: INITIAL_DATA })
    expect(workflowOf('nonsense')).toBe(SIMPLE)
  })

  it('offers Candidate to Employee, contact extraction and Console observation, each with Records of its Mapping’s input', () => {
    expect(WORKFLOWS.map((w) => w.id)).toEqual(['simple', 'candidate-to-employee', 'candidate-contact', 'observe-candidate'])
    for (const w of WORKFLOWS) {
      expect(w.records, w.id).toContain(w.record)
      for (const id of w.records) expect(RECORDS.some((r) => r.id === id), `${w.id}: ${id}`).toBe(true)
      for (const key of Object.values(w.features)) expect(featureOf(key), `${w.id}: ${key}`).toBeTruthy()
    }
    // The new ones observe with Console v2; nothing already there was upgraded.
    for (const w of WORKFLOWS.slice(1)) expect([w.features['console-in'], w.features['console-out']], w.id).toEqual(['orbit.console@2', 'orbit.console@2'])
    expect(SIMPLE.features['console-in']).toBe('orbit.console@1')
  })

  it('runs every workflow with every one of its Records, as its connections say', () => {
    for (const w of WORKFLOWS) {
      const features = { 'console-in': featureOf(w.features['console-in']), 'transform': featureOf(w.features.transform), 'console-out': featureOf(w.features['console-out']) } as never
      for (const id of w.records) {
        const record = recordOf(id)
        const run = runFlow({ definitions: DEFINITIONS, records: [{ id, workspaceId: WORKSPACE, definition: record.definition, data: record.data }], mappings: [w.mapping] }, w.connections, { features, mapping: { id: w.mapping.id, version: w.mapping.version }, workspaceId: WORKSPACE, record: id })
        expect(flowOutcome(run), `${w.id}: ${id}`).toEqual({ kind: 'completed' })
        // The observation workflow never invokes its unconnected Transform.
        if (w.id === 'observe-candidate') expect(Object.keys(run.steps).sort()).toEqual(['console-in', 'console-out'])
      }
    }
  })

  it('keeps one Designer per workflow alive while switching, in memory, and a Record’s choice never changes its Definition', () => {
    const page = readFileSync(join(import.meta.dirname, '../app/dev/designer/DesignerWorkflows.vue'), 'utf8')
    expect(page).toMatch(/<KeepAlive>\s*<SpatialDesigner :key="current\.id" :workflow="current"/)
    const designer = readFileSync(join(import.meta.dirname, '../app/dev/designer/SpatialDesigner.vue'), 'utf8')
    // Each Record keeps its own data; only Record A can be re-pinned (on purpose); a Candidate shows its own version.
    expect(designer).toMatch(/<select v-if="selectedRecord === RECORD_ID" id="pin" v-model="pinKey"/)
    expect(designer).toContain('records: [{ id: selectedRecord.value, workspaceId: WORKSPACE, definition: pin.value.ref, data: record.data as Data }]')
    for (const r of RECORDS) expect(Object.isFrozen(r), r.id).toBe(true)
  })
})

describe('Realistic samples in the Definitions place (development only)', async () => {
  const { addRealisticSamples, catalogueOf, shelfOf } = await import('../app/dev/definitions/store')

  it('are made once, as this workspace’s own Definitions, with new identities and exact references', () => {
    expect(addRealisticSamples('ws-samples')).toBe(true)
    expect(addRealisticSamples('ws-samples')).toBe(false)
    const made = shelfOf('ws-samples').made
    expect(made.map((d) => [d.name, d.versions.map((v) => v.version)])).toEqual([
      ['Address', [1, 2]], ['Emergency contact', [1]], ['Employment', [1]], ['Candidate', [1]], ['Employee', [1]], ['Candidate contact', [1]],
    ])
    const { resolve } = catalogueOf('ws-samples')
    for (const d of made) {
      expect(DEFINITIONS.some((x) => x.id === d.id), d.name).toBe(false)
      for (const v of d.versions) {
        expect(v.workspaceId).toBe('ws-samples')
        expect(checkContract(v, resolve), `${d.name} v${v.version}`).toEqual([])
      }
    }
    // The same contract as the sample, under its new identity: Candidate still holds 40-odd properties.
    expect(made.find((d) => d.name === 'Candidate')!.versions[0]!.fields.length).toBe(CANDIDATE.fields.length)
    // Another workspace sees none of it.
    expect(shelfOf('ws-other').made).toEqual([])
  })
})

describe('Each workflow starts with its Mapping applied and nothing unapplied', async () => {
  const { WORKFLOWS } = await import('../app/dev/designer/workflows')
  const { draftFrom, initialConfiguration, mappingIdFor, planApply } = await import('../app/dev/designer/config')

  it('identifies its Mapping as the Designer does, and its draft is exactly what’s applied', () => {
    for (const w of WORKFLOWS) {
      if (w.id !== 'simple') expect(w.mapping.id, w.id).toBe(mappingIdFor(w.mapping.to, w.mapping.from))
      const config = initialConfiguration([], w.mapping)
      expect(planApply(config, draftFrom(config), WORKSPACE).changes, w.id).toBe(false)
    }
  })
})
