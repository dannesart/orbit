// The Studio's compact status and the structured problems it's made from. Invalid, Incompatible,
// Incomplete, Unchanged or Compatible, decided by problem categories (from the domain's issue kinds),
// never by their words.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { defineVersion, refOf } from '../shared/features/definitions'
import { orbitTransformV1, orbitTransformV2, orbitTransformV3 } from '../shared/features/features'
import { APPLICANT, DEFINITIONS, WORKSPACE } from '../app/dev/features/experiment'
import { type DraftProperty, type Piece, fromDraft } from '../app/dev/designer/parts'
import { reviewDraft } from '../app/dev/designer/preview'
import type { Problem } from '../app/dev/designer/problems'
import { studioStatus } from '../app/dev/designer/studio'
import { transformSupport } from '../app/dev/designer/support'
import { type TransformDraft, applyConfiguration, assessApply, draftFrom, initialConfiguration } from '../app/dev/designer/config'
import { stepOf } from './apply'

const resolve = (r: { id: string; version: number }) => DEFINITIONS.find((d) => d.id === r.id && d.version === r.version) ?? null
const field = (name: string): Piece => ({ kind: 'field', name, trim: false })
const nested = (...path: string[]): Piece => ({ kind: 'nested', path, trim: false })
const SOUND: DraftProperty[] = [
  { name: 'firstName', piece: field('firstName') },
  { name: 'lastName', piece: field('lastName') },
  { name: 'contact', piece: { kind: 'construct', presence: { when: 'present', source: ['contact'] }, properties: [{ name: 'email', piece: nested('contact', 'email') }] } },
  { name: 'home', piece: { kind: 'copy', from: ['home'] } },
]
const review = (draft: DraftProperty[], feature = orbitTransformV3, label = 'Applicant · v1') =>
  reviewDraft(fromDraft(draft), APPLICANT, APPLICANT, label, transformSupport(APPLICANT, APPLICANT, feature, resolve))
const start = initialConfiguration()
/** The Studio's status for an Applicant → Applicant draft, from the authoritative assessment. */
const status = (properties: DraftProperty[], { changes = true, unnamedOwnOutput = false, feature = orbitTransformV3 } = {}) => {
  const draft: TransformDraft = unnamedOwnOutput
    ? { ...draftFrom(start), input: refOf(APPLICANT), use: 'local', local: { name: '', fields: APPLICANT.fields }, properties }
    : { ...draftFrom(start), input: refOf(APPLICANT), catalogue: refOf(APPLICANT), properties }
  const config = changes ? start : applyConfiguration(start, draft, stepOf(start, feature)).config
  return studioStatus(assessApply(config, draft, stepOf(config, feature)))
}
/** Items for a review's findings alone (the state isn't what's being looked at). */
const items = (problems: readonly Problem[]) => studioStatus({ state: 'invalid', problems })
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

  it('is Invalid when the Mapping is wrong whatever version runs it, each problem where it is, apart from what’s missing', () => {
    const draft = [...SOUND.filter((p) => p.name !== 'lastName').map((p) => (p.name === 'contact' ? { ...p, piece: { kind: 'construct', presence: { when: 'always' }, properties: [{ name: 'email', piece: nested('contact', 'email') }] } as Piece } : p)), { name: 'nickname', piece: field('firstName') }]
    const s = status(draft)
    expect(s.state).toBe('invalid')
    expect(at(s.problems)).toEqual(['contact › email: contact may be missing, but this property is required.', '-: nickname: not in Applicant · v1'])
    expect(at(s.todo)).toEqual(['lastName: Needs a value'])
  })

  it('counts the output’s structure as invalid, in General', () => {
    const s = status(SOUND, { unnamedOwnOutput: true })
    expect(s.state).toBe('invalid')
    expect(s.problems).toEqual([{ text: 'Give the output a name.', at: null, where: 'general', category: 'invalid' }])
  })

  it('is Incompatible, once, when the Transform version can’t take these contracts at all', () => {
    const s = status(SOUND, { feature: orbitTransformV2 })
    expect(s.state).toBe('incompatible')
    expect(s.problems).toHaveLength(1)
    expect(s.problems[0]!.where).toBe('general')
    expect(s.todo).toEqual([])
  })

  it('is Incompatible when only the version’s limits are in the way: v1 can’t read an optional value', () => {
    const NICKNAMED = defineVersion({ id: 'nicknamed', version: 1, name: 'Nicknamed', workspaceId: WORKSPACE, fields: [{ name: 'nickname', type: 'string', optional: true }] })
    const NICK = defineVersion({ id: 'nick', version: 1, name: 'Nick', workspaceId: WORKSPACE, fields: [{ name: 'nick', type: 'string', optional: true }] })
    const config = initialConfiguration([NICKNAMED, NICK].map((definition) => ({ definition, name: definition.name, source: 'workspace' as const })))
    const draft: TransformDraft = { ...draftFrom(config), input: refOf(NICKNAMED), catalogue: refOf(NICK), properties: [{ name: 'nick', piece: field('nickname') }] }
    expect(studioStatus(assessApply(config, draft, stepOf(config, orbitTransformV1))).state).toBe('incompatible')
    expect(studioStatus(assessApply(config, draft, stepOf(config, orbitTransformV2))).state).toBe('compatible')
  })
})

