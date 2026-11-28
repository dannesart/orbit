// Phase 4.3, part D: the Designer builds output objects with Transform v3. Its review, preview and
// pickers use the domain's own checks, evaluation and presence-guarantee rule; nothing in the
// Designer interprets availability on its own.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { refOf } from '../shared/features/definitions'
import { invoke, orbitTransformV2, orbitTransformV3 } from '../shared/features/features'
import { type Expression, type Mapping, objectPaths } from '../shared/features/mappings'
import { APPLICANT, DEFINITIONS, PINS, WORKSPACE } from '../app/dev/features/experiment'
import { type DraftProperty, type Piece, fromDraft, fromPiece, toPiece } from '../app/dev/designer/parts'
import { exampleFrom, previewOutput, reviewDraft } from '../app/dev/designer/preview'
import { reconcile } from '../app/dev/designer/switching'
import { draftFrom, initialConfiguration } from '../app/dev/designer/config'
import { transformSupport } from '../app/dev/designer/support'

const resolve = (r: { id: string; version: number }) => DEFINITIONS.find((d) => d.id === r.id && d.version === r.version) ?? null
const NESTED = { nested: true, resolve }
const example = PINS.find((p) => p.key === 'applicant')!.example!
const field = (name: string): Piece => ({ kind: 'field', name, trim: false })
const nested = (...path: string[]): Piece => ({ kind: 'nested', path, trim: false })
const construct = (presence: { when: 'always' } | { when: 'present'; source: string[] }, properties: DraftProperty[]): Piece => ({ kind: 'construct', presence, properties })
// Applicant to Applicant, built property by property.
const DRAFT: DraftProperty[] = [
  { name: 'firstName', piece: field('firstName') },
  { name: 'lastName', piece: field('lastName') },
  { name: 'contact', piece: construct({ when: 'present', source: ['contact'] }, [{ name: 'email', piece: nested('contact', 'email') }, { name: 'phone', piece: nested('contact', 'phone') }]) },
  { name: 'home', piece: construct({ when: 'always' }, [{ name: 'street', piece: nested('home', 'street') }, { name: 'city', piece: nested('home', 'city') }, { name: 'postcode', piece: nested('home', 'postcode') }]) },
  { name: 'preferences', piece: construct({ when: 'always' }, []) },
]
const support = transformSupport(APPLICANT, APPLICANT, orbitTransformV3, resolve)
const read = (p: string) => readFileSync(join(import.meta.dirname, '..', p), 'utf8')

describe('Built objects as parts of the draft', () => {
  it('keep a construction exactly, both ways', () => {
    const expression = fromPiece(DRAFT[2]!.piece)
    expect(expression).toEqual({ kind: 'construct', presence: { when: 'present', source: ['contact'] }, properties: [
      { name: 'email', source: { kind: 'path', path: ['contact', 'email'] } }, { name: 'phone', source: { kind: 'path', path: ['contact', 'phone'] } },
    ] })
    expect(toPiece(expression)).toEqual(DRAFT[2]!.piece)
  })

  it('stay with an object property when the output is switched', () => {
    const draft = { ...draftFrom(initialConfiguration()), input: refOf(APPLICANT), use: 'catalogue' as const, catalogue: refOf(APPLICANT), properties: DRAFT }
    expect(reconcile(draft, APPLICANT, APPLICANT, NESTED).properties.map((p) => p.name)).toEqual(DRAFT.map((p) => p.name))
  })
})

describe('Review, with the domain’s own check', () => {
  it('accepts a sound built output, the conditional contact included', () => {
    expect(reviewDraft(fromDraft(DRAFT), APPLICANT, APPLICANT, 'Applicant · v1', support).problems).toEqual([])
  })

  it('says exactly where something is missing or may be absent, by path', () => {
    const incomplete = DRAFT.map((p) => (p.name === 'home' ? { ...p, piece: construct({ when: 'always' }, [{ name: 'street', piece: nested('home', 'street') }]) } : p))
    expect(reviewDraft(fromDraft(incomplete), APPLICANT, APPLICANT, 'Applicant · v1', support).problems).toEqual(['home › city: city needs a value.'])
    const always = DRAFT.map((p) => (p.name === 'contact' ? { ...p, piece: construct({ when: 'always' }, [{ name: 'email', piece: nested('contact', 'email') }]) } : p))
    expect(reviewDraft(fromDraft(always), APPLICANT, APPLICANT, 'Applicant · v1', support).problems).toEqual(['contact › email: contact may be missing, but this property is required.'])
  })

  it('keeps v2 truthful: it can’t build objects', () => {
    expect(reviewDraft(fromDraft(DRAFT), APPLICANT, APPLICANT, 'Applicant · v1', transformSupport(APPLICANT, APPLICANT, orbitTransformV2, resolve)).unsupported).toMatch(/^Transform v2 doesn’t support/)
  })
})

