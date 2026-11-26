// Phase 4.5B: the Studio's compact status. Incompatible, Incomplete, Unchanged or Compatible, from
// the domain's checks only, and each thing to do where it is.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { orbitTransformV2, orbitTransformV3 } from '../shared/features/features'
import { APPLICANT, DEFINITIONS } from '../app/dev/features/experiment'
import { type DraftProperty, type Piece, fromDraft } from '../app/dev/designer/parts'
import { reviewDraft } from '../app/dev/designer/preview'
import { outputTree, studioStatus } from '../app/dev/designer/studio'
import { transformSupport } from '../app/dev/designer/support'

const resolve = (r: { id: string; version: number }) => DEFINITIONS.find((d) => d.id === r.id && d.version === r.version) ?? null
const field = (name: string): Piece => ({ kind: 'field', name, trim: false })
const nested = (...path: string[]): Piece => ({ kind: 'nested', path, trim: false })
const SOUND: DraftProperty[] = [
  { name: 'firstName', piece: field('firstName') },
  { name: 'lastName', piece: field('lastName') },
  { name: 'contact', piece: { kind: 'construct', presence: { when: 'present', source: ['contact'] }, properties: [{ name: 'email', piece: nested('contact', 'email') }] } },
  { name: 'home', piece: { kind: 'copy', from: ['home'] } },
]
const status = (draft: DraftProperty[], { changes = true, structure = [] as string[], boundary = [] as string[], feature = orbitTransformV3 } = {}) => {
  const review = reviewDraft(fromDraft(draft), APPLICANT, APPLICANT, 'Applicant · v1', transformSupport(APPLICANT, APPLICANT, feature, resolve))
  const s = studioStatus(changes, structure, review, boundary, outputTree(APPLICANT, draft, review, resolve), draft.map((p) => p.name), 'Applicant · v1')
  // The same condition Apply has everywhere (SpatialDesigner's apply, the ApplyBar).
  const applicable = changes && !structure.length && !review.problems.length && !boundary.length
  expect(s.state === 'compatible').toBe(applicable)
  return s
}
const at = (items: readonly { at: readonly string[] | null; text: string }[]) => items.map((i) => `${i.at?.join(' › ') ?? '-'}: ${i.text}`)

describe('Where the draft stands', () => {
  it('is Compatible when changed, complete and sound; Unchanged when it’s what’s applied', () => {
    expect(status(SOUND).state).toBe('compatible')
    expect(status(SOUND, { changes: false }).state).toBe('unchanged')
  })

  it('is Incomplete while something required has no value, at any depth, each by its place', () => {
    const draft = SOUND.filter((p) => p.name !== 'lastName').map((p) => (p.name === 'contact' ? { ...p, piece: { kind: 'construct', presence: { when: 'present', source: ['contact'] }, properties: [] } as Piece } : p))
    const s = status(draft)
    expect(s.state).toBe('incomplete')
    expect(s.problems).toEqual([])
    expect(at(s.todo)).toEqual(['lastName: Needs a value', 'contact › email: Needs a value'])
  })

  it('is Incompatible when something is wrong, and says so where it is, ahead of what’s missing', () => {
    const draft = [...SOUND.filter((p) => p.name !== 'lastName').map((p) => (p.name === 'contact' ? { ...p, piece: { kind: 'construct', presence: { when: 'always' }, properties: [{ name: 'email', piece: nested('contact', 'email') }] } as Piece } : p)), { name: 'nickname', piece: field('firstName') }]
    const s = status(draft)
    expect(s.state).toBe('incompatible')
    expect(at(s.problems)).toEqual(['contact › email: contact may be missing, but this property is required.', '-: nickname: not in Applicant · v1'])
    expect(at(s.todo)).toEqual(['lastName: Needs a value'])
  })

  it('counts the output’s structure and what the step’s Transform version accepts', () => {
    expect(status(SOUND, { structure: ['Give the output a name.'] }).problems).toEqual([{ text: 'Give the output a name.', at: null, where: 'general' }])
    expect(status(SOUND, { boundary: ['Transform v1 can’t read optional values.'] }).state).toBe('incompatible')
  })

  it('is Incompatible, once, when the Transform version can’t take these contracts at all', () => {
    const s = status(SOUND, { feature: orbitTransformV2 })
    expect(s.state).toBe('incompatible')
    expect(s.problems).toHaveLength(1)
    expect(s.problems[0]!.where).toBe('general')
    expect(s.todo).toEqual([])
  })
})

describe('The compact bar', () => {
  const bar = readFileSync(join(import.meta.dirname, '../app/dev/designer/StudioStatusBar.vue'), 'utf8')
  it('names the four states, and keeps the details for when they’re asked for', () => {
    for (const w of ['Incompatible', 'Incomplete', 'Unchanged', 'Compatible']) expect(bar).toContain(`words: '${w}'`)
    expect(bar).toContain('v-if="open && items.length"')
    expect(bar).toContain(':aria-expanded="open"')
  })
})
