// Phase 4.5A: Mapping Studio's trees. Views of what exists: the domain's availability, the review's
// states and the domain's located issues; its preview object is the Transform's own evaluation.
import { describe, expect, it } from 'vitest'
import { refOf } from '../shared/features/definitions'
import { invoke, orbitTransformV2, orbitTransformV3 } from '../shared/features/features'
import type { Mapping } from '../shared/features/mappings'
import { A1, APPLICANT, DEFINITIONS, PINS, WORKSPACE } from '../app/dev/features/experiment'
import { type DraftProperty, type Piece, fromDraft } from '../app/dev/designer/parts'
import { exampleFrom, previewOutput, reviewDraft } from '../app/dev/designer/preview'
import { FLAT } from '../app/dev/designer/reading'
import { inputTree, madeFrom, outputTree, readsOf } from '../app/dev/designer/studio'
import { transformSupport } from '../app/dev/designer/support'

const resolve = (r: { id: string; version: number }) => DEFINITIONS.find((d) => d.id === r.id && d.version === r.version) ?? null
const NESTED = { nested: true, resolve }
const FLAT_RESOLVING = { nested: false, resolve }
const example = PINS.find((p) => p.key === 'applicant')!.example!
const field = (name: string): Piece => ({ kind: 'field', name, trim: false })
const nested = (...path: string[]): Piece => ({ kind: 'nested', path, trim: false })
const DRAFT: DraftProperty[] = [
  { name: 'firstName', piece: field('firstName') },
  { name: 'lastName', piece: field('lastName') },
  { name: 'contact', piece: { kind: 'construct', presence: { when: 'present', source: ['contact'] }, properties: [{ name: 'email', piece: nested('contact', 'email') }] } },
  { name: 'home', piece: { kind: 'copy', from: ['home'] } },
]
const review = (draft: DraftProperty[], feature = orbitTransformV3) => reviewDraft(fromDraft(draft), APPLICANT, APPLICANT, 'Applicant · v1', transformSupport(APPLICANT, APPLICANT, feature, resolve))
const flatten = <T extends { path: readonly string[]; children: readonly T[] }>(nodes: readonly T[]): T[] => nodes.flatMap((n) => [n, ...flatten(n.children)])

describe('The input tree', () => {
  it('shows every local object and reference, exact versions, types and the domain’s availability', () => {
    const rows = flatten(inputTree(APPLICANT, NESTED)).map((n) => [n.path.join(' › '), n.type, n.definition ? `${n.definition.id}@${n.definition.version}` : '', n.optional, n.absence, n.readable])
    expect(rows).toEqual([
      ['firstName', 'string', '', false, '', true],
      ['lastName', 'string', '', false, '', true],
      ['contact', 'object', '', true, 'may be absent: contact is optional', false],
      ['contact › email', 'string', '', false, 'may be absent: contact is optional', true],
      ['contact › phone', 'string', '', true, 'may be absent: contact, contact › phone are optional', true],
      ['home', 'reference', 'address@1', false, '', false],
      ['home › street', 'string', '', false, '', true],
      ['home › city', 'string', '', false, '', true],
      ['home › postcode', 'string', '', true, 'may be absent: home › postcode is optional', true],
      ['preferences', 'object', '', true, 'may be absent: preferences is optional', false],
      ['preferences › newsletter', 'boolean', '', true, 'may be absent: preferences, preferences › newsletter are optional', true],
    ])
  })

  it('shows what a flat Transform version can’t read, never hiding it', () => {
    const readable = flatten(inputTree(APPLICANT, FLAT_RESOLVING)).filter((n) => n.type !== 'object' && n.type !== 'reference').map((n) => [n.path.join(' › '), n.readable])
    expect(readable.filter(([, r]) => r).map(([p]) => p)).toEqual(['firstName', 'lastName'])
    expect(readable).toHaveLength(8)
  })

  it('says when a reference can’t be found here', () => {
    expect(inputTree(APPLICANT, FLAT).find((n) => n.name === 'home')).toMatchObject({ unresolved: true, children: [] })
  })
})

