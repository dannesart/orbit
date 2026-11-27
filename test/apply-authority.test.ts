// Foundation integrity, Part B: Apply is authoritative. One structured assessment decides whether a
// draft may be applied; every Apply surface shows it (canApply), and the Apply operation enforces it
// itself, so calling it directly can't make a Mapping version from an invalid, incompatible or
// incomplete draft. A refusal leaves the applied configuration and every version exactly as they were.
import { describe, expect, it, vi } from 'vitest'
import { defineVersion, refOf } from '../shared/features/definitions'
import { type MappingFeature, orbitTransformV1, orbitTransformV2, orbitTransformV3 } from '../shared/features/features'
import { APPLICANT, WORKSPACE } from '../app/dev/features/experiment'
import { type Configuration, type Offered, type TransformDraft, applyConfiguration, assessApply, draftFrom, initialConfiguration } from '../app/dev/designer/config'
import { draftAfterApply } from '../app/dev/designer/session'
import { applyDraft } from '../app/dev/designer/view'
import type { Piece } from '../app/dev/designer/parts'
import { studioStatus } from '../app/dev/designer/studio'
import { stepOf } from './apply'
import { SURFACES, applyButtons, renderSurface } from './surfaces'

// These render real components many times over: under a full, parallel run that can take longer than the 5 s default.
vi.setConfig({ testTimeout: 60_000 })

const field = (name: string): Piece => ({ kind: 'field', name, trim: false })
const NICKNAMED = defineVersion({ id: 'nicknamed', version: 1, name: 'Nicknamed', workspaceId: WORKSPACE, fields: [{ name: 'firstName', type: 'string' }, { name: 'nickname', type: 'string', optional: true }] })
const NICK = defineVersion({ id: 'nick', version: 1, name: 'Nick', workspaceId: WORKSPACE, fields: [{ name: 'nick', type: 'string', optional: true }] })
const offered: Offered[] = [NICKNAMED, NICK].map((definition) => ({ definition, name: definition.name, source: 'workspace' }))
const start = initialConfiguration(offered)
const base = draftFrom(start)

/** Drafts of every kind, and the state the assessment must give each under a version. */
const CASES: { name: string; draft: TransformDraft; feature: MappingFeature; state: string }[] = [
  { name: 'unchanged', draft: base, feature: orbitTransformV2, state: 'unchanged' },
  { name: 'changed and sound', draft: { ...base, properties: [{ name: 'fullName', piece: field('lastName') }] }, feature: orbitTransformV2, state: 'applicable' },
  { name: 'incomplete', draft: { ...base, properties: [] }, feature: orbitTransformV2, state: 'incomplete' },
  { name: 'reads a field the input lacks', draft: { ...base, properties: [{ name: 'fullName', piece: field('middleName') }] }, feature: orbitTransformV2, state: 'invalid' },
  { name: 'a value with no place', draft: { ...base, properties: [...base.properties, { name: 'nickname', piece: field('firstName') }] }, feature: orbitTransformV2, state: 'invalid' },
  { name: 'an own output that isn’t a Definition yet', draft: { ...base, use: 'local', local: { name: '', fields: [] }, properties: [] }, feature: orbitTransformV2, state: 'invalid' },
  { name: 'contracts the version can’t take', draft: { ...base, input: refOf(APPLICANT), properties: [{ name: 'fullName', piece: field('firstName') }] }, feature: orbitTransformV2, state: 'incompatible' },
  { name: 'an optional read v1 has no behaviour for', draft: { ...base, input: refOf(NICKNAMED), catalogue: refOf(NICK), properties: [{ name: 'nick', piece: field('nickname') }] }, feature: orbitTransformV1, state: 'incompatible' },
  { name: 'the same, for v2', draft: { ...base, input: refOf(NICKNAMED), catalogue: refOf(NICK), properties: [{ name: 'nick', piece: field('nickname') }] }, feature: orbitTransformV2, state: 'applicable' },
]
const snapshot = (c: Configuration) => JSON.stringify(c)

