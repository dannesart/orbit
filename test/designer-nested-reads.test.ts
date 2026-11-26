// Phase 4.2, part C: the Designer exercises Transform v3's nested reads. The step's Transform
// version is chosen explicitly (v2 stays the default); review, preview and the source picker follow
// that version's reading with the domain's own checks and evaluation; nested values are offered by
// path with what may make them absent; composed output stays unsupported.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { type Data, type DefinitionVersion, defineVersion, refOf } from '../shared/features/definitions'
import { invoke, orbitTransformV2, orbitTransformV3 } from '../shared/features/features'
import type { Expression, Mapping } from '../shared/features/mappings'
import { A1, APPLICANT, B1, DEFINITIONS, INITIAL_MAPPING, PINS, TRANSFORMS, WORKSPACE, featureKey } from '../app/dev/features/experiment'
import { applyConfiguration, draftFrom, initialConfiguration, inputOf, mappingIdFor, planApply } from '../app/dev/designer/config'
import { INITIAL_STEP_FEATURES } from '../app/dev/designer/flow'
import { fromPiece, toPiece } from '../app/dev/designer/parts'
import { exampleFrom, previewOutput, previewSource, reviewDraft } from '../app/dev/designer/preview'
import { FLAT, checkWith, readables } from '../app/dev/designer/reading'
import { transformSupport } from '../app/dev/designer/support'

const resolve = (r: { id: string; version: number }) => DEFINITIONS.find((d) => d.id === r.id && d.version === r.version) ?? null
const NESTED = { nested: true, resolve }
const path = (...p: string[]): Expression => ({ kind: 'path', path: p })
const example = PINS.find((p) => p.key === 'applicant')!.example!
const OUT = defineVersion({ id: 'summary', version: 1, name: 'Summary', workspaceId: WORKSPACE, fields: [
  { name: 'email', type: 'string', optional: true }, { name: 'city', type: 'string' }, { name: 'phone', type: 'string', optional: true },
] })
const root = join(import.meta.dirname, '..')
const read = (p: string) => readFileSync(join(root, p), 'utf8')

