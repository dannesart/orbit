// Apply's guarantees, tested as guarantees over a corpus of drafts (corpus.ts), never by asking which
// function is called: what is applicable is exactly what the step's Transform version runs, every
// surface offers Apply exactly when Apply applies, and no entry point makes a version a run refuses.
import { describe, expect, it, vi } from 'vitest'
import { deepFreeze, refOf } from '../shared/features/definitions'
import { invoke } from '../shared/features/features'
import type { Mapping } from '../shared/features/mappings'
import { fromDraft } from '../app/dev/designer/parts'
import { WORKSPACE } from '../app/dev/features/experiment'
import * as configModule from '../app/dev/designer/config'
import { type Configuration, allDefinitions, assessApply, canApply, findMapping } from '../app/dev/designer/config'
import { placeIn } from '../app/dev/definitions/designer'
import { applyDraft, transformView } from '../app/dev/designer/view'
import { studioStatus } from '../app/dev/designer/studio'
import { type Case, corpus } from './corpus'
import { APPLY_SURFACES, SURFACES, applyButtons, renderSurface, unappliedState } from './surfaces'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// These render real components many times over: under a full, parallel run that can take longer than the 5 s default.
vi.setConfig({ testTimeout: 60_000 })

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

  it('Mapping Studio renders Apply enabled exactly when Apply applies; the inspector says ready exactly then, and applies nothing', async () => {
    expect(new Set(sample.map((c) => assessApply(c.config, c.draft, step(c)).state)).size).toBe(6)
    for (const c of sample) {
      const applies = applyDraft(c.config, c.draft, step(c)) !== null
      for (const surface of APPLY_SURFACES) {
        const buttons = applyButtons(await renderSurface(surface, c.config, c.draft, step(c), recordText(c)))
        expect(buttons.length, `${surface}: ${c.name}`).toBeGreaterThan(0)
        expect(buttons, `${surface}: ${c.name}`).toEqual(buttons.map(() => applies))
      }
      const inspector = await renderSurface('inspector', c.config, c.draft, step(c), recordText(c))
      expect(applyButtons(inspector), c.name).toEqual([])
      const said = unappliedState(inspector)
      const state = assessApply(c.config, c.draft, step(c)).state
      expect(said?.state ?? 'unchanged', c.name).toBe(state)
      if (said) expect(said.ready, c.name).toBe(applies)
    }
  })

  it('makes versions only through applyConfiguration: nothing else that makes them is exported', () => {
    expect(Object.keys(configModule).filter((k) => /commit|make|define|revise/i.test(k))).toEqual([])
  })

  it('wires every surface’s Apply to the one operation (the page, which can’t be rendered here)', () => {
    const page = readFileSync(join(import.meta.dirname, '../app/dev/designer/SpatialDesigner.vue'), 'utf8')
    expect(page.match(/@apply="[^"]*"/g)).toEqual(['@apply="apply"'])
    expect(page).toMatch(/function apply\(\) \{\s+const next = applyDraft\(config\.value, draft\.value, step\.value\)/)
    expect(page).not.toMatch(/applyConfiguration\(|commit\(|defineVersion\(|reviseMapping\(/)
  })
})

describe('What Apply makes is exactly what it assessed', () => {
  it('the committed Mapping names exactly the input and output versions assessed, and a new output is exactly the one proposed', () => {
    const failures: string[] = []
    let applied = 0
    for (const c of CASES) {
      const result = configModule.applyConfiguration(c.config, c.draft, step(c))
      if (!result.applied) continue
      applied++
      const { from, target } = result.assessment
      const mapping = findMapping(result.config, result.config.mapping)!
      const facts = [
        sameRef(result.config.output, target.ref), sameRef(mapping.from, from.ref), sameRef(mapping.to, target.ref),
        // Never a stand-in: what's assessed is what the draft named.
        sameRef(from.ref, c.draft.input ?? refOf(c.input)),
        target.kind === 'existing' && c.draft.use === 'catalogue' ? sameRef(target.ref, c.draft.catalogue) : true,
        target.kind !== 'proposed' || JSON.stringify(result.config.locals.at(-1)!.fields) === JSON.stringify(configModule.findDefinition(result.config, target.ref)!.fields),
        target.kind !== 'unresolved',
      ]
      if (facts.some((f) => !f)) failures.push(`${c.name}: ${JSON.stringify(facts)}`)
    }
    expect(applied).toBeGreaterThan(40)
    expect(failures).toEqual([])
  })

  it('the Transform’s own Definition, chosen from the catalogue, is used as itself', () => {
    const c = CASES.find((x) => x.name === 'own output from the catalogue: first name (v3)')!
    const result = configModule.applyConfiguration(c.config, c.draft, step(c))
    expect(result.assessment.target.kind).toBe('existing')
    expect(result.applied).toBe(true)
    expect(result.config.output).toEqual({ id: 'transform.output', version: 1 })
    expect(findMapping(result.config, result.config.mapping)!.to).toEqual({ id: 'transform.output', version: 1 })
    expect(run(c, result.config, c.data[0]!)).toEqual({ kind: 'succeeded' })
  })

  it('resolution follows the step’s workspace: Acme’s Definition is used in Acme, and is unresolved anywhere else', () => {
    const acme = CASES.filter((x) => x.name.startsWith('Acme’s output in ') && x.name.includes(': first name'))
    expect(acme.length).toBe(6)
    for (const c of acme) expect(assessApply(c.config, c.draft, step(c)).state, c.name).toBe(c.workspaceId === 'ws-acme' ? 'applicable' : 'unresolved')
  })
})

describe('Unresolved means unresolved', () => {
  const unresolved = CASES.filter((c) => assessApply(c.config, c.draft, step(c)).state === 'unresolved')
  const FOREIGN = ['Secret Payroll', 'salary', 'Another workspace’s Definition A']

  it('covers unresolved inputs and outputs, foreign, missing and workspace-dependent', () => {
    expect(unresolved.length).toBeGreaterThan(20)
    expect(unresolved.some((c) => c.name.startsWith('a foreign input'))).toBe(true)
    expect(unresolved.some((c) => c.name.startsWith('a foreign output'))).toBe(true)
    expect(unresolved.some((c) => c.name.startsWith('Acme’s output in ws-playground'))).toBe(true)
    expect(unresolved.some((c) => c.name.startsWith('another workspace’s input'))).toBe(true)
  })

  it('is refused, and Apply changes nothing', () => {
    for (const c of unresolved) {
      const result = configModule.applyConfiguration(c.config, c.draft, step(c))
      expect([result.applied, result.config === c.config], c.name).toEqual([false, true])
    }
  })

  it('is never reviewed or previewed against anything: no stand-in, no result, no fit', () => {
    for (const c of unresolved) {
      const view = transformView(c.config, c.draft, step(c), recordText(c))
      if (view.assessment.from.kind === 'existing' && view.assessment.target.kind !== 'unresolved') continue // a dependency that doesn't resolve: reviewed, and previewed as the boundary checks it
      expect(view.review.findings, c.name).toEqual([])
      expect(view.review.fields, c.name).toEqual([])
      expect([view.output.kind, view.output.fits, view.output.unresolved], c.name).toEqual(['illustration', null, true])
      // Only the identity the draft names: no name, no properties.
      for (const contract of [view.assessment.from, view.assessment.target].filter((x) => x.kind === 'unresolved')) {
        expect([contract.definition.name, contract.definition.fields], c.name).toEqual(['', []])
        expect(contract.label, c.name).toBe(`${contract.ref.id} · v${contract.ref.version}`)
      }
    }
  })

  it('shows nothing private, anywhere: labels, reviews, previews, problems, every surface', async () => {
    for (const c of unresolved) {
      const view = transformView(c.config, c.draft, step(c), recordText(c))
      const said = JSON.stringify([view.target.label, view.review, view.output, view.example, view.assessment.problems.map((p) => [p.words, p.short]), view.boundary])
      for (const words of FOREIGN) expect(said.includes(words), `${c.name}: ${words}`).toBe(false)
      for (const surface of [...SURFACES, 'Studio preview' as const]) {
        const html = await renderSurface(surface, c.config, c.draft, step(c), recordText(c))
        for (const words of FOREIGN) expect(html.includes(words), `${surface}, ${c.name}: ${words}`).toBe(false)
      }
    }
  })

  it('is presented as unresolved: the Studio says so, counts it as something to fix, and sends you to General', async () => {
    const c = unresolved.find((x) => x.name.startsWith('a foreign output supplied directly: first name'))!
    const html = await renderSurface('Mapping Studio', c.config, c.draft, step(c), recordText(c))
    expect(html).toContain('Unresolved')
    expect(html).toMatch(/\d+ problems? to fix/)
    expect(html).not.toContain('Apply creates')
    for (const u of unresolved) {
      const assessment = assessApply(u.config, u.draft, step(u))
      const status = studioStatus(assessment)
      expect(status.state, u.name).toBe('unresolved')
      const contracts = assessment.problems.filter((p) => p.kind === 'contract')
      expect(contracts.length, u.name).toBeGreaterThan(0)
      expect(status.problems.filter((i) => i.category === 'unresolved').map((i) => i.where), u.name).toEqual(contracts.map(() => 'general'))
    }
  })
})

describe('An illustration never says it fits', () => {
  // One case per kind of preview, version and state keeps rendering affordable.
  const sample = (() => {
    const seen = new Set<string>()
    return CASES.filter((c) => {
      const view = transformView(c.config, c.draft, step(c), recordText(c))
      const key = `${view.output.kind} ${view.output.refused.length > 0} ${view.output.unresolved === true} ${view.assessment.state} ${c.feature.version}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  })()

  it('in Mapping Studio’s Preview and in the inspector’s, for every kind of preview', async () => {
    const kinds = new Set<string>()
    for (const c of sample) {
      const view = transformView(c.config, c.draft, step(c), recordText(c))
      kinds.add(`${view.output.kind}${view.output.refused.length ? ' refused' : ''}${view.output.unresolved ? ' unresolved' : ''}`)
      for (const surface of ['Studio preview', 'inspector'] as const) {
        const html = await renderSurface(surface, c.config, c.draft, step(c), recordText(c))
        if (view.output.kind === 'illustration') {
          expect(html, `${surface}: ${c.name}`).not.toMatch(/data-preview-fits|Fits /)
          if (!('problem' in view.example) || view.output.unresolved) expect(html, `${surface}: ${c.name}`).toContain('An illustration, not a result.')
        }
        // A transformation that fits says so in the Studio's Preview, so the check above is about something.
        if (surface === 'Studio preview' && view.output.kind === 'transformation' && view.output.fits!.issues.length === 0) expect(html, c.name).toContain('data-preview-fits')
      }
    }
    expect([...kinds].sort()).toEqual(['illustration', 'illustration refused', 'illustration unresolved', 'transformation'])
  })
})

const sameRef = (a: { id: string; version: number }, b: { id: string; version: number }) => a.id === b.id && a.version === b.version
