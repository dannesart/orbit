// Mapping Studio's inspector edits exactly the selected place, at any depth (Related to #53), with the
// realistic Candidate → Employee Mapping. A change of editing scope, never of meaning: a nested place
// is edited inside its top-level property's construction (scopeAt, setAt), with the presence
// guarantees of every object built around it, and moving between places changes nothing.
import * as vue from 'vue'
import { renderToString } from 'vue/server-renderer'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { orbitTransformV3, resolverIn } from '../shared/features/features'
import { DEFINITIONS, WORKSPACE } from '../app/dev/features/experiment'
import { CANDIDATE_AMARA, CANDIDATE_TO_EMPLOYEE, EMPLOYEE } from '../app/dev/features/realistic'
import { draftFrom, initialConfiguration } from '../app/dev/designer/config'
import type { Piece } from '../app/dev/designer/parts'
import { READING } from '../app/dev/designer/reading'
import { scopeAt, setAt } from '../app/dev/designer/scope'
import { findNode, outputTree } from '../app/dev/designer/studio'
import { transformView } from '../app/dev/designer/view'
import { renderSurface } from './surfaces'

vi.setConfig({ testTimeout: 60_000 })

const config = initialConfiguration([], CANDIDATE_TO_EMPLOYEE)
const draft = draftFrom(config)
const step = { feature: orbitTransformV3, workspaceId: WORKSPACE }
const recordText = JSON.stringify(CANDIDATE_AMARA, null, 2)
const resolve = resolverIn(DEFINITIONS, WORKSPACE)
const view = transformView(config, draft, step, recordText)
const outputs = outputTree(view.target.definition, draft.properties, view.review, view.reading.resolve)
const employment = draft.properties.find((p) => p.name === 'employment')!.piece
const employmentField = EMPLOYEE.fields.find((f) => f.name === 'employment')!
const homeAddress = draft.properties.find((p) => p.name === 'homeAddress')!.piece
const homeAddressField = EMPLOYEE.fields.find((f) => f.name === 'homeAddress')!
const designer = (file: string) => readFileSync(join(import.meta.dirname, '../app/dev/designer', file), 'utf8')
/** Text as shown: SSR markers and word breaks left out. */
const bare = (html: string) => html.replace(/<!--[\s\S]*?-->|<wbr>/g, '')

/** The inspector at exactly `path`, as Mapping Studio renders it, with its emits recorded. */
async function inspector(path: string[], handlers: Record<string, unknown> = {}) {
  const StudioInspector = (await import('../app/dev/designer/StudioInspector.vue')).default
  const node = findNode(outputs, path)
  if (!node) throw new Error(`no output place at ${path.join(' › ')}`)
  const field = view.review.fields.find((f) => f.name === path[0])!
  const app = vue.createSSRApp(StudioInspector, {
    node, field, draft, review: view.review, input: view.input, example: view.example, output: view.target.definition,
    label: (ref: { id: string; version: number }) => `${ref.id} · v${ref.version}`, ...handlers,
  })
  app.provide(READING, vue.ref(view.reading))
  const problems: string[] = []
  app.config.warnHandler = (message) => { problems.push(message) }
  const html = await renderToString(app)
  if (problems.length) throw new Error(problems.join(' | '))
  return html
}
const attrs = (html: string, attr: string) => [...html.matchAll(new RegExp(`${attr}="([^"]+)"`, 'g'))].map((m) => m[1]!)