describe('The output tree', () => {
  it('shows every supported operation with its status: values, building, copying and leaving out', () => {
    const rows = flatten(outputTree(APPLICANT, DRAFT, review(DRAFT), resolve)).map((n) => [n.path.join(' › '), n.status, n.how.kind === 'none' ? '' : n.how.words])
    expect(rows).toEqual([
      ['firstName', 'mapped', 'firstName'],
      ['lastName', 'mapped', 'lastName'],
      ['contact', 'mapped', 'Built when contact is present'],
      ['contact › email', 'mapped', 'contact › email'],
      ['contact › phone', 'left_out', ''],
      ['home', 'mapped', 'Copied whole from home'],
      ['preferences', 'left_out', ''],
    ])
  })

  it('tells unfinished work from errors, each exactly where it is', () => {
    const unfinished = DRAFT.map((p) => (p.name === 'contact' ? { ...p, piece: { kind: 'construct', presence: { when: 'present', source: ['contact'] }, properties: [] } as Piece } : p))
    const tree = flatten(outputTree(APPLICANT, unfinished, review(unfinished), resolve))
    expect(tree.find((n) => n.name === 'contact')!.status).toBe('incomplete')
    expect(tree.find((n) => n.path.join() === 'contact,email')!.status).toBe('not_mapped')
    const wrong = DRAFT.map((p) => (p.name === 'contact' ? { ...p, piece: { kind: 'construct', presence: { when: 'always' }, properties: [{ name: 'email', piece: nested('contact', 'email') }] } as Piece } : p))
    const bad = flatten(outputTree(APPLICANT, wrong, review(wrong), resolve)).find((n) => n.path.join() === 'contact,email')!
    expect([bad.status, bad.problem]).toEqual(['problem', 'contact may be missing, but this property is required.'])
    const unchosen = DRAFT.map((p) => (p.name === 'home' ? { ...p, piece: { kind: 'copy', from: null } as Piece } : p))
    expect(outputTree(APPLICANT, unchosen, review(unchosen), resolve).find((n) => n.name === 'home')).toMatchObject({ status: 'problem', how: { kind: 'copy', words: 'Copied whole… (what to copy isn’t chosen yet)' } })
  })

  it('says what a Transform version can’t make, whatever was mapped to it', () => {
    expect(outputTree(APPLICANT, DRAFT, review(DRAFT, orbitTransformV2), resolve).filter((n) => n.status === 'unsupported').map((n) => n.name)).toEqual(['contact', 'home', 'preferences'])
  })

  it('knows what each source reads, to point it out in the input', () => {
    expect(fromDraft(DRAFT).map((p) => readsOf(p.source))).toEqual([[['firstName']], [['lastName']], [['contact'], ['contact', 'email']], [['home']]])
  })
})

describe('The preview is the Transform’s own evaluation, and isn’t execution', () => {
  it('makes exactly what a run makes', () => {
    const properties = fromDraft(DRAFT)
    const preview = previewOutput(properties, APPLICANT, APPLICANT, exampleFrom(JSON.stringify(example), APPLICANT, resolve), NESTED)
    const mapping: Mapping = { id: 'm', version: 1, workspaceId: WORKSPACE, from: refOf(APPLICANT), to: refOf(APPLICANT), properties }
    const ran = invoke({ definitions: DEFINITIONS, records: [{ id: 'r', workspaceId: WORKSPACE, definition: refOf(APPLICANT), data: example }], mappings: [mapping] },
      { workspaceId: WORKSPACE, feature: orbitTransformV3, input: { record: 'r' }, mapping: { id: 'm', version: 1 } })
    expect(madeFrom(properties, preview)).toEqual(ran.output!.data)
    expect(preview.fits).toEqual({ issues: [] })
  })

  it('leaves out what the example doesn’t have, as a run does', () => {
    const bare = { ...example } as Record<string, unknown>
    delete bare.contact
    const preview = previewOutput(fromDraft(DRAFT), APPLICANT, APPLICANT, exampleFrom(JSON.stringify(bare), APPLICANT, resolve), NESTED)
    expect(madeFrom(fromDraft(DRAFT), preview)).not.toHaveProperty('contact')
  })
})
