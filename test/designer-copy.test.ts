// Phase 4.4, part C: the Designer copies a whole referenced value with Transform v3, as an explicit
// alternative to building it. What may be copied, and whether it fits, is the domain's check; the
// preview evaluates as the Transform runs.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { type DefinitionVersion, defineVersion, refOf } from '../shared/features/definitions'
import { invoke, orbitTransformV3 } from '../shared/features/features'
import type { Mapping } from '../shared/features/mappings'
import { APPLICANT, DEFINITIONS, PINS, WORKSPACE } from '../app/dev/features/experiment'
import { type DraftProperty, type Piece, fromDraft, fromPiece, toPiece } from '../app/dev/designer/parts'
import { exampleFrom, previewOutput, reviewDraft } from '../app/dev/designer/preview'
import { reconcile } from '../app/dev/designer/switching'
import { draftFrom, initialConfiguration } from '../app/dev/designer/config'
import { transformSupport } from '../app/dev/designer/support'

const ADDRESS = DEFINITIONS.find((d) => d.id === 'address')!
const LOOKALIKE = defineVersion({ id: 'address-lookalike', version: 1, name: 'Address', workspaceId: WORKSPACE, fields: ADDRESS.fields })
const WANTS_LOOKALIKE = defineVersion({ id: 'wants-lookalike', version: 1, name: 'Wants', workspaceId: WORKSPACE, fields: [{ name: 'home', type: 'reference', definition: refOf(LOOKALIKE) }] }, (r) => (r.id === LOOKALIKE.id ? LOOKALIKE : null))
const all: DefinitionVersion[] = [...DEFINITIONS, LOOKALIKE, WANTS_LOOKALIKE]
const resolve = (r: { id: string; version: number }) => all.find((d) => d.id === r.id && d.version === r.version) ?? null
const NESTED = { nested: true, resolve }
const example = PINS.find((p) => p.key === 'applicant')!.example!
const field = (name: string): Piece => ({ kind: 'field', name, trim: false })
const DRAFT: DraftProperty[] = [
  { name: 'firstName', piece: field('firstName') },
  { name: 'lastName', piece: field('lastName') },
  { name: 'home', piece: { kind: 'copy', from: ['home'] } },
]
const support = (output: DefinitionVersion) => transformSupport(APPLICANT, output, orbitTransformV3, resolve)
const read = (p: string) => readFileSync(join(import.meta.dirname, '..', p), 'utf8')

describe('A copy as a part of the draft', () => {
  it('is kept exactly both ways, and an unchosen one stays unchosen', () => {
    expect(fromPiece(DRAFT[2]!.piece)).toEqual({ kind: 'copy', from: ['home'] })
    expect(toPiece({ kind: 'copy', from: ['home'] })).toEqual({ kind: 'copy', from: ['home'] })
    expect(toPiece({ kind: 'copy', from: [] })).toEqual({ kind: 'copy', from: [] })
  })

  it('stays with its property when the output is switched', () => {
    const draft = { ...draftFrom(initialConfiguration()), input: refOf(APPLICANT), use: 'catalogue' as const, catalogue: refOf(APPLICANT), properties: DRAFT }
    expect(reconcile(draft, APPLICANT, APPLICANT, NESTED).properties.map((p) => p.name)).toEqual(['firstName', 'lastName', 'home'])
  })
})

describe('Review, with the domain’s own check', () => {
  it('accepts a copy of exactly the same Definition version', () => {
    expect(reviewDraft(fromDraft(DRAFT), APPLICANT, APPLICANT, 'Applicant · v1', support(APPLICANT)).problems).toEqual([])
  })

  it('refuses a copy with nothing chosen yet, so it can’t be applied', () => {
    const unchosen = DRAFT.map((p) => (p.name === 'home' ? { ...p, piece: { kind: 'copy', from: null } as Piece } : p))
    expect(reviewDraft(fromDraft(unchosen), APPLICANT, APPLICANT, 'Applicant · v1', support(APPLICANT)).problems).toEqual(['home: A copy needs the exact path of what it copies.'])
  })

  it('says why another Definition can’t be copied, however alike', () => {
    expect(reviewDraft([{ name: 'home', source: { kind: 'copy', from: ['home'] } }], APPLICANT, WANTS_LOOKALIKE, 'Wants · v1', support(WANTS_LOOKALIKE)).problems)
      .toEqual(['home: That is a different Definition. Only exactly the same Definition and version can be copied, whatever it contains: build it instead.'])
  })
})

describe('Preview and execution agree', () => {
  it('copy the same value', () => {
    const preview = previewOutput(fromDraft(DRAFT), APPLICANT, APPLICANT, exampleFrom(JSON.stringify(example), APPLICANT, resolve), NESTED)
    expect(preview.values[2]).toEqual({ object: example.home })
    expect(preview.fits).toEqual({ issues: [] })
    const mapping: Mapping = { id: 'm', version: 1, workspaceId: WORKSPACE, from: refOf(APPLICANT), to: refOf(APPLICANT), properties: fromDraft(DRAFT) }
    const ran = invoke({ definitions: all, records: [{ id: 'r', workspaceId: WORKSPACE, definition: refOf(APPLICANT), data: example }], mappings: [mapping] },
      { workspaceId: WORKSPACE, feature: orbitTransformV3, input: { record: 'r' }, mapping: { id: 'm', version: 1 } })
    expect(ran.output!.data).toEqual({ firstName: 'Ada', lastName: 'Lovelace', home: example.home })
  })
})

describe('The Designer offers building and copying, explicitly', () => {
  const editor = read('app/dev/designer/ConstructionEditor.vue')
  it('offers both ways for a reference, chosen on purpose, and only building for a local object', () => {
    expect(editor).toContain("v-for=\"w in (optional ? ['out', 'construct', 'copy'] as const : ['construct', 'copy'] as const)\"")
    expect(editor).toContain('<div v-if="isReference"')
    expect(editor).toContain("emit('set', kept.copy ?? { kind: 'copy', from: null })")
  })

  it('lists every referenced value with its exact version; anything else can’t be chosen, and says why', () => {
    expect(editor).toContain("const why = fits || !wanted ? '' : c.definition.id === wanted.id ? 'another version' : 'another Definition'")
    expect(editor).toContain(':disabled="!c.fits"')
    expect(editor).toContain('<option value="" disabled>Choose a value to copy…</option>')
    expect(editor).toContain("absence: absenceWords(notGuaranteed(c.optional, inherited.value))")
  })

  it('keeps the other way’s work while switching, and never offers the advanced editor for a copy', () => {
    expect(editor).toContain('if (built.value) kept.construct = built.value')
    expect(read('app/dev/designer/PropertyEditor.vue')).toContain("piece.kind !== 'advanced' && piece.kind !== 'construct' && piece.kind !== 'copy'")
  })
})