describe('Words never decide what a problem means', () => {
  const messy: DraftProperty[] = [
    ...SOUND.filter((p) => p.name !== 'lastName').map((p) => (p.name === 'contact' ? { ...p, piece: { kind: 'construct', presence: { when: 'present', source: ['contact'] }, properties: [] } as Piece } : p)),
    { name: 'firstName', piece: field('lastName') },
    { name: '', piece: field('firstName') },
    { name: 'nickname', piece: field('firstName') },
  ]
  const facts = (problems: readonly Problem[]) => problems.map((p) => [p.kind, p.category, p.at?.join(' › ') ?? null, p.index, p.reason ?? null])

  it('classifies the same whatever the words say: here, whatever the output is called', () => {
    const a = review(messy, orbitTransformV3, 'Applicant · v1')
    const b = review(messy, orbitTransformV3, 'Something else entirely')
    expect(a.problems).not.toEqual(b.problems)
    expect(facts(a.findings)).toEqual(facts(b.findings))
    expect(items(a.findings).problems.map((p) => [p.at, p.category, p.where])).toEqual(items(b.findings).problems.map((p) => [p.at, p.category, p.where]))
    expect(items(a.findings).todo).toEqual(items(b.findings).todo)
  })

  it('tells a mapping with no place apart by its reason, even when the words look alike', () => {
    // A name that starts the same way as another reason's words: once read as "not in the output".
    for (const label of ['Another value', 'It']) {
      expect(review(messy, orbitTransformV3, label).extras.map((x) => x.why)).toEqual(['duplicate', 'unnamed', 'unknown'])
      expect(items(review(messy, orbitTransformV3, label).findings).problems.filter((p) => p.at === null).map((p) => p.text)).toEqual([
        'firstName: another value already makes firstName', 'Unnamed: it has no name', `nickname: not in ${label}`,
      ])
    }
  })

  it('keeps unfinished work out of the errors by its kind, not by matching sentences', () => {
    const r = review(messy)
    expect(r.findings.filter((f) => f.category === 'unfinished').map((f) => f.at!.join(' › '))).toEqual(['lastName', 'contact › email'])
    expect(r.missing).toEqual(['lastName', 'contact › email'])
    expect(r.errors).toEqual(r.findings.filter((f) => f.category !== 'unfinished').map((f) => f.words))
  })
})

describe('The compact bar', () => {
  const bar = readFileSync(join(import.meta.dirname, '../app/dev/designer/StudioStatusBar.vue'), 'utf8')
  it('names the states, and keeps the details for when they’re asked for', () => {
    for (const w of ['Invalid', 'Incompatible', 'Incomplete', 'Unchanged', 'Compatible']) expect(bar).toContain(`words: '${w}'`)
    expect(bar).toContain('v-if="open && items.length"')
  })
})
