// Experiment #4, output first (/dev/designer): the Transform's output is an existing Definition
// version or one it defines for itself; Apply freezes exactly the versions that changed (each
// with its own identity), Run uses only applied versions and makes none, and evidence keeps
// naming the versions that produced it.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { type Data, type Field, deepFreeze, refOf } from '../shared/features/definitions'
import type { Expression } from '../shared/features/mappings'
import { orbitConsole } from '../shared/features/features'
import { A1, B1, DEFINITIONS, INITIAL_DATA, INITIAL_MAPPING, RECORD_ID, WORKSPACE, runExperiment } from '../app/dev/features/experiment'
import {
  type Configuration, type TransformDraft, LOCAL_ID, allDefinitions, applyConfiguration, catalogue, draftFrom, findMapping,
  initialConfiguration, labelOf, mappingIdFor, outputOf, planApply, structureProblems, scopeOf,
} from '../app/dev/designer/config'
import { type Piece, fromDraft, toPiece } from '../app/dev/designer/parts'
import { previewOutput, reviewDraft } from '../app/dev/designer/preview'
import { applyFor, stepOf } from './apply'

const prop = (name: string): Expression => ({ kind: 'property', name })
const text = (value: string): Expression => ({ kind: 'literal', value })
const trim = (e: Expression): Expression => ({ kind: 'call', fn: 'trim', args: [e] })
const joined = (items: Expression[], separator: string): Expression => ({ kind: 'call', fn: 'join', args: [{ kind: 'list', items }, text(separator)] })
const piece = (e: Expression): Piece => toPiece(e)

const SUMMARY_FIELDS: Field[] = [
  { name: 'fullName', type: 'string' },
  { name: 'displayName', type: 'string' },
  { name: 'initials', type: 'string' },
  { name: 'active', type: 'boolean' },
]
/** The owners' example, as a person would build it in the panel. */
function personSummary(config: Configuration): TransformDraft {
  return {
    ...draftFrom(config),
    use: 'local',
    local: { name: 'Person summary', fields: SUMMARY_FIELDS },
    properties: [
      { name: 'fullName', piece: piece(joined([trim(prop('firstName')), text(' '), prop('lastName')], '')) },
      { name: 'displayName', piece: piece(joined([prop('lastName'), text(', '), trim(prop('firstName'))], '')) },
      // The expression model has no "first letter" function: initials can only be fixed text.
      { name: 'initials', piece: { kind: 'text', value: 'AL', trim: false } },
      { name: 'active', piece: { kind: 'literal', value: true } },
    ],
  }
}
function run(config: Configuration) {
  const catalog = { definitions: allDefinitions(config), records: [{ id: RECORD_ID, workspaceId: WORKSPACE, definition: A1, data: INITIAL_DATA }], mappings: config.mappings }
  return runExperiment(catalog, { console: orbitConsole, mapping: config.mapping })
}
const example = { data: deepFreeze({ ...INITIAL_DATA }) as Data }