describe('The step’s Transform version is chosen explicitly', () => {
  it('offers v3 as provisional, and the step keeps v2 until someone picks another', () => {
    expect(TRANSFORMS.map((t) => [featureKey(t.feature), t.label])).toEqual([['orbit.transform@2', 'Orbit.Transform v2'], ['orbit.transform@3', 'Orbit.Transform v3 (provisional)']])
    expect(INITIAL_STEP_FEATURES.transform).toBe('orbit.transform@2')
    const designer = read('app/dev/designer/SpatialDesigner.vue')
    expect(designer).toContain('@feature="stepFeatures.transform = $event"')
    expect(designer).toContain('const support = computed(() => transformSupport(input.value, target.value.definition, features.value.transform, resolve))')
    expect(designer).toContain('provide(READING, computed(() => support.value.reading!))')
    expect(read('app/dev/designer/TransformInspector.vue')).toMatch(/<select :value="featureKey"[^>]*data-transform-version @change="emit\('feature'/)
  })

  it('says composed input is unsupported by v2 and fine for v3; composed output is unsupported by both', () => {
    const composedOut = defineVersion({ id: 'co', version: 1, name: 'Composed', workspaceId: WORKSPACE, fields: [{ name: 'home', type: 'reference', definition: { id: 'address', version: 1 } }] }, resolve)
    expect(reviewDraft([], APPLICANT, B1, 'B', transformSupport(APPLICANT, B1, orbitTransformV2, resolve)).unsupported).toMatch(/^Transform v2 doesn’t support objects or other Definitions inside what it reads \(contact, preferences, home\)/)
    expect(reviewDraft([], APPLICANT, B1, 'B', transformSupport(APPLICANT, B1, orbitTransformV3, resolve)).unsupported).toBeNull()
    expect(reviewDraft([], APPLICANT, composedOut, 'C', transformSupport(APPLICANT, composedOut, orbitTransformV3, resolve)).unsupported).toMatch(/^Transform v3 doesn’t support objects or other Definitions inside what it makes \(home\)/)
  })
})

describe('Sources follow the chosen version’s reading', () => {
  it('offers nested values by path, with what may make them absent, only when the version reads them', () => {
    expect(readables(FLAT, APPLICANT).map((r) => r.path)).toEqual([['firstName'], ['lastName']])
    expect(readables(NESTED, APPLICANT).map((r) => [r.path.join(' › '), r.optional.map((p) => p.join(' › '))])).toEqual([
      ['firstName', []], ['lastName', []],
      ['contact › email', ['contact']], ['contact › phone', ['contact', 'contact › phone']],
      ['home › street', []], ['home › city', []], ['home › postcode', ['home › postcode']],
      ['preferences › newsletter', ['preferences', 'preferences › newsletter']],
    ])
  })

  it('checks a nested source as the version does: refused by v2’s reading, typed by v3’s, placed where it is', () => {
    expect(checkWith(FLAT, [{ name: 'city', source: path('home', 'city') }], APPLICANT).issues).toEqual([{ problem: 'unsupported_source', path: ['city'] }])
    expect(checkWith(NESTED, [{ name: 'city', source: path('home', 'city') }], APPLICANT)).toMatchObject({ issues: [], types: ['string'], absent: [[]] })
    const wrong = checkWith(NESTED, [{ name: 'city', source: { kind: 'call', fn: 'trim', args: [path('home', 'town')] } }], APPLICANT).issues
    expect(wrong).toEqual([{ problem: 'unknown_path_property', at: { output: ['city'], expression: ['trim', 0] }, step: 1, name: 'town', path: ['city', 'trim', 0] }])
  })

  it('keeps a nested source as a part, exactly, both ways; anything else stays as it is', () => {
    expect(toPiece(path('home', 'city'))).toEqual({ kind: 'nested', path: ['home', 'city'], trim: false })
    expect(fromPiece(toPiece(path('home', 'city')))).toEqual(path('home', 'city'))
    const trimmed = { kind: 'call', fn: 'trim', args: [path('contact', 'email')] } as Expression
    expect(toPiece(trimmed)).toEqual({ kind: 'nested', path: ['contact', 'email'], trim: true })
    expect(fromPiece(toPiece(trimmed))).toEqual(trimmed)
    // A one-name path isn't a nested source: kept exactly, for the advanced editor (and refused there).
    expect(toPiece(path('home'))).toEqual({ kind: 'advanced', expression: path('home') })
  })
})

describe('Review and preview agree with execution', () => {
  const ex = exampleFrom(JSON.stringify(example), APPLICANT, resolve)

  it('reads the example against the resolved composed input', () => {
    expect('data' in ex && ex.data).toEqual(example)
  })

  it('previews exactly what v3 makes, absence included', () => {
    const properties = [
      { name: 'email', source: path('contact', 'email') },
      { name: 'city', source: path('home', 'city') },
      { name: 'phone', source: path('contact', 'phone') },
    ]
    const preview = previewOutput(properties, APPLICANT, OUT, ex, NESTED)
    expect(preview.values).toEqual([{ value: 'ada@example.com' }, { value: 'London' }, { absent: ['contact › phone'] }])
    expect(preview.fits).toEqual({ issues: [] })
    const mapping: Mapping = { id: 'm', version: 1, workspaceId: WORKSPACE, from: refOf(APPLICANT), to: refOf(OUT), properties }
    const definitions: DefinitionVersion[] = [...DEFINITIONS, OUT]
    const ran = invoke({ definitions, records: [{ id: 'r', workspaceId: WORKSPACE, definition: refOf(APPLICANT), data: example }], mappings: [mapping] },
      { workspaceId: WORKSPACE, feature: orbitTransformV3, input: { record: 'r' }, mapping: { id: 'm', version: 1 } })
    expect(ran.output!.data).toEqual({ email: 'ada@example.com', city: 'London' })
    // Without contact, absence comes from the parent.
    const bare = { ...example } as Record<string, unknown>
    delete bare.contact
    expect(previewSource(path('contact', 'email'), APPLICANT, exampleFrom(JSON.stringify(bare), APPLICANT, resolve), NESTED)).toEqual({ absent: ['contact'] })
  })

  it('refuses a required output fed by something that may be absent, as the boundary would', () => {
    const review = reviewDraft([{ name: 'city', source: path('contact', 'email') }], APPLICANT, OUT, 'Summary · v1', transformSupport(APPLICANT, OUT, orbitTransformV3, resolve))
    expect(review.problems).toEqual(['city: contact may be missing, but this property is required. Orbit won’t invent a value.'])
    const ok = reviewDraft([{ name: 'email', source: path('contact', 'email') }, { name: 'city', source: path('home', 'city') }], APPLICANT, OUT, 'Summary · v1', transformSupport(APPLICANT, OUT, orbitTransformV3, resolve))
    expect(ok.problems).toEqual([])
  })

  it('keeps flat review exactly as before with v2', () => {
    expect(reviewDraft(INITIAL_MAPPING.properties, A1, B1, 'B', transformSupport(A1, B1, orbitTransformV2, resolve)).problems).toEqual([])
  })
})

describe('The Transform’s input, chosen on purpose', () => {
  it('keeps Mappings from Definition A exactly as they were; another input is another Mapping', () => {
    expect(mappingIdFor(refOf(B1))).toBe(INITIAL_MAPPING.id)
    expect(mappingIdFor(refOf(B1), refOf(A1))).toBe(INITIAL_MAPPING.id)
    expect(mappingIdFor(refOf(OUT))).toBe('transform:summary@1')
    expect(mappingIdFor(refOf(B1), refOf(APPLICANT))).toBe('transform:applicant@1->full-name@1')
    expect('input' in draftFrom(initialConfiguration())).toBe(false)
  })

  it('applies a Mapping that reads the chosen input, and comes back to it', () => {
    const initial = initialConfiguration()
    const draft = { ...draftFrom(initial), input: refOf(APPLICANT), properties: [{ name: 'fullName', piece: { kind: 'nested', path: ['home', 'city'], trim: false } as const }] }
    expect(planApply(initial, draft)).toMatchObject({ mapping: { id: 'transform:applicant@1->full-name@1', version: 1, isNew: true }, changes: true })
    const applied = applyConfiguration(initial, draft)
    const mapping = applied.mappings.at(-1)!
    expect(mapping).toMatchObject({ from: { id: 'applicant', version: 1 }, to: { id: 'full-name', version: 1 }, properties: [{ name: 'fullName', source: path('home', 'city') }] })
    expect(inputOf(draftFrom(applied))).toEqual({ id: 'applicant', version: 1 })
    // Nothing changed since: Apply makes nothing (presentation never makes a version).
    expect(planApply(applied, draftFrom(applied)).changes).toBe(false)
  })

  it('offers the input choice in Structure, never changing it by itself', () => {
    const structure = read('app/dev/designer/StructureEditor.vue')
    expect(structure).toMatch(/<select id="input-definition"[^>]*data-input-definition @change="setInput/)
    expect(read('app/dev/designer/ValuePicker.vue')).toContain('· may be absent: {{ absentWords(r.optional) }}')
  })
})

describe('Historical evidence', () => {
  it('names the version each run invoked, whatever the step uses now', () => {
    const data: Data = { firstName: 'Ada', lastName: 'Lovelace' }
    const catalog = { definitions: [A1, B1], records: [{ id: 'r', workspaceId: WORKSPACE, definition: refOf(A1), data }], mappings: [INITIAL_MAPPING] }
    const runWith = (feature: typeof orbitTransformV2) => invoke(catalog, { workspaceId: WORKSPACE, feature, input: { record: 'r' }, mapping: { id: INITIAL_MAPPING.id, version: 1 } })
    const first = runWith(orbitTransformV2)
    const second = runWith(orbitTransformV3)
    expect([first.evidence.feature, second.evidence.feature]).toEqual([{ id: 'orbit.transform', version: 2 }, { id: 'orbit.transform', version: 3 }])
    expect(first.evidence.mapping).toEqual(second.evidence.mapping)
  })
})
