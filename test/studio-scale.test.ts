// Mapping Studio's Mapping segment and Definition Studio at scale (Related to #53), rendered as the
// page renders them, with the realistic Candidate and Employee. Overview before detail: nested
// objects and references start folded; selecting a property opens the input it reads; searching
// keeps what leads to a match; lines are calm until a property is selected (never hidden); and
// none of it is the draft: rendering, folding, selecting and searching emit no change.
import * as vue from 'vue'
import { renderToString } from 'vue/server-renderer'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { orbitTransformV2, orbitTransformV3, resolverIn } from '../shared/features/features'
import { DEFINITIONS, INITIAL_DATA, WORKSPACE } from '../app/dev/features/experiment'
import { CANDIDATE, CANDIDATE_AMARA, CANDIDATE_TOMASZ, CANDIDATE_TO_EMPLOYEE } from '../app/dev/features/realistic'
import { draftFrom, initialConfiguration } from '../app/dev/designer/config'
import { FLAT } from '../app/dev/designer/reading'
import { ancestorsOf, findInOutput, findInTree, inputTree, revealFor } from '../app/dev/designer/studio'
import { transformView } from '../app/dev/designer/view'
import { renderSurface } from './surfaces'

vi.setConfig({ testTimeout: 60_000 })

const config = initialConfiguration([], CANDIDATE_TO_EMPLOYEE)
const draft = draftFrom(config)
const v3 = { feature: orbitTransformV3, workspaceId: WORKSPACE }
const record = (data: unknown) => JSON.stringify(data, null, 2)
const resolve = resolverIn(DEFINITIONS, WORKSPACE)
const designer = (file: string) => readFileSync(join(import.meta.dirname, '../app/dev/designer', file), 'utf8')
const studio = (start: unknown, data: unknown = CANDIDATE_AMARA, handlers: Record<string, unknown> = {}) =>
  renderSurface('Mapping Studio', config, draft, v3, record(data), { start, incoming: { step: 'Console · Step 1', ref: { id: CANDIDATE.id, version: 1 } }, ...handlers })
/** Each Definition Studio row's name as shown (its word breaks and SSR markers left out). */
const rowNames = (html: string) => [...html.matchAll(/data-row-name[^>]*>([\s\S]*?)<\/span>/g)].map((m) => m[1]!.replace(/<!--[\s\S]*?-->|<[^>]+>/g, ''))
const nodesIn = (html: string, attr: string) => [...html.matchAll(new RegExp(`${attr}="([^"]+)"`, 'g'))].map((m) => m[1]!)

describe('The large Mapping, overview first', () => {
  it('starts with nested objects and references folded, in the input and the output', async () => {
    const html = await studio({ segment: 'mapping' })
    const inputs = nodesIn(html, 'data-input-node')
    const outputs = nodesIn(html, 'data-output-node')
    expect(inputs).toHaveLength(39)
    expect(inputs.every((p) => !p.includes(' › '))).toBe(true)
    expect(outputs).toHaveLength(12)
    expect(outputs.every((p) => !p.includes(' › '))).toBe(true)
    // A built object folds with its own control, apart from the row that opens the editor.
    expect(html).toMatch(/<button[^>]*aria-expanded="false"[^>]*aria-label="Show the properties built in employment"[^>]*data-output-fold/)
    expect(html).toMatch(/data-mapping-search/)
  })

  it('opens the input a selected property reads, and nothing else', async () => {
    const html = await studio({ segment: 'mapping', property: 'employment' })
    const inputs = nodesIn(html, 'data-input-node')
    // employment is built from offer's values: offer opens to show them.
    expect(inputs).toContain('offer › offeredJobTitle')
    expect(inputs.filter((p) => p.includes(' › ') && !p.startsWith('offer › '))).toEqual([])
    expect(html).toMatch(/data-input-row="offer › offeredJobTitle"[^>]*data-reads|data-reads[^>]*data-input-row="offer › offeredJobTitle"/)
  })

  it('never changes the draft by opening, selecting, folding or revealing', async () => {
    for (const start of [{ segment: 'mapping' }, { segment: 'mapping', property: 'employment' }, { segment: 'mapping', property: 'homeAddress' }]) {
      for (const data of [CANDIDATE_AMARA, CANDIDATE_TOMASZ]) {
        const onUpdate = vi.fn()
        const onApply = vi.fn()
        const html = await studio(start, data, { 'onUpdate:draft': onUpdate, onApply })
        expect(onUpdate).not.toHaveBeenCalled()
        expect(onApply).not.toHaveBeenCalled()
        expect(html).not.toContain('unapplied changes')
      }
    }
  })

  it('keeps a small Mapping as it was: everything in view, no search, nothing to fold', async () => {
    const simple = initialConfiguration()
    const html = await renderSurface('Mapping Studio', simple, draftFrom(simple), { feature: orbitTransformV2, workspaceId: WORKSPACE }, record(INITIAL_DATA), { start: { segment: 'mapping' }, incoming: { step: 'Console · Step 1', ref: null } })
    expect(nodesIn(html, 'data-input-node')).toEqual(['firstName', 'lastName'])
    expect(nodesIn(html, 'data-output-node')).toEqual(['fullName'])
    expect(html).not.toMatch(/data-mapping-search|data-output-fold|data-all-connections/)
  })

  it('keeps the presence condition’s sentence whole: it wraps, it’s never clipped', async () => {
    const html = await studio({ segment: 'mapping', property: 'employment' })
    expect(html).toMatch(/<label[^>]*class="flex w-full min-w-0 flex-wrap[^"]*"[^>]*data-presence-sentence/)
    expect(html).toMatch(/<select[^>]*class="[^"]*min-w-0 flex-1 basis-32[^"]*"[^>]*data-presence-source/)
  })
})