describe('A nested place, inside its top-level property', () => {
  it('is found with the guarantees of every object built around it', () => {
    // employment is built when offer is present; compensation is always built inside it.
    const scope = scopeAt(employment, employmentField, ['compensation', 'currencyCode'], resolve)
    expect(scope.ok).toBe(true)
    if (!scope.ok) return
    expect(scope.field).toMatchObject({ name: 'currencyCode', type: 'string' })
    expect(scope.guaranteed).toEqual([['offer']])
    expect(scope.piece).toBeTruthy()
    // The top-level property itself: nothing around it.
    const top = scopeAt(employment, employmentField, [], resolve)
    expect(top.ok && top.guaranteed).toEqual([])
    expect(top.ok && top.piece).toBe(employment)
  })

  it('says which enclosing object stands in the way: copied whole, not built, not in the contract', () => {
    expect(scopeAt(homeAddress, homeAddressField, ['city'], resolve)).toEqual({ ok: false, at: ['homeAddress'], why: 'copied' })
    expect(scopeAt(employment, employmentField, ['compensation', 'bonusEligibility', 'isEligible'], resolve)).toEqual({ ok: false, at: ['employment', 'compensation', 'bonusEligibility'], why: 'not_built' })
    expect(scopeAt(employment, employmentField, ['nothingLikeThis'], resolve)).toEqual({ ok: false, at: ['employment'], why: 'not_in_contract' })
  })

  it('is set through the same enclosing constructions, everything else as it was', () => {
    const fixed: Piece = { kind: 'text', value: 'EUR' }
    const next = setAt(employment, ['compensation', 'currencyCode'], fixed)!
    // Only that place differs: the presence (built when offer is present) and every other property are the same objects.
    expect(next.kind).toBe('construct')
    if (next.kind !== 'construct' || employment.kind !== 'construct') return
    expect(next.presence).toBe(employment.presence)
    expect(next.properties.map((p) => p.name)).toEqual(employment.properties.map((p) => p.name))
    next.properties.forEach((p, i) => { if (p.name !== 'compensation') expect(p).toBe(employment.properties[i]) })
    expect(scopeAt(next, employmentField, ['compensation', 'currencyCode'], resolve)).toMatchObject({ ok: true, piece: fixed })
    // Back again: exactly the draft's own piece.
    const original = scopeAt(employment, employmentField, ['compensation', 'currencyCode'], resolve)
    expect(setAt(next, ['compensation', 'currencyCode'], original.ok ? original.piece : null)).toEqual(employment)
  })

  it('adds a new place last and removes one when nothing makes it, as editing the object whole does', () => {
    const built: Piece = { kind: 'construct', presence: { when: 'always' }, properties: [] }
    const added = setAt(employment, ['compensation', 'bonusEligibility'], built)!
    const comp = added.kind === 'construct' ? added.properties.find((p) => p.name === 'compensation')!.piece : null
    expect(comp?.kind === 'construct' && comp.properties.at(-1)).toEqual({ name: 'bonusEligibility', piece: built })
    const removed = setAt(added, ['compensation', 'bonusEligibility'], null)
    expect(removed).toEqual(employment)
    // Nothing inside a copied value is set on its own.
    expect(setAt(homeAddress, ['city'], { kind: 'text', value: 'x' })).toBe(homeAddress)
  })
})