describe('Preview and execution agree', () => {
  const run = (data: object) => {
    const mapping: Mapping = { id: 'm', version: 1, workspaceId: WORKSPACE, from: refOf(APPLICANT), to: refOf(APPLICANT), properties: fromDraft(DRAFT) }
    return invoke({ definitions: [...DEFINITIONS], records: [{ id: 'r', workspaceId: WORKSPACE, definition: refOf(APPLICANT), data: data as never }], mappings: [mapping] },
      { workspaceId: WORKSPACE, feature: orbitTransformV3, input: { record: 'r' }, mapping: { id: 'm', version: 1 } })
  }
  const preview = (data: object) => previewOutput(fromDraft(DRAFT), APPLICANT, APPLICANT, exampleFrom(JSON.stringify(data), APPLICANT, resolve), NESTED)

  it('with the contact there: the same built objects, and a fit', () => {
    const p = preview(example)
    expect(p.fits).toEqual({ issues: [] })
    const made = Object.fromEntries(fromDraft(DRAFT).flatMap((x, i) => { const v = p.values[i]!; return 'value' in v ? [[x.name, v.value]] : 'object' in v ? [[x.name, v.object]] : [] }))
    expect(made).toEqual(run(example).output!.data)
    expect(made).toEqual({ firstName: 'Ada', lastName: 'Lovelace', contact: { email: 'ada@example.com' }, home: { street: '12 St James’s Square', city: 'London' }, preferences: {} })
  })

  it('without it: contact left out by its condition, in both', () => {
    const bare = { ...example } as Record<string, unknown>
    delete bare.contact
    expect(preview(bare).values[2]).toEqual({ absent: ['contact'] })
    expect(run(bare).output!.data).not.toHaveProperty('contact')
  })
})

describe('The Designer shows and edits it calmly, with the domain’s rules', () => {
  it('offers source objects for a condition from the contract, references included', () => {
    expect(objectPaths(APPLICANT, resolve).map((o) => [o.path.join(' › '), o.definition ?? null, o.optional.length])).toEqual([
      ['contact', null, 1], ['home', { id: 'address', version: 1 }, 0], ['preferences', null, 1],
    ])
  })

  it('makes presence explicit, and passes the guarantee to the pickers through the domain’s rule', () => {
    const editor = read('app/dev/designer/ConstructionEditor.vue')
    // A local object: left out, always, or when present; a reference chooses leaving out first, then building's presence.
    expect(editor).toContain("v-for=\"m in (isReference ? ['always', 'present'] as const : ['out', 'always', 'present'] as const)\"")
    expect(editor).toContain("provide(GUARANTEED, computed(() => (built.value?.presence.when === 'present' ? [...inherited.value, built.value.presence.source] : inherited.value)))")
    for (const picker of ['ValuePicker.vue', 'ScalarEditor.vue']) expect(read(`app/dev/designer/${picker}`)).toContain('notGuaranteed(r.optional, guaranteed.value)')
    expect(read('app/dev/designer/PropertyEditor.vue')).toContain('<ConstructionEditor')
    // A built object's example shows its first level in the inspector's row; the whole of it in JSON.
    expect(read('app/dev/designer/PropertyRows.vue')).toContain(`v-if="r.example?.kind === 'object' && r.example.entries.length"`)
  })

  it('never offers the advanced editor for a built object', () => {
    expect(read('app/dev/designer/PropertyEditor.vue')).toContain("piece.kind !== 'advanced' && piece.kind !== 'construct'")
    expect((fromPiece(DRAFT[3]!.piece) as Expression).kind).toBe('construct')
  })
})