describe('Finding a property, with what leads to it', () => {
  const inputs = inputTree(CANDIDATE, { ...FLAT, resolve })
  const view = transformView(config, draft, v3, record(CANDIDATE_AMARA))

  it('finds by name or by path, in the input', () => {
    expect(findInTree(inputs, 'offeredJob').map((n) => [n.name, n.children.map((c) => c.name)])).toEqual([['offer', ['offeredJobTitle']]])
    expect(findInTree(inputs, 'offer › offeredJobTitle').map((n) => n.name)).toEqual(['offer'])
    expect(findInTree(inputs, 'application.screening.interview').map((n) => n.children[0]!.children.map((c) => c.name))).toEqual([['interviewScores']])
  })

  it('finds in the output too, keeping the built objects that lead to a match', async () => {
    const { outputTree } = await import('../app/dev/designer/studio')
    const outputs = outputTree(view.target.definition, draft.properties, view.review, view.reading.resolve)
    const found = findInOutput(outputs, 'currency')
    expect(found.map((n) => n.name)).toEqual(['employment'])
    expect(found[0]!.children.map((n) => n.name)).toEqual(['compensation'])
    expect(found[0]!.children[0]!.children.map((n) => n.name)).toEqual(['currencyCode'])
    expect(findInOutput(outputs, '')).toHaveLength(12)
  })

  it('reveals exactly the objects that hold a selected property’s sources, and opens what leads to a nested selection', () => {
    expect([...revealFor([{ from: ['offer', 'offeredJobTitle'], kind: 'value', to: ['employment', 'jobTitle'], key: 'k' }, { from: ['offer'], kind: 'presence', to: ['employment'], key: 'p' }])]).toEqual([JSON.stringify(['offer'])])
    expect(ancestorsOf(['employment', 'compensation', 'currencyCode'])).toEqual(['employment', 'employment › compensation'])
    expect(ancestorsOf(['employment'])).toEqual([])
  })
})

describe('Calm connections: presentation only', () => {
  const lines = designer('StudioConnections.vue')
  const page = designer('MappingStudio.vue')

  it('draws every line the draft has; with many and nothing selected, quietly; selecting lights its own and quietens the rest, never hiding one', () => {
    expect(lines).toContain('if (props.all || l.lit) return 1')
    expect(lines).toContain('if (props.selected) return 0.12')
    expect(lines).toContain('return props.connections.length > MANY ? 0.4 : 0.9')
    // An output place inside a folded built object is drawn to that object, with an open end.
    expect(lines).toMatch(/for \(; end > 0 && !to; end--\) to = output\.querySelector/)
    expect(lines).toContain(":fill=\"l.foldedTo ? 'white' : 'currentColor'\"")
    // Value, copy and presence stay distinct.
    expect(lines).toContain(":stroke-width=\"l.kind === 'copy' ? 3 : 1.5\"")
    expect(lines).toContain(":stroke-dasharray=\"l.kind === 'presence' ? '5 4' : undefined\"")
    // The lines are the draft's dependencies, whatever is folded, searched or selected.
    expect(page).toContain('const links = computed(() => connections(outputs.value, inputs.value))')
    expect(page).toMatch(/<button[\s\S]*?:aria-pressed="allLines"[\s\S]*?data-all-connections\s*@click="allLines = !allLines"/)
  })
})