describe('The inspector edits exactly the selection', () => {
  it('compensation: employment as a quiet breadcrumb, compensation the title, its properties as rows', async () => {
    const html = await inspector(['employment', 'compensation'])
    expect(attrs(html, 'data-crumb')).toEqual(['employment'])
    expect(bare(html)).toMatch(/data-inspector-title>compensation<\/h2>/)
    expect(attrs(html, 'data-construction-row')).toEqual([
      'employment › compensation › annualGrossSalaryAmount', 'employment › compensation › currencyCode',
      'employment › compensation › payFrequency', 'employment › compensation › bonusEligibility',
    ])
    // Each row says how it's made; none of their editors is open.
    expect(bare(html)).toContain('offer › offeredCurrencyCode')
    expect(attrs(html, 'data-construction')).toEqual(['employment › compensation'])
    expect(html).not.toMatch(/data-presence-source|data-main/)
  })

  it('employment: the whole object is no longer edited at once', async () => {
    const html = await inspector(['employment'])
    expect(attrs(html, 'data-crumb')).toEqual([])
    expect(attrs(html, 'data-construction')).toEqual(['employment'])
    expect(attrs(html, 'data-construction-row')).toHaveLength(10)
    // Its own presence stays here: built when offer is present.
    expect(html).toMatch(/data-presence-sentence/)
  })

  it('currencyCode: that exact value’s editor, not the object around it', async () => {
    const html = await inspector(['employment', 'compensation', 'currencyCode'])
    expect(attrs(html, 'data-crumb')).toEqual(['employment', 'employment › compensation'])
    expect(bare(html)).toMatch(/data-inspector-title>currencyCode<\/h2>/)
    expect(html).toMatch(/data-property-editor="employment › compensation › currencyCode"/)
    expect(html).not.toMatch(/data-construction[=\s>]|data-construction-row/)
  })

  it('a value inside an object built when offer is present: offer’s values are known to be there', async () => {
    // A number: its choices are listed, each with whether it may be absent here.
    const html = bare(await inspector(['employment', 'compensation', 'annualGrossSalaryAmount']))
    const option = html.match(/<option[^>]*>offer › offeredAnnualGrossSalaryAmount[^<]*<\/option>/)?.[0]
    expect(option).toBeTruthy()
    expect(option).not.toContain('may be absent')
  })

  it('bonusEligibility (optional, left out): its presence, and nothing inside it yet', async () => {
    const html = await inspector(['employment', 'compensation', 'bonusEligibility'])
    expect(html).toMatch(/data-presence-mode="out"/)
    expect(attrs(html, 'data-construction-row')).toEqual([])
  })

  it('a whole-value copy: what is copied, by its exact version, and nothing inside to edit on its own', async () => {
    const html = await inspector(['homeAddress'])
    expect(html).toMatch(/data-copy-source/)
    expect(attrs(html, 'data-construction-row')).toEqual([])
  })

  it('renders without changing anything, at any depth', async () => {
    for (const path of [['employment'], ['employment', 'compensation'], ['employment', 'compensation', 'currencyCode'], ['employment', 'reportingManager', 'workEmailAddress'], ['homeAddress']]) {
      const onUpdate = vi.fn()
      const onSelect = vi.fn()
      await inspector(path, { 'onUpdate:draft': onUpdate, onSelect })
      expect(onUpdate).not.toHaveBeenCalled()
      expect(onSelect).not.toHaveBeenCalled()
    }
  })

  it('gives a nested place the same width as a top-level one: nothing indented for the objects around it', () => {
    const construction = designer('ConstructionEditor.vue')
    expect(construction).not.toMatch(/<ConstructionEditor\b/)
    expect(construction).not.toMatch(/border-l-2 pl-4/)
    // Long choices wrap within the inspector instead of widening it.
    expect(construction).toMatch(/class="min-w-0 max-w-full flex-1 basis-40"[^>]*data-copy-source|data-copy-source[^>]*class="min-w-0 max-w-full/)
  })

  it('keeps the Simple Mapping’s top-level editing as it was', async () => {
    const simple = initialConfiguration()
    const html = bare(await renderSurface('Mapping Studio', simple, draftFrom(simple), { feature: orbitTransformV3, workspaceId: WORKSPACE }, JSON.stringify({ firstName: 'Ada', lastName: 'Lovelace' }), { start: { segment: 'mapping', property: 'fullName' } }))
    expect(html).toMatch(/data-inspector-title>fullName<\/h2>/)
    expect(html).not.toMatch(/data-inspector-breadcrumb/)
    expect(html).toContain('Advanced')
    expect(html).toContain('Combine, in order')
  })
})

describe('Mapping Studio keeps the selection, the tree and the lines together', () => {
  const studio = designer('MappingStudio.vue')
  it('looks up the selected place at any depth, and moves to another from within the inspector', () => {
    expect(studio).toMatch(/const node = computed\(\(\) => \(selected\.value \? findNode\(outputs\.value, selected\.value\) : null\)\)/)
    expect(studio).toMatch(/@select="select"/)
    // The lit lines and the tree's selected row follow the same `selected`.
    expect(studio).toMatch(/isWithin\(c\.to, selected\.value!\)/)
  })

  it('falls back to the nearest object around a place that’s no longer part of the output', () => {
    expect(studio).toMatch(/while \(up\.length && !findNode\(nodes, up\)\) up = up\.slice\(0, -1\)/)
  })

  it('sees the realistic tree as it has it: compensation inside employment, built', () => {
    expect(findNode(outputs, ['employment', 'compensation', 'currencyCode'])).toMatchObject({ status: 'mapped', type: 'string' })
    expect(findNode(outputs, ['employment', 'compensation', 'bonusEligibility'])).toMatchObject({ status: 'left_out', children: [] })
    expect(findNode(outputs, ['homeAddress', 'city'])).toBeNull()
  })
})