describe('Applying: exactly the versions that changed, and nothing when nothing did', () => {
  it('starts applied, with nothing to apply', () => {
    const config = initialConfiguration()
    const plan = planApply(config, draftFrom(config), WORKSPACE)
    expect(plan.changes).toBe(false)
    expect(applyFor(config, draftFrom(config))).toBe(config)
  })

  it('uses an existing Definition version as it is, with a Mapping of its own', () => {
    expect(catalogue().map((d) => `${d.id}@${d.version}`)).toEqual(['person-name@1', 'person-name@2', 'person-name-copy@1', 'full-name@1', 'address@1', 'applicant@1'])
    const config = initialConfiguration()
    const draft: TransformDraft = {
      ...draftFrom(config),
      catalogue: { id: 'person-name', version: 2 },
      properties: [
        { name: 'firstName', piece: piece(trim(prop('firstName'))) },
        { name: 'lastName', piece: piece(prop('lastName')) },
        { name: 'email', piece: { kind: 'text', value: 'ada@example.com', trim: false } },
      ],
    }
    const target = outputOf(config, draft, scopeOf(config, WORKSPACE))
    expect(target).toMatchObject({ isNew: false, label: 'Definition A · v2' })
    expect(reviewDraft(fromDraft(draft.properties), A1, target.definition).problems).toEqual([])
    expect(planApply(config, draft, WORKSPACE)).toMatchObject({ output: { isNew: false }, mapping: { id: 'transform:person-name@2', version: 1, isNew: true }, changes: true })
    const next = applyFor(config, draft)
    expect(next.locals).toEqual([])
    expect(next.output).toEqual({ id: 'person-name', version: 2 })
    expect(next.mappings).toHaveLength(2)
    expect(next.mappings[0]).toBe(INITIAL_MAPPING)
    const [, transform, after] = run(next)
    expect(transform!.output).toEqual({ definition: { id: 'person-name', version: 2 }, data: { firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com' } })
    expect(after!.output!.definition).toEqual({ id: 'person-name', version: 2 })
  })

  it('freezes a Transform’s own output as a Definition version, and runs it into one complete Value', () => {
    const config = applyFor(initialConfiguration(), personSummary(initialConfiguration()))
    expect(config.locals).toHaveLength(1)
    const local = config.locals[0]!
    expect(local).toMatchObject({ id: LOCAL_ID, version: 1, name: 'Person summary', workspaceId: WORKSPACE, fields: SUMMARY_FIELDS })
    expect(Object.isFrozen(local.fields)).toBe(true)
    // Not offered as a shared Definition.
    expect(catalogue().some((d) => d.id === LOCAL_ID)).toBe(false)
    expect(DEFINITIONS.some((d) => d.id === LOCAL_ID)).toBe(false)
    const mapping = findMapping(config, config.mapping)!
    expect(mapping).toMatchObject({ id: 'transform:transform.output@1', version: 1, from: refOf(A1), to: { id: LOCAL_ID, version: 1 } })

    const [, transform, after] = run(config)
    const expected = { fullName: 'Ada Lovelace', displayName: 'Lovelace, Ada', initials: 'AL', active: true }
    expect(transform!.evidence).toMatchObject({ outcome: { kind: 'succeeded' }, mapping: config.mapping, output: { definition: { id: LOCAL_ID, version: 1 } } })
    expect(transform!.output!.data).toEqual(expected)
    // Downstream, Console receives a Value of exactly that version.
    expect(after!.evidence.input.definition).toEqual({ id: LOCAL_ID, version: 1 })
    // The preview shows the same object, without a run.
    const preview = previewOutput(mapping.properties, A1, local, example)
    expect(Object.fromEntries(mapping.properties.map((p, i) => [p.name, (preview.values[i] as { value: unknown }).value]))).toEqual(expected)
    expect(labelOf(config, config.output)).toBe('Person summary · v1')
  })

  it('makes nothing when applied again, and nothing when run again and again', () => {
    const config = applyFor(initialConfiguration(), personSummary(initialConfiguration()))
    const draft = { ...personSummary(initialConfiguration()), properties: draftFrom(config).properties }
    expect(planApply(config, draft, WORKSPACE).changes).toBe(false)
    expect(applyFor(config, draft)).toBe(config)
    const before = JSON.stringify(config)
    for (let i = 0; i < 3; i++) expect(run(config)[1]!.evidence.mapping).toEqual(config.mapping)
    expect(JSON.stringify(config)).toBe(before)
  })

  it('a changed Mapping alone: the same output version, the next Mapping version', () => {
    const v1 = applyFor(initialConfiguration(), personSummary(initialConfiguration()))
    const draft = personSummary(v1)
    const edited = { ...draft, properties: draft.properties.map((p) => (p.name === 'active' ? { ...p, piece: { kind: 'literal', value: false } as Piece } : p)) }
    expect(planApply(v1, edited, WORKSPACE)).toMatchObject({ output: { isNew: false }, mapping: { id: 'transform:transform.output@1', version: 2, isNew: true } })
    const v2 = applyFor(v1, edited)
    expect(v2.locals).toBe(v1.locals)
    expect(v2.mapping).toEqual({ id: 'transform:transform.output@1', version: 2 })
    expect(run(v2)[1]!.output!.data.active).toBe(false)
  })

  it('a changed structure: the next output version and a new Mapping for it; old versions and old evidence stay true', () => {
    const v1 = applyFor(initialConfiguration(), personSummary(initialConfiguration()))
    const firstRun = run(v1)[1]!.evidence
    const snapshot = JSON.stringify([v1.locals, v1.mappings])
    const draft = personSummary(v1)
    const grown: TransformDraft = {
      ...draft,
      local: { ...draft.local, fields: [...draft.local.fields, { name: 'age', type: 'number' }] },
      properties: [...draft.properties, { name: 'age', piece: { kind: 'literal', value: 36 } }],
    }
    expect(outputOf(v1, grown, scopeOf(v1, WORKSPACE))).toMatchObject({ isNew: true, label: 'Person summary · v2 (draft)' })
    expect(planApply(v1, grown, WORKSPACE)).toMatchObject({ output: { isNew: true, ref: { id: LOCAL_ID, version: 2 } }, mapping: { id: 'transform:transform.output@2', version: 1, isNew: true } })
    const v2 = applyFor(v1, grown)
    expect(v2.locals.map((d) => d.version)).toEqual([1, 2])
    expect(JSON.stringify([v2.locals.slice(0, 1), v2.mappings.slice(0, v1.mappings.length)])).toBe(snapshot)
    expect(run(v2)[1]!.output).toEqual({ definition: { id: LOCAL_ID, version: 2 }, data: { fullName: 'Ada Lovelace', displayName: 'Lovelace, Ada', initials: 'AL', active: true, age: 36 } })
    // The first run's evidence still names the versions that produced it.
    expect(firstRun.mapping).toEqual({ id: 'transform:transform.output@1', version: 1 })
    expect(findMapping(v2, firstRun.mapping!)!.to).toEqual({ id: LOCAL_ID, version: 1 })
    expect(labelOf(v2, firstRun.output!.definition)).toBe('Person summary · v1')
  })

  it('renaming the output is a change of structure too', () => {
    const v1 = applyFor(initialConfiguration(), personSummary(initialConfiguration()))
    const renamed = { ...personSummary(v1), local: { ...personSummary(v1).local, name: 'Profile card' } }
    expect(planApply(v1, renamed, WORKSPACE).output).toMatchObject({ isNew: true, ref: { version: 2 } })
  })

  it('gives every Mapping identity exactly one pair of contracts', () => {
    let config = initialConfiguration()
    config = applyFor(config, personSummary(config))
    config = applyFor(config, { ...personSummary(config), properties: personSummary(config).properties.slice(0, 3).concat({ name: 'active', piece: { kind: 'literal', value: false } }) })
    config = applyFor(config, { ...personSummary(config), local: { name: 'Person summary', fields: SUMMARY_FIELDS.slice(0, 3) }, properties: personSummary(config).properties.slice(0, 3) })
    config = applyFor(config, { ...draftFrom(config), use: 'catalogue', catalogue: refOf(B1), properties: draftFrom(initialConfiguration()).properties })
    for (const m of config.mappings) {
      expect(m.id).toBe(mappingIdFor(m.to))
      const first = config.mappings.find((x) => x.id === m.id)!
      expect([m.from, m.to]).toEqual([first.from, first.to])
    }
    expect(config.mappings.map((m) => `${m.id}#${m.version}`)).toEqual([
      'full-name-from-person#1', 'transform:transform.output@1#1', 'transform:transform.output@1#2', 'transform:transform.output@2#1',
    ])
    // Switching back to Definition B with its original Mapping created nothing: it pointed back at v1.
    expect(config.output).toEqual(refOf(B1))
    expect(config.mapping).toEqual({ id: INITIAL_MAPPING.id, version: 1 })
  })
})

describe('Switching outputs never discards work', () => {
  it('keeps every mapping when switching to a Definition that has no place for some, and back', () => {
    const config = initialConfiguration()
    const local = personSummary(config)
    const toB: TransformDraft = { ...local, use: 'catalogue', catalogue: refOf(B1) }
    const review = reviewDraft(fromDraft(toB.properties), A1, outputOf(config, toB, scopeOf(config, WORKSPACE)).definition)
    expect(review.fields).toMatchObject([{ name: 'fullName', state: 'set' }])
    expect(review.extras.map((x) => toB.properties[x.index]!.name)).toEqual(['displayName', 'initials', 'active'])
    expect(toB.properties).toBe(local.properties)
    // The local structure is still there to switch back to.
    const back: TransformDraft = { ...toB, use: 'local' }
    expect(reviewDraft(fromDraft(back.properties), A1, outputOf(config, back, scopeOf(config, WORKSPACE)).definition).fields.map((f) => f.state)).toEqual(['set', 'set', 'set', 'set'])
  })

  it('a local output starts as a copy of the current output’s properties', () => {
    const draft = draftFrom(initialConfiguration())
    expect(draft.local.fields).toEqual(B1.fields)
    expect(outputOf(initialConfiguration(), { ...draft, use: 'local' }, scopeOf(initialConfiguration(), WORKSPACE))).toMatchObject({ isNew: true, definition: { id: LOCAL_ID, version: 1, fields: B1.fields } })
  })
})

describe('A structure must be a valid Definition before it can be frozen', () => {
  const local = (name: string, fields: Field[]): TransformDraft => ({ ...draftFrom(initialConfiguration()), use: 'local', local: { name, fields } })

  it('names what is missing or clashing', () => {
    expect(structureProblems(local('', []))).toEqual(['Give the output a name.', 'Add at least one property.'])
    expect(structureProblems(local('X', [{ name: '', type: 'string' }, { name: 'a ', type: 'string' }, { name: 'b', type: 'number' }, { name: 'b', type: 'string' }]))).toEqual([
      'Every property needs a name.', 'Property names can’t start or end with a space.', 'Two properties are called “b”.',
    ])
    // The Studio's rule too: names differing only by case, or only by Unicode encoding, are one name twice.
    expect(structureProblems(local('X', [{ name: 'Email', type: 'string' }, { name: 'email', type: 'string' }]))).toEqual([
      '“Email” and “email” differ only in capital letters. Use one name, or two clearly different ones.',
    ])
    expect(structureProblems(local('X', [{ name: 'café', type: 'string' }, { name: 'café', type: 'string' }]))).toEqual([
      '“café” and “café” are the same name, written with different characters.',
    ])
    expect(structureProblems({ ...local('', []), use: 'catalogue' })).toEqual([])
  })

  it('is refused even when applied “anyway”: nothing is made, nothing thrown', () => {
    const start = initialConfiguration()
    const result = applyConfiguration(start, local('Dupes', [{ name: 'b', type: 'number' }, { name: 'b', type: 'string' }]), stepOf(start))
    expect(result).toMatchObject({ applied: false, assessment: { state: 'invalid' } })
    expect(result.config).toBe(start)
  })
})

describe('Apply refuses what the boundary would refuse; the boundary still decides on its own', () => {
  const start = initialConfiguration()
  const draft = personSummary(start)
  const broken = { ...draft, properties: draft.properties.map((p) => (p.name === 'initials' ? { ...p, piece: piece(prop('middleName')) } : p)) }
  const wrongType = { ...draft, properties: draft.properties.map((p) => (p.name === 'active' ? { ...p, piece: { kind: 'text', value: 'yes', trim: false } as Piece } : p)) }
  const extra = { ...draft, properties: [...draft.properties, { name: 'nickname', piece: piece(prop('firstName')) }] }
  /** A Mapping version that skipped Apply (a test fixture only: nothing in the Designer can make one). */
  const forced = (d: TransformDraft): Configuration => {
    const config = applyFor(start, draft)
    const last = config.mappings.at(-1)!
    return { ...config, mappings: [...config.mappings.slice(0, -1), { ...last, properties: fromDraft(d.properties) }] }
  }

  it('refuses each of them, and makes nothing', () => {
    expect(reviewDraft(fromDraft(broken.properties), A1, outputOf(start, broken, scopeOf(start, WORKSPACE)).definition).problems).toEqual(['initials: The input has no field “middleName”.'])
    for (const d of [broken, wrongType, extra]) {
      const result = applyConfiguration(start, d, stepOf(start))
      expect(result).toMatchObject({ applied: false, assessment: { state: 'invalid' } })
      expect(result.config).toBe(start)
    }
  })

  it('stops a Mapping that reads a field the input lacks', () => {
    const [, transform, after] = run(forced(broken))
    expect(transform!.evidence.outcome).toMatchObject({ kind: 'not_attempted', reason: 'invalid_mapping' })
    expect(after).toBeNull()
  })

  it('rejects an output its Definition forbids: a wrong type, or a property it doesn’t have', () => {
    expect(run(forced(wrongType))[1]!.evidence.outcome).toMatchObject({ kind: 'failed', reason: 'invalid_output' })
    const [, transform, after] = run(forced(extra))
    expect(transform!.evidence.outcome).toMatchObject({ kind: 'failed', reason: 'invalid_output', issues: [{ problem: 'unexpected', path: ['nickname'] }] })
    expect(after).toBeNull()
  })
})

describe('In the page: only Apply makes versions, and runs record their own', () => {
  const page = readFileSync(join(import.meta.dirname, '../app/dev/designer/SpatialDesigner.vue'), 'utf8')
  it('run() never touches the configuration; apply() is the only place that assigns it', () => {
    const runBody = page.slice(page.indexOf('function run()'), page.indexOf('function startOver()'))
    expect(runBody).not.toMatch(/config\.value\s*=(?!=)|applyConfiguration|reviseMapping|defineVersion/)
    expect(runBody).toMatch(/mapping: applied\.mapping/)
    expect(runBody).toMatch(/evidence\?\.mapping/)
    const assignments = [...page.matchAll(/config\.value\s*=(?!=)/g)].map((m) => m.index!)
    expect(assignments).toHaveLength(1)
    const apply = page.indexOf('function apply(')
    expect(assignments[0]!).toBeGreaterThan(apply)
    expect(assignments[0]!).toBeLessThan(page.indexOf('\n}', apply))
  })

  it('Discard returns to the applied configuration', () => {
    expect(page).toMatch(/function discard\(\) \{\s*const to = draftFrom\(config\.value\)/)
    expect(page).toMatch(/act: \(\) => setDraft\(to, false\)/)
  })
})
