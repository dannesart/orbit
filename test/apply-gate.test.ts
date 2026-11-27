// Phase 4.5A, part E: the Designer's top-level completeness is the domain's rule, not its own, and
// Apply also asks the step's Transform version, as the boundary does before running, whether it
// would accept the complete draft.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { defineVersion } from '../shared/features/definitions'
import { orbitTransformV1, orbitTransformV2, orbitTransformV3 } from '../shared/features/features'
import type { MappingProperty } from '../shared/features/mappings'
import { A1, APPLICANT, B1, DEFINITIONS, WORKSPACE } from '../app/dev/features/experiment'
import { completeness, reviewDraft } from '../app/dev/designer/preview'
import { boundaryProblems, transformSupport } from '../app/dev/designer/support'

const resolve = (r: { id: string; version: number }) => DEFINITIONS.find((d) => d.id === r.id && d.version === r.version) ?? null
const prop = (name: string) => ({ kind: 'property', name }) as const
const NICKNAMED = defineVersion({ id: 'nicknamed', version: 1, name: 'Nicknamed', workspaceId: WORKSPACE, fields: [{ name: 'nickname', type: 'string', optional: true }] })
const NICK = defineVersion({ id: 'nick', version: 1, name: 'Nick', workspaceId: WORKSPACE, fields: [{ name: 'nick', type: 'string', optional: true }] })

describe('Top-level completeness comes from the domain’s whole-Mapping check', () => {
  it('finds what’s missing, of the wrong type, unknown, unnamed or repeated, at the top only', () => {
    const properties: MappingProperty[] = [
      { name: 'firstName', source: prop('firstName') },
      { name: 'firstName', source: prop('lastName') },
      { name: 'age', source: prop('firstName') },
      { name: '', source: prop('firstName') },
    ]
    expect(completeness(properties, A1, A1, resolve).map((i) => [i.problem, i.at.output])).toEqual([
      ['duplicate_name', ['firstName']],
      ['unknown_output_property', ['age']],
      ['empty_name', ['']],
      ['missing_output_property', ['lastName']],
    ])
  })

  it('reads the same in the review, whichever Transform version reads the sources', () => {
    const properties: MappingProperty[] = [{ name: 'fullName', source: { kind: 'literal', value: 3 } }, { name: 'extra', source: prop('firstName') }]
    for (const feature of [orbitTransformV2, orbitTransformV3]) {
      const review = reviewDraft(properties, A1, B1, 'Definition B · v1', transformSupport(A1, B1, feature, resolve))
      expect(review.problems).toEqual([
        'fullName: Definition B · v1 needs text here, but this makes a number.',
        'extra: Definition B · v1 has no field “extra”.',
      ])
    }
    expect(reviewDraft([], A1, B1).missing).toEqual(['fullName'])
  })

  it('never counts a property inside a built object as the output’s own', () => {
    const properties: MappingProperty[] = [{ name: 'home', source: { kind: 'construct', presence: { when: 'always' }, properties: [] } }]
    expect(completeness(properties, APPLICANT, APPLICANT, resolve).map((i) => i.at.output)).toEqual([['firstName'], ['lastName']])
  })
})

describe('Apply asks the step’s Transform version about the complete draft', () => {
  it('agrees with the review when the draft is sound', () => {
    const properties: MappingProperty[] = [{ name: 'fullName', source: prop('firstName') }]
    expect(boundaryProblems(orbitTransformV2, properties, A1, B1, resolve)).toEqual([])
    expect(boundaryProblems(orbitTransformV3, properties, A1, B1, resolve)).toEqual([])
  })

  it('catches what only the version knows: v1 has no behaviour for absence (now in the review too)', () => {
    const properties: MappingProperty[] = [{ name: 'nick', source: prop('nickname') }]
    // The review checks with the version's own absence rule, as the boundary does.
    expect(reviewDraft(properties, NICKNAMED, NICK, 'Nick · v1', transformSupport(NICKNAMED, NICK, orbitTransformV1)).findings.map((f) => [f.issue?.problem, f.category])).toEqual([['absence_unsupported', 'incompatible']])
    expect(reviewDraft(properties, NICKNAMED, NICK, 'Nick · v1', transformSupport(NICKNAMED, NICK, orbitTransformV2)).problems).toEqual([])
    expect(boundaryProblems(orbitTransformV1, properties, NICKNAMED, NICK)).toHaveLength(1)
    expect(boundaryProblems(orbitTransformV2, properties, NICKNAMED, NICK)).toEqual([])
  })

  it('refuses a copy for a version that has no copying, before anything runs', () => {
    const properties: MappingProperty[] = [{ name: 'fullName', source: { kind: 'copy', from: [] } }]
    expect(boundaryProblems(orbitTransformV2, properties, A1, B1, resolve).length).toBeGreaterThan(0)
  })

  it('is part of Apply’s own condition, and shown where Apply is', () => {
    const page = readFileSync(join(import.meta.dirname, '../app/dev/designer/SpatialDesigner.vue'), 'utf8')
    expect(page).toContain('if (!plan.value.changes || structure.value.length || review.value.problems.length || boundary.value.length) return')
    for (const f of ['TransformInspector.vue', 'FocusEditor.vue']) {
      expect(readFileSync(join(import.meta.dirname, `../app/dev/designer/${f}`), 'utf8')).toContain(':errors="[...structure, ...review.errors, ...(boundary ?? [])]"')
    }
  })
})