describe('Apply enforces its own assessment', () => {
  it.each(CASES)('$name: $state', ({ draft, feature, state }) => {
    const assessment = assessApply(start, draft, stepOf(start, feature))
    expect(assessment.state).toBe(state)
    const before = snapshot(start)
    const result = applyConfiguration(start, draft, stepOf(start, feature))
    expect(result.applied).toBe(state === 'applicable')
    if (result.applied) {
      expect(result.config.mappings.length).toBe(start.mappings.length + 1)
    } else {
      // Refused (or nothing to do): the very same configuration, every version and the history untouched.
      expect(result.config).toBe(start)
      expect(snapshot(start)).toBe(before)
    }
  })

  it('can’t be talked into it by calling it directly: there’s no way to make versions around it', async () => {
    // The only export that makes versions is applyConfiguration; what it makes them with is private.
    const config = await import('../app/dev/designer/config')
    expect(Object.keys(config)).not.toContain('commit')
    const invalid = CASES.filter((c) => c.state !== 'applicable' && c.state !== 'unchanged')
    let config2 = start
    for (const c of invalid) config2 = applyConfiguration(config2, c.draft, stepOf(config2, c.feature)).config
    expect(config2).toBe(start)
  })

  it('judges a draft by the version the step invokes now: switching to v1 makes a sound draft inapplicable', () => {
    const draft = CASES.find((c) => c.name === 'the same, for v2')!.draft
    const applied = applyConfiguration(start, draft, stepOf(start, orbitTransformV2))
    expect(applied.applied).toBe(true)
    // The same, unchanged configuration, judged for v1: incompatible, and nothing to apply anyway.
    const now = assessApply(applied.config, draft, stepOf(applied.config, orbitTransformV1))
    expect(now.state).toBe('incompatible')
    expect(applyConfiguration(applied.config, draft, stepOf(applied.config, orbitTransformV1)).config).toBe(applied.config)
  })

  it('keeps no-ops as they were: a reorder is no change, and makes no version', () => {
    const draft = { ...base, properties: [{ name: 'fullName', piece: field('lastName') }] }
    const once = applyConfiguration(start, draft, stepOf(start)).config
    const again = applyConfiguration(once, draft, stepOf(once))
    expect(again).toMatchObject({ applied: false, assessment: { state: 'unchanged' } })
    expect(again.config).toBe(once)
  })

  it('makes a version from v3 constructions only when the whole Mapping is complete at every level', () => {
    const applicant = { ...base, input: refOf(APPLICANT), catalogue: refOf(APPLICANT) }
    const unfinished: TransformDraft = { ...applicant, properties: [{ name: 'firstName', piece: field('firstName') }, { name: 'lastName', piece: field('lastName') }, { name: 'home', piece: { kind: 'construct', presence: { when: 'always' }, properties: [] } }] }
    const result = applyConfiguration(start, unfinished, stepOf(start, orbitTransformV3))
    expect(result.applied).toBe(false)
    expect(result.assessment.problems.map((p) => [p.kind, p.category, p.at?.join(' › ')])).toEqual([['not_made', 'unfinished', 'home › street'], ['not_made', 'unfinished', 'home › city']])
    const complete: TransformDraft = { ...applicant, properties: [...unfinished.properties.slice(0, 2), { name: 'home', piece: { kind: 'copy', from: ['home'] } }] }
    expect(applyConfiguration(start, complete, stepOf(start, orbitTransformV3)).applied).toBe(true)
  })
})

describe('Every Apply surface agrees with the authoritative operation', () => {
  // Rendered, not restated: each real surface, with the props the page gives it (test/surfaces.ts),
  // against what the Apply action every surface calls actually does.
  it.each(CASES)('$name', async ({ draft, feature }) => {
    const applies = applyDraft(start, draft, stepOf(start, feature)) !== null
    for (const surface of SURFACES) {
      const buttons = applyButtons(await renderSurface(surface, start, draft, stepOf(start, feature), JSON.stringify({ firstName: 'Ada', lastName: 'Lovelace' })))
      expect(buttons.length, surface).toBeGreaterThan(0)
      expect(buttons, surface).toEqual(buttons.map(() => applies))
    }
    // The Studio's word for it: Compatible exactly when Apply applies.
    expect(studioStatus(assessApply(start, draft, stepOf(start, feature))).state === 'compatible').toBe(applies)
  })

  it('every surface’s Apply action is the operation itself: applied, or nothing changes', () => {
    for (const { draft, feature } of CASES) {
      const result = applyConfiguration(start, draft, stepOf(start, feature))
      const next = applyDraft(start, draft, stepOf(start, feature))
      if (!result.applied) expect(next).toBeNull()
      else expect(next).toEqual({ config: result.config, draft: draftAfterApply(draft, start, result.config) })
    }
  })
})
