// The Studio's compact status and the structured problems it's made from. Invalid, Incompatible,
// Incomplete, Unchanged or Compatible, decided by problem categories (from the domain's issue kinds),
// never by their words.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { defineVersion } from '../shared/features/definitions'
import { orbitTransformV1, orbitTransformV2, orbitTransformV3 } from '../shared/features/features'
import { APPLICANT, DEFINITIONS, WORKSPACE } from '../app/dev/features/experiment'
import { type DraftProperty, type Piece, fromDraft } from '../app/dev/designer/parts'
import { reviewDraft } from '../app/dev/designer/preview'
import type { Problem } from '../app/dev/designer/problems'
import { studioStatus } from '../app/dev/designer/studio'
import { boundaryFindings, transformSupport } from '../app/dev/designer/support'

const resolve = (r: { id: string; version: number }) => DEFINITIONS.find((d) => d.id === r.id && d.version === r.version) ?? null
const field = (name: string): Piece => ({ kind: 'field', name, trim: false })
const nested = (...path: string[]): Piece => ({ kind: 'nested', path, trim: false })
const SOUND: DraftProperty[] = [
  { name: 'firstName', piece: field('firstName') },
  { name: 'lastName', piece: field('lastName') },
  { name: 'contact', piece: { kind: 'construct', presence: { when: 'present', source: ['contact'] }, properties: [{ name: 'email', piece: nested('contact', 'email') }] } },
  { name: 'home', piece: { kind: 'copy', from: ['home'] } },
]
const structureProblem = (words: string): Problem => ({ kind: 'structure', category: 'invalid', at: null, index: null, words, short: words })
const review = (draft: DraftProperty[], feature = orbitTransformV3, label = 'Applicant · v1') =>
  reviewDraft(fromDraft(draft), APPLICANT, APPLICANT, label, transformSupport(APPLICANT, APPLICANT, feature, resolve))
const status = (draft: DraftProperty[], { changes = true, structure = [] as string[], feature = orbitTransformV3 } = {}) => {
  const r = review(draft, feature)
  const refused = r.findings.length ? [] : boundaryFindings(feature, fromDraft(draft), APPLICANT, APPLICANT, resolve)
  return studioStatus(changes, [...structure.map(structureProblem), ...r.findings, ...refused])
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

  it('is Invalid when the Mapping is wrong whatever version runs it, each problem where it is, apart from what’s missing', () => {
    const draft = [...SOUND.filter((p) => p.name !== 'lastName').map((p) => (p.name === 'contact' ? { ...p, piece: { kind: 'construct', presence: { when: 'always' }, properties: [{ name: 'email', piece: nested('contact', 'email') }] } as Piece } : p)), { name: 'nickname', piece: field('firstName') }]
    const s = status(draft)
    expect(s.state).toBe('invalid')
    expect(at(s.problems)).toEqual(['contact › email: contact may be missing, but this property is required.', '-: nickname: not in Applicant · v1'])
    expect(at(s.todo)).toEqual(['lastName: Needs a value'])
  })

  it('counts the output’s structure as invalid, in General', () => {
    expect(status(SOUND, { structure: ['Give the output a name.'] }).problems).toEqual([{ text: 'Give the output a name.', at: null, where: 'general', category: 'invalid' }])
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
    const draft: DraftProperty[] = [{ name: 'nick', piece: field('nickname') }]
    const r = reviewDraft(fromDraft(draft), NICKNAMED, NICK, 'Nick · v1', transformSupport(NICKNAMED, NICK, orbitTransformV1))
    const refused = r.findings.length ? [] : boundaryFindings(orbitTransformV1, fromDraft(draft), NICKNAMED, NICK)
    expect(studioStatus(true, [...r.findings, ...refused]).state).toBe('incompatible')
    expect(studioStatus(true, reviewDraft(fromDraft(draft), NICKNAMED, NICK, 'Nick · v1', transformSupport(NICKNAMED, NICK, orbitTransformV2)).findings).state).toBe('compatible')
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
    expect(studioStatus(true, a.findings)).toEqual({ ...studioStatus(true, b.findings), problems: expect.any(Array) })
    expect(studioStatus(true, a.findings).problems.map((p) => [p.at, p.category])).toEqual(studioStatus(true, b.findings).problems.map((p) => [p.at, p.category]))
  })

  it('tells a mapping with no place apart by its reason, even when the words look alike', () => {
    // A name that starts the same way as another reason's words: once read as "not in the output".
    for (const label of ['Another value', 'It']) {
      expect(review(messy, orbitTransformV3, label).extras.map((x) => x.why)).toEqual(['duplicate', 'unnamed', 'unknown'])
      expect(studioStatus(true, review(messy, orbitTransformV3, label).findings).problems.filter((p) => p.at === null).map((p) => p.text)).toEqual([
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