describe('Definition Studio at scale', async () => {
  const { addRealisticSamples, catalogueOf, shelfOf } = await import('../app/dev/definitions/store')
  const { draftFrom: draftOfVersion, matchesQuery } = await import('../app/dev/definitions/model')
  const { BUILDER } = await import('../app/dev/definitions/builder')
  addRealisticSamples('ws-studio-scale')
  const catalogue = catalogueOf('ws-studio-scale')
  const candidate = shelfOf('ws-studio-scale').made.find((d) => d.name === 'Candidate')!.versions[0]!
  const builderHtml = async (version = candidate) => {
    const { default: ModelBuilder } = await import('../app/dev/definitions/ModelBuilder.vue')
    return renderToString(vue.createSSRApp(ModelBuilder, { draft: draftOfVersion(version), idPrefix: 't', catalogue }))
  }

  it('opens a large Definition folded, with search, and long names whole', async () => {
    const html = await builderHtml()
    expect(html).toMatch(/data-model-search/)
    // Local objects start folded: none of their rows is rendered.
    expect(html).toMatch(/<button[^>]*data-fold[^>]*aria-expanded="false"[^>]*aria-label="Show what contactDetails contains"/)
    expect(html).not.toMatch(/>mobilePhoneNumber</)
    // Names wrap, never cut short.
    expect(rowNames(html)).toContain('requiresWorkVisaSponsorshipForEmployment')
    for (const m of html.matchAll(/<span([^>]*)data-row-name/g)) expect(m[1]).not.toMatch(/\btruncate\b/)
    // A long name may wrap where its words meet, and only there (the text itself unchanged).
    expect(html).toMatch(/data-row-name[^>]*>(<!--[^>]*-->)*requires(<!--[^>]*-->)*<wbr>(<!--[^>]*-->)*Work/)
  })

  it('keeps a small Definition as it was: objects open, no search', async () => {
    const address = shelfOf('ws-studio-scale').made.find((d) => d.name === 'Emergency contact')!.versions[0]!
    const html = await builderHtml(address)
    expect(html).not.toMatch(/data-model-search/)
  })

  it('finds a property by name with the objects that lead to it, and shows only those while searching', async () => {
    const draft = draftOfVersion(candidate)
    const shown = draft.fields.filter((f) => matchesQuery(f, 'interview')).map((f) => f.name)
    expect(shown).toEqual(['application'])
    expect(draft.fields.filter((f) => matchesQuery(f, '')).length).toBe(draft.fields.length)
    // The level itself, with a search on: only matching rows, the object leading to a match opened.
    const { default: PropertyTree } = await import('../app/dev/definitions/PropertyTree.vue')
    const query = vue.ref('interview')
    const fake = {
      draft: vue.ref(draft), idPrefix: 't', catalogue: vue.ref(catalogue), open: vue.ref(null), folded: vue.ref(new Set(draft.fields.map((f) => f.key))), unfolded: vue.ref(new Set()),
      target: vue.ref(null), dragging: vue.ref(null), dropAt: vue.ref(null), query, searching: vue.computed(() => true), matches: (f: Parameters<typeof matchesQuery>[0]) => matchesQuery(f, query.value),
      update: vi.fn(), where: () => '', toggle: vi.fn(), fold: vi.fn(), unfold: vi.fn(), setTarget: vi.fn(), remove: vi.fn(), move: vi.fn(), moveInto: vi.fn(), startRow: vi.fn(), over: vi.fn(), leave: vi.fn(), drop: vi.fn(), end: vi.fn(), handleKey: vi.fn(),
    }
    const app = vue.createSSRApp(PropertyTree, { fields: draft.fields, parent: null, path: [] })
    app.provide(BUILDER, fake as never)
    const html = await renderToString(app)
    expect(rowNames(html)).toEqual(['application', 'screening', 'interviewScores', 'technicalAssessmentScore', 'communicationScore', 'culturalAlignmentScore'])
    // Moving waits while searching: handles aren't draggable, and the draft is untouched.
    expect(html).toMatch(/data-handle[^>]*draggable="false"[^>]*aria-disabled="true"|data-handle[^>]*aria-disabled="true"[^>]*draggable="false"/)
    expect(fake.update).not.toHaveBeenCalled()
  })
})
