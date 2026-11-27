// Apply's guarantees, tested as guarantees over a corpus of drafts (corpus.ts), never by asking which
// function is called: what is applicable is exactly what the step's Transform version runs, every
// surface offers Apply exactly when Apply applies, and no entry point makes a version a run refuses.
import { describe, expect, it } from 'vitest'
import { deepFreeze, refOf } from '../shared/features/definitions'
import { invoke } from '../shared/features/features'
import type { Mapping } from '../shared/features/mappings'
import { fromDraft } from '../app/dev/designer/parts'
import { WORKSPACE } from '../app/dev/features/experiment'
import * as configModule from '../app/dev/designer/config'
import { type Configuration, allDefinitions, assessApply, canApply, findMapping } from '../app/dev/designer/config'
import { placeIn } from '../app/dev/definitions/designer'
import { applyDraft, transformView } from '../app/dev/designer/view'
import { type Case, corpus } from './corpus'
import { SURFACES, applyButtons, renderSurface } from './surfaces'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const CASES = corpus()
const step = (c: Case) => ({ feature: c.feature, workspaceId: c.workspaceId })
const recordText = (c: Case) => JSON.stringify(c.data.at(-1))
/** The boundary's verdict on what's applied, run exactly as the Designer runs it, with this data. */
function run(c: Case, config: Configuration, data: (typeof c.data)[number]) {
  const catalog = placeIn({ definitions: allDefinitions(config), records: [], mappings: config.mappings }, c.workspaceId)
  return invoke(catalog, { workspaceId: c.workspaceId, feature: c.feature, input: { definition: refOf(findMapping(config, config.mapping)!.from), data }, mapping: config.mapping }).evidence.outcome
}

describe('Applicable is exactly what the step’s Transform version runs', () => {
  it('covers every state, so the guarantees below are about something', () => {
    const states = new Set(CASES.map((c) => assessApply(c.config, c.draft, step(c)).state))
    expect([...states].sort()).toEqual(['applicable', 'incompatible', 'incomplete', 'invalid', 'unchanged', 'unresolved'])
    expect(CASES.filter((c) => canApply(assessApply(c.config, c.draft, step(c)))).length).toBeGreaterThan(20)
  })

  it('whatever Apply applies, the run accepts and succeeds with, for every valid input (absent optional values too)', () => {
    const failures: string[] = []
    for (const c of CASES) {
      const next = applyDraft(c.config, c.draft, step(c))
      if (!next) continue
      for (const data of c.data) {
        const outcome = run(c, next.config, data)
        if (outcome.kind !== 'succeeded') failures.push(`${c.name} with ${JSON.stringify(data)}: ${JSON.stringify(outcome)}`)
      }
    }
    expect(failures).toEqual([])
  })

  it('whatever Apply refuses changes nothing: the very configuration, every version as it was', () => {
    for (const c of CASES) {
      const result = configModule.applyConfiguration(c.config, c.draft, step(c))
      if (result.applied) continue
      expect(result.config, c.name).toBe(c.config)
      expect(applyDraft(c.config, c.draft, step(c)), c.name).toBeNull()
    }
  })

  it('a preview is a transformation only for what the run accepts, and its fit is the run’s outcome', () => {
    const failures: string[] = []
    for (const c of CASES) {
      const view = transformView(c.config, c.draft, step(c), recordText(c))
      // A new output of the Transform's own isn't a version yet, so only Apply can run it (above).
      if (view.output.kind !== 'transformation' || view.target.isNew) continue
      // The draft forced through as a hand-made Mapping, applicable or not: the preview must agree with the run.
      const forced = deepFreeze<Mapping>({ id: 'forced', version: 1, workspaceId: WORKSPACE, from: refOf(view.input), to: refOf(view.target.definition), properties: fromDraft(c.draft.properties) })
      const config: Configuration = { ...c.config, mappings: [...c.config.mappings, forced], mapping: { id: 'forced', version: 1 } }
      const outcome = run(c, config, c.data.at(-1)!)
      const fits = view.output.fits!.issues.length === 0
      if (outcome.kind === 'not_attempted' || (outcome.kind === 'succeeded') !== fits) failures.push(`${c.name}: preview ${fits ? 'fits' : 'doesn’t fit'}, run ${JSON.stringify(outcome)}`)
    }
    expect(failures).toEqual([])
  })
})

describe('Every Apply entry point agrees with the operation', () => {
  // Each kind of state once per version and output kind keeps rendering affordable while covering every state.
  const sample = (() => {
    const seen = new Set<string>()
    return CASES.filter((c) => {
      const key = `${assessApply(c.config, c.draft, step(c)).state} ${c.feature.version} ${c.draft.use}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  })()

  it('the inspector, the focused editor and Mapping Studio render Apply enabled exactly when Apply applies', async () => {
    expect(new Set(sample.map((c) => assessApply(c.config, c.draft, step(c)).state)).size).toBe(6)
    for (const c of sample) {
      const applies = applyDraft(c.config, c.draft, step(c)) !== null
      for (const surface of SURFACES) {
        const buttons = applyButtons(await renderSurface(surface, c.config, c.draft, step(c), recordText(c)))
        expect(buttons.length, `${surface}: ${c.name}`).toBeGreaterThan(0)
        expect(buttons, `${surface}: ${c.name}`).toEqual(buttons.map(() => applies))
      }
    }
  })

  it('makes versions only through applyConfiguration: nothing else that makes them is exported', () => {
    expect(Object.keys(configModule).filter((k) => /commit|make|define|revise/i.test(k))).toEqual([])
  })

  it('wires every surface’s Apply to the one operation (the page, which can’t be rendered here)', () => {
    const page = readFileSync(join(import.meta.dirname, '../app/dev/designer/SpatialDesigner.vue'), 'utf8')
    expect(page.match(/@apply="[^"]*"/g)).toEqual(['@apply="apply"', '@apply="apply"', '@apply="apply"'])
    expect(page).toMatch(/function apply\(\) \{\s+const next = applyDraft\(config\.value, draft\.value, step\.value\)/)
    expect(page).not.toMatch(/applyConfiguration\(|commit\(|defineVersion\(|reviseMapping\(/)
  })
})
