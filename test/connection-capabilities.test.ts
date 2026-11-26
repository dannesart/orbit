// Phase 4.2, part A: what each step's Feature version accepts is the domain's own rule, for the
// version chosen, and the boundary stays authoritative.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { type DefinitionRef, refOf } from '../shared/features/definitions'
import { orbitConsole, orbitConsoleV2, orbitTransformV2 } from '../shared/features/features'
import { A1, APPLICANT, DEFINITIONS, INITIAL_DATA, INITIAL_MAPPING, PINS, RECORD_ID, WORKSPACE, definitionLabel } from '../app/dev/features/experiment'
import { type Contracts, INITIAL_CONNECTIONS, type StepFeatures, checkConnection, connectionProblems, runFlow } from '../app/dev/designer/flow'

describe('Connections follow each step’s Feature version', () => {
  const steps = (consoleIn = orbitConsole, consoleOut = orbitConsole): StepFeatures => ({ 'console-in': consoleIn, 'transform': orbitTransformV2, 'console-out': consoleOut })
  const contracts = (record: DefinitionRef, features: StepFeatures): Contracts => ({
    record,
    transform: { reads: INITIAL_MAPPING.from, makes: INITIAL_MAPPING.to },
    definitions: DEFINITIONS,
    label: definitionLabel,
    features,
    featureLabel: (step) => (step === 'transform' ? 'Orbit.Transform v2' : `Orbit.Console v${features[step].version}`),
  })
  const composed = refOf(APPLICANT)

  it('says Console v1 can’t take a composed Definition, by the domain’s own rule', () => {
    expect(connectionProblems(INITIAL_CONNECTIONS, contracts(composed, steps())).get('record->console-in'))
      .toBe('Orbit.Console v1 doesn’t accept Applicant · v1: it has objects or other Definitions inside it (contact, preferences, home).')
  })

  it('accepts it once Console v2 is chosen, and judges the next step by what it receives', () => {
    const problems = connectionProblems(INITIAL_CONNECTIONS, contracts(composed, steps(orbitConsoleV2)))
    expect(problems.has('record->console-in')).toBe(false)
    expect(problems.get('console-in->transform')).toBe('Transform reads Definition A · v1, but receives Applicant · v1.')
  })

  it('says so when connecting, too', () => {
    const verdict = checkConnection([], { source: 'record', target: 'console-in' }, contracts(composed, steps()))
    expect(verdict).toEqual({ ok: false, reason: 'Orbit.Console v1 doesn’t accept Applicant · v1, which Record A hands on: it has objects or other Definitions inside it (contact, preferences, home).' })
    expect(checkConnection([], { source: 'record', target: 'console-in' }, contracts(composed, steps(orbitConsoleV2)))).toEqual({ ok: true })
  })

  it('leaves flat contracts and existing wording as they were', () => {
    expect(connectionProblems(INITIAL_CONNECTIONS, contracts(refOf(A1), steps())).size).toBe(0)
  })

  it('still lets the run be attempted: the boundary decides, and says the same', () => {
    const pin = PINS.find((p) => p.key === 'applicant')!
    const catalog = { definitions: DEFINITIONS, records: [{ id: RECORD_ID, workspaceId: WORKSPACE, definition: composed, data: pin.example! }], mappings: [INITIAL_MAPPING] }
    const run = runFlow(catalog, INITIAL_CONNECTIONS, { features: steps(), mapping: { id: INITIAL_MAPPING.id, version: 1 }, workspaceId: WORKSPACE })
    expect(run.steps['console-in']!.evidence.outcome).toMatchObject({ kind: 'not_attempted', reason: 'unsupported_contract' })
    expect(INITIAL_DATA).toBeTruthy()
  })

  it('updates with the chosen version in the Designer', () => {
    const designer = readFileSync(join(import.meta.dirname, '..', 'app/dev/designer/SpatialDesigner.vue'), 'utf8')
    expect(designer).toMatch(/const contracts = computed<Contracts>\(\(\) => \(\{[\s\S]*?features: features\.value,\s*featureLabel: featureWords,/)
  })
})
