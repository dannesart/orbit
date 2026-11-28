// The Designer with a composed output (Phase 3.1): when the Transform version runs use can't take
// a contract (local objects or other Definitions inside it), the Designer says so up front, once,
// with the boundary's own check. What it can't make isn't presented as unfinished Mapping work,
// nothing invites mapping it, Apply stays unavailable, and nothing is flattened. Flat contracts
// are reviewed exactly as before.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { type Field, defineVersion } from '../shared/features/definitions'
import { contractCompatibility, orbitTransformV1, orbitTransformV2 } from '../shared/features/features'
import { A1, B1, INITIAL_MAPPING, WORKSPACE } from '../app/dev/features/experiment'
import { mappingWork, reviewDraft as reviewWithout } from '../app/dev/designer/preview'
import { transformSupport } from '../app/dev/designer/support'
import { propertyRows } from '../app/dev/designer/rows'

const POSTAL = defineVersion({ id: 'postal', version: 1, name: 'Postal address', workspaceId: null, fields: [{ name: 'city', type: 'string' }] })
const fields: Field[] = [
  { name: 'fullName', type: 'string' },
  { name: 'contact', type: 'object', fields: [{ name: 'email', type: 'string' }] },
  { name: 'office', type: 'reference', definition: { id: 'postal', version: 1 }, optional: true },
]
const PROCESS = defineVersion({ id: 'process', version: 1, name: 'Process', workspaceId: WORKSPACE, fields }, (r) => (r.id === 'postal' && r.version === 1 ? POSTAL : null))
const fullName = INITIAL_MAPPING.properties[0]!
// As the Designer reviews: with what the Transform version runs use supports (v2 unless said).
const reviewDraft = (p: Parameters<typeof reviewWithout>[0], input: typeof A1, target: typeof A1, label?: string, feature = orbitTransformV2) => reviewWithout(p, input, target, label, transformSupport(input, target, feature))

describe('A composed output in the Designer', () => {
  it('says once, up front, that this Transform version doesn’t support it, from the boundary’s own check', () => {
    expect(contractCompatibility(orbitTransformV2, PROCESS)).toEqual([['contact'], ['office']])
    const review = reviewDraft([fullName], A1, PROCESS, 'Process · v1')
    expect(review.unsupported).toBe('Transform v2 doesn’t support objects or other Definitions inside what it makes (contact, office). It can’t be applied or run with Process · v1.')
    expect(review.problems[0]).toBe(review.unsupported)
    expect(review.errors).toContain(review.unsupported)
    expect(reviewDraft([fullName], A1, PROCESS, 'Process · v1', orbitTransformV1).unsupported).toMatch(/^Transform v1 /)
  })

  it('doesn’t present what it can’t make as unfinished Mapping work', () => {
    const review = reviewDraft([], A1, PROCESS, 'Process · v1')
    expect(review.fields.map((f) => [f.name, f.state])).toEqual([['fullName', 'not_set'], ['contact', 'unsupported'], ['office', 'unsupported']])
    expect(review.missing).toEqual(['fullName'])
    expect(review.problems.join(' ')).not.toMatch(/contact isn’t set|office isn’t set|can’t make objects yet/)
    // Nothing is offered that couldn't be completed: no "Continue to Mapping".
    expect(mappingWork(review, [])).toEqual([])
  })

  it('marks a mapped property it can’t make as unsupported, never as its source', () => {
    const review = reviewDraft([fullName, { name: 'contact', source: { kind: 'literal', value: 'x' } }], A1, PROCESS, 'Process · v1')
    const draft = { properties: [{ name: 'fullName', piece: { kind: 'field', name: 'firstName' } }, { name: 'contact', piece: { kind: 'text', value: 'x' } }] } as never
    const row = propertyRows(draft, review).find((r) => r.name === 'contact')!
    expect(row).toMatchObject({ state: 'unsupported', summary: 'Not supported by this Transform version', problem: '' })
  })

  it('leaves flat contracts reviewed exactly as before', () => {
    expect(reviewDraft(INITIAL_MAPPING.properties, A1, B1)).toMatchObject({ unsupported: null, problems: [] })
    expect(mappingWork(reviewDraft([], A1, B1), [])).toEqual(['fullName'])
  })

  it('shows the notice in the inspector and Mapping Studio, and nothing to map for such a property', () => {
    const root = join(import.meta.dirname, '..')
    const inspector = readFileSync(join(root, 'app/dev/designer/TransformInspector.vue'), 'utf8')
    const studio = readFileSync(join(root, 'app/dev/designer/MappingStudio.vue'), 'utf8')
    const property = readFileSync(join(root, 'app/dev/designer/StudioInspector.vue'), 'utf8')
    expect(inspector).toContain('<UnsupportedNotice v-if="review.unsupported"')
    expect(studio).toContain('<UnsupportedNotice v-if="review.unsupported"')
    expect(property).toMatch(/v-if="field\.state === 'unsupported'"[\s\S]*<PropertyEditor v-else/)
  })

  it('neither previews such a property as “not mapped” nor asks to fix it before applying', () => {
    const root = join(import.meta.dirname, '..')
    const rows = readFileSync(join(root, 'app/dev/designer/rows.ts'), 'utf8')
    const inspector = readFileSync(join(root, 'app/dev/designer/TransformInspector.vue'), 'utf8')
    // No example for what this version can't make: it says so instead of a value or "Not mapped".
    expect(rows).toContain("const example = hasExample && piece && f.state !== 'unsupported' ? exampleOf(")
    expect(rows).toContain("unsupported: 'Not supported by this Transform version'")
    // Unapplied changes say the version can't take the contracts, from the structured problems, never from words.
    expect(inspector).toContain("unappliedWords(studioStatus(props.assessment), props.assessment.problems.some((p) => p.kind === 'unsupported_contract'))")
    for (const f of ['SpatialDesigner.vue']) expect(readFileSync(join(root, 'app/dev/designer', f), 'utf8')).toContain(':assessment="assessment"')
  })
})
