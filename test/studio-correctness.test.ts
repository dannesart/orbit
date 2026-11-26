// Phase 4.5B, correctness: an untouched own output never reads as someone's work after Apply, and a
// required value inside a built object that nothing makes yet is unfinished work, not an error.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { refOf } from '../shared/features/definitions'
import { orbitTransformV3 } from '../shared/features/features'
import { APPLICANT, DEFINITIONS } from '../app/dev/features/experiment'
import { applyConfiguration, draftFrom, initialConfiguration } from '../app/dev/designer/config'
import { type DraftProperty, type Piece, fromDraft } from '../app/dev/designer/parts'
import { reviewDraft } from '../app/dev/designer/preview'
import { draftAfterApply, draftLoses } from '../app/dev/designer/session'
import { transformSupport } from '../app/dev/designer/support'

const resolve = (r: { id: string; version: number }) => DEFINITIONS.find((d) => d.id === r.id && d.version === r.version) ?? null
const field = (name: string): Piece => ({ kind: 'field', name, trim: false })
const nested = (...path: string[]): Piece => ({ kind: 'nested', path, trim: false })
const review = (draft: DraftProperty[]) => reviewDraft(fromDraft(draft), APPLICANT, APPLICANT, 'Applicant · v1', transformSupport(APPLICANT, APPLICANT, orbitTransformV3, resolve))

describe('Discarding after Apply asks only about what someone wrote', () => {
  const start = initialConfiguration()
  const switched = { ...draftFrom(start), catalogue: refOf(APPLICANT), properties: [{ name: 'firstName', piece: field('firstName') }] }

  it('lets an untouched own output follow what’s applied, so Cancel doesn’t warn about it', () => {
    const after = applyConfiguration(start, switched)
    const draft = draftAfterApply(switched, start, after)
    expect(draft.local).toEqual(draftFrom(after).local)
    expect(draftLoses(draft, draftFrom(after))).not.toContain('Changes to the Transform’s own output')
    // As it was: the untouched copy of the old output counted as a change.
    expect(draftLoses({ ...switched, properties: draft.properties }, draftFrom(after))).toContain('Changes to the Transform’s own output')
  })

  it('keeps an own output someone changed, and still warns about it', () => {
    const edited = { ...switched, local: { ...switched.local, name: 'Summary' } }
    const after = applyConfiguration(start, edited)
    const draft = draftAfterApply(edited, start, after)
    expect(draft.local.name).toBe('Summary')
    expect(draftLoses(draft, draftFrom(after))).toContain('Changes to the Transform’s own output')
  })

  it('doesn’t count a mapping set aside exactly as an applied version has it: that version keeps it', () => {
    const aside = { name: 'fullName', piece: field('firstName') }
    const draft = { ...draftFrom(start), properties: [], aside: [aside] }
    expect(draftLoses(draft, draftFrom(start))).toContain('1 mapping set aside when you switched Definitions')
    expect(draftLoses(draft, draftFrom(start), [{ properties: [{ name: 'fullName', source: { kind: 'property', name: 'firstName' } }] }])).toEqual([])
    // One someone wrote is still work.
    expect(draftLoses({ ...draft, aside: [{ name: 'fullName', piece: field('lastName') }] }, draftFrom(start), [{ properties: [{ name: 'fullName', source: { kind: 'property', name: 'firstName' } }] }])).toContain('1 mapping set aside when you switched Definitions')
  })

  it('is what Apply does', () => {
    const page = readFileSync(join(import.meta.dirname, '../app/dev/designer/SpatialDesigner.vue'), 'utf8')
    expect(page).toContain('setDraft(draftAfterApply(draft.value, before, config.value), false)')
  })
})

describe('A value missing inside a built object is unfinished work', () => {
  const draft: DraftProperty[] = [
    { name: 'firstName', piece: field('firstName') },
    { name: 'lastName', piece: field('lastName') },
    { name: 'contact', piece: { kind: 'construct', presence: { when: 'present', source: ['contact'] }, properties: [] } },
    { name: 'home', piece: { kind: 'construct', presence: { when: 'always' }, properties: [{ name: 'street', piece: nested('home', 'street') }] } },
  ]

  it('is listed with what’s missing, by its path, and never as an error', () => {
    const r = review(draft)
    expect(r.missing).toEqual(['contact › email', 'home › city'])
    expect(r.errors).toEqual([])
    // Still not complete: Apply waits for it.
    expect(r.problems.length).toBe(2)
  })

  it('still tells a real error inside a built object apart', () => {
    const wrong: DraftProperty[] = draft.map((p) => (p.name === 'contact' ? { ...p, piece: { kind: 'construct', presence: { when: 'always' }, properties: [{ name: 'email', piece: nested('contact', 'email') }] } as Piece } : p))
    const r = review(wrong)
    expect(r.missing).toEqual(['home › city'])
    expect(r.errors).toEqual(['contact › email: contact may be missing, but this property is required.'])
  })
})
