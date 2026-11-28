// The simplified Designer inspector: one place to understand, one place to edit. Rendered as the
// page renders it (surfaces.ts), never read as source: its header names the exact pinned versions
// and holds three actions (Mapping Studio, the run's status, Close); nothing in it edits; Mapping
// Studio opens at the place asked for without changing the draft; and Feature versions are pinned
// only from a development-only control.
import * as vue from 'vue'
import { renderToString } from 'vue/server-renderer'
import { describe, expect, it, vi } from 'vitest'
import { orbitConsole, orbitConsoleV2, orbitTransformV2, orbitTransformV3 } from '../shared/features/features'
import { CONSOLES, INITIAL_DATA, TRANSFORMS, WORKSPACE, featureKey, featureVersionWords } from '../app/dev/features/experiment'
import { draftFrom, initialConfiguration } from '../app/dev/designer/config'
import { renderSurface } from './surfaces'

vi.setConfig({ testTimeout: 60_000 })

const config = initialConfiguration()
const draft = draftFrom(config)
const record = JSON.stringify(INITIAL_DATA, null, 2)
const v2 = { feature: orbitTransformV2, workspaceId: WORKSPACE }
const v3 = { feature: orbitTransformV3, workspaceId: WORKSPACE }
const inspector = (step = v2) => renderSurface('inspector', config, draft, step, record)
/** The inspector's header: everything before its scrolling body. */
const headerOf = (html: string) => html.slice(0, html.indexOf('overflow-y-auto'))
const text = (html: string) => html.replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

describe('The pinned Feature version, in the header', () => {
  it('says the exact Feature version beside the Mapping version, and names both exactly on hover', async () => {
    const header = headerOf(await inspector())
    expect(text(header)).toContain('Transform Feature v2 · Mapping v1')
    expect(header).toContain('title="orbit.transform@2 · Mapping v1"')
    const provisional = headerOf(await inspector(v3))
    expect(text(provisional)).toContain('Feature v3 (provisional) · Mapping v1')
    expect(provisional).toContain('title="orbit.transform@3 · Mapping v1"')
  })

  it('words every Feature version a step may pin, plainly', () => {
    expect([orbitConsole, orbitConsoleV2, orbitTransformV2, orbitTransformV3].map(featureVersionWords)).toEqual(['Feature v1', 'Feature v2', 'Feature v2', 'Feature v3 (provisional)'])
    expect(CONSOLES.filter((c) => !c.feature.id.startsWith('orbit.')).map((c) => featureVersionWords(c.feature))).toEqual(['Feature v1, misbehaving on purpose', 'Feature v1, misbehaving on purpose'])
  })
})

describe('One place to understand, one place to edit', () => {
  it('has exactly three header actions: Mapping Studio, the latest run, Close, each with a name and a tooltip', async () => {
    const header = headerOf(await inspector())
    const buttons = [...header.matchAll(/<button\b[^>]*>/g)].map((m) => m[0])
    expect(buttons).toHaveLength(3)
    expect(buttons[0]).toMatch(/data-edit-mapping/)
    expect(buttons[0]).toMatch(/aria-label="Edit in Mapping Studio"/)
    expect(buttons[0]).toMatch(/title="Edit in Mapping Studio"/)
    expect(buttons[1]).toMatch(/data-run-status[\s\S]*aria-label="Latest run: Not invoked, run 0"[\s\S]*title="Latest run: Not invoked"/)
    expect(buttons[2]).toMatch(/aria-label="Close the Transform inspector"[\s\S]*title="Close"/)
  })

  it('edits nothing itself: no version picker, no second pencil, no text button to the editor', async () => {
    for (const step of [v2, v3]) {
      const html = await inspector(step)
      expect(html).not.toMatch(/<select|<input|<textarea/)
      expect(html).not.toMatch(/data-transform-version|data-feature-version|data-open-editor/)
      expect(text(html)).not.toMatch(/Edit Mapping|Feature version|Edit output/)
      expect(html.match(/data-edit-mapping/g)).toHaveLength(1)
    }
  })

  it('keeps the contract summary and the output, and applies nothing itself', async () => {
    const html = await inspector()
    expect(text(html.slice(html.indexOf('data-contract-summary')))).toMatch(/^[^<]*?Definition A · v1 → makes Definition B · v1/)
    expect(html).toMatch(/<h3 id="output-heading"[^>]*>Output<\/h3>/)
    expect(html).toMatch(/data-property-row="fullName"[^>]*aria-label="fullName, text, Mapped: [^"]*\. Example: Ada Lovelace, not executed\. Edit in Mapping Studio"/)
    expect(html).not.toMatch(/data-apply|data-cancel|aria-label="Undo"|>Discard</)
    // Nothing unapplied: nothing said about it.
    expect(html).not.toMatch(/data-unapplied/)
  })
})

describe('The output, each property once', () => {
  it('shows each property’s example value in its own row, with how it’s made, and no separate preview', async () => {
    const html = await inspector()
    const row = html.match(/<button[^>]*data-property-row="fullName"[\s\S]*?<\/button>/)![0]
    expect(text(row)).toMatch(/fullName text Ada Lovelace .*← firstName \(trimmed\) \+ a space \+ lastName/)
    expect(row).toMatch(/data-row-example/)
    expect(html).not.toMatch(/>Preview<\/h3>|data-preview-rows/)
    expect(html.match(/data-property-row="fullName"/g)).toHaveLength(1)
    // Still a preview: never a run's outcome or evidence; raw JSON one named toggle away.
    expect(text(html)).toContain('Not executed')
    expect(html).toMatch(/<button[^>]*data-preview-json[^>]*aria-pressed="false"[^>]*aria-label="Show as JSON"[^>]*title="Show as JSON"/)
    expect(html).not.toMatch(/data-preview-raw/)
    expect(text(html.slice(html.indexOf('output-heading')))).not.toMatch(/Succeeded|Failed|Run \d/)
  })

  it('shows no example where the preview has none: nothing mapped, or no example data', async () => {
    const empty = await renderSurface('inspector', config, { ...draft, properties: [] }, v2, record)
    expect(empty).toMatch(/data-property-row="fullName"[^>]*aria-label="fullName, text, Not mapped\. Edit in Mapping Studio"/)
    expect(empty).not.toMatch(/data-row-example/)
    const broken = await renderSurface('inspector', config, draft, v2, '{ not json')
    expect(broken).not.toMatch(/data-row-example|data-preview-json/)
  })

  it('never presents an illustration as a result', async () => {
    // A field the input doesn't have: the draft is previewed as an illustration, and says so.
    const wrong = { ...draft, properties: [{ ...draft.properties[0]!, piece: { kind: 'field' as const, name: 'middleName', trim: false } }] }
    const { transformView } = await import('../app/dev/designer/view')
    expect(transformView(config, wrong, v2, record).output.kind).toBe('illustration')
    const html = await renderSurface('inspector', config, wrong, v2, record)
    expect(text(html)).toContain('An illustration, not a result.')
    expect(html).not.toMatch(/Fits |Ready to apply/)
  })
})

describe('Unapplied changes, said in the inspector', () => {
  it('says where they stand and leads to Mapping Studio, never applying there', async () => {
    const changed = { ...draft, use: 'catalogue' as const, catalogue: { id: config.output.id, version: config.output.version }, properties: [] }
    const onStudio = vi.fn()
    const html = await renderSurface('inspector', config, changed, v2, record, { onStudio })
    const foot = html.match(/<div[^>]*data-unapplied[\s\S]*?<\/div>/)?.[0] ?? ''
    expect(text(foot)).toMatch(/Unapplied changes · 1 property needs a value Review in Mapping Studio/)
    expect(foot).toMatch(/data-review-changes/)
    expect(onStudio).not.toHaveBeenCalled()
  })
})

describe('Mapping Studio opens at the place asked for, and opening changes nothing', () => {
  const studio = (start: unknown, handlers: Record<string, unknown> = {}) => renderSurface('Mapping Studio', config, draft, v2, record, { start, ...handlers })
  const selectedSegment = (html: string) => html.match(/aria-selected="true"[^>]*data-studio-segment="(\w+)"/)?.[1]

  it('at a property: Mapping, with exactly that property’s editor open', async () => {
    const html = await studio({ segment: 'mapping', property: 'fullName' })
    expect(selectedSegment(html)).toBe('mapping')
    expect(html).toMatch(/data-studio-inspector/)
    expect(html).toMatch(/<h2[^>]*data-inspector-title>fullName<\/h2>/)
  })

  it('at General, for the contracts; on Mapping with nothing open otherwise, or for a property that isn’t there', async () => {
    const general = await studio({ segment: 'general' })
    expect(selectedSegment(general)).toBe('general')
    // The input, read-only; the output chosen within what to create.
    expect(general).not.toMatch(/data-input-definition/)
    expect(general).toMatch(/data-general-input/)
    expect(general).toMatch(/id="output-definition"/)
    for (const start of [null, undefined, { segment: 'mapping', property: 'noSuchProperty' }]) {
      const html = await studio(start)
      expect(selectedSegment(html)).toBe('mapping')
      expect(html).not.toMatch(/data-studio-inspector/)
    }
  })

  it('never changes or applies the draft by opening, wherever it opens', async () => {
    for (const start of [null, { segment: 'general' }, { segment: 'mapping', property: 'fullName' }, { segment: 'preview' }]) {
      const onUpdate = vi.fn()
      const onApply = vi.fn()
      await studio(start, { 'onUpdate:draft': onUpdate, onApply })
      expect(onUpdate).not.toHaveBeenCalled()
      expect(onApply).not.toHaveBeenCalled()
    }
  })
})

describe('Feature versions: a development-only control', () => {
  const render = async (open: boolean) => {
    const { default: FeatureVersions } = await import('../app/dev/designer/FeatureVersions.vue')
    const option = (c: { feature: { id: string; version: number }; label: string }) => ({ key: featureKey(c.feature), label: c.label })
    const choices = [
      { step: 'console-in', name: 'Step 1 · Console', groups: [{ label: 'Orbit', options: CONSOLES.map(option) }] },
      { step: 'transform', name: 'Step 2 · Transform', groups: [{ label: 'Orbit', options: TRANSFORMS.map(option) }] },
    ]
    const inputs = [{ key: 'def-a@1', label: 'Definition A · v1' }, { key: 'applicant@1', label: 'Applicant · v1' }]
    return renderToString(vue.createSSRApp(FeatureVersions, { open, choices, pinned: { 'console-in': 'orbit.console@1', 'transform': 'orbit.transform@3' }, inputs, reads: 'applicant@1' }))
  }

  it('says it’s for development, and offers every version, provisional Transform v3 included', async () => {
    const html = await render(true)
    expect(text(html)).toContain('Versions and input Development only')
    expect(text(html)).toContain('nothing upgrades on its own')
    expect(html).toMatch(/<select[^>]*data-feature-version="transform"[^>]*data-transform-version/)
    expect(html).toMatch(/<option value="orbit\.transform@3"[^>]*>Orbit\.Transform v3 \(provisional\)<\/option>/)
    expect(html).toMatch(/<option value="playground\.console-that-edits@1"/)
  })

  it('shows nothing until it’s opened', async () => {
    expect(await render(false)).not.toMatch(/<select/)
  })
})

describe('General: Input → what to create → Output', () => {
  const general = (incoming: unknown, d = draft) => renderSurface('Mapping Studio', config, d, v2, record, { start: { segment: 'general' }, incoming })
  const relation = (html: string) => html.match(/data-input-relation="(\w+)"/)?.[1]
  const A = { id: config.mappings[0]!.from.id, version: config.mappings[0]!.from.version }

  it('shows the input read-only, with its properties, in that order: input, the choice, the output', async () => {
    const html = await general({ step: 'Console · Step 1', ref: A })
    const at = (marker: string) => html.indexOf(marker)
    expect(at('data-general-input')).toBeGreaterThan(-1)
    expect(at('data-general-input')).toBeLessThan(at('What do you want to create?'))
    expect(at('What do you want to create?')).toBeLessThan(at('id="output-definition"'))
    const input = html.slice(at('data-general-input'), at('data-general-output'))
    expect(input).not.toMatch(/<select|<input/)
    expect(text(input)).toMatch(/Input Definition A · v1/)
    expect(input).toMatch(/data-input-node="firstName"/)
    // The chosen output's properties right under its selector, not listed again elsewhere.
    const output = html.slice(at('data-output-existing'))
    expect(output).toMatch(/data-output-properties[\s\S]*data-input-node="fullName"/)
    expect(html.match(/data-input-node="fullName"/g)).toHaveLength(1)
  })

  it('says how the input relates to what reaches the Transform, and never reconciles them', async () => {
    expect(relation(await general({ step: 'Console · Step 1', ref: A }))).toBe('matches')
    expect(relation(await general({ step: null, ref: null }))).toBe('none')
    expect(relation(await general({ step: 'Console', ref: null }))).toBe('unknown')
    const onUpdate = vi.fn()
    const differs = await renderSurface('Mapping Studio', config, draft, v2, record, { start: { segment: 'general' }, incoming: { step: 'Console · Step 1', ref: { id: 'def-c', version: 1 } }, 'onUpdate:draft': onUpdate })
    expect(relation(differs)).toBe('differs')
    expect(text(differs)).toMatch(/Console · Step 1 hands on .*\. This Mapping reads Definition A · v1 and stays as it is\./)
    expect(onUpdate).not.toHaveBeenCalled()
  })

  it('offers the input only in the development-only control', async () => {
    const { default: FeatureVersions } = await import('../app/dev/designer/FeatureVersions.vue')
    const html = await renderToString(vue.createSSRApp(FeatureVersions, { open: true, choices: [], pinned: {}, inputs: [{ key: 'def-a@1', label: 'Definition A · v1' }, { key: 'applicant@1', label: 'Applicant · v1' }], reads: 'applicant@1' }))
    expect(html).toMatch(/<select[^>]*data-input-definition/)
    expect(text(html)).toContain('Changes the draft only.')
  })
})

describe('What reaches a step (flow.ts)', async () => {
  const { INITIAL_CONNECTIONS, incomingTo, inputRelation } = await import('../app/dev/designer/flow')
  const A = { id: config.mappings[0]!.from.id, version: config.mappings[0]!.from.version }
  const contracts = { record: A, transform: { reads: A, makes: { id: config.output.id, version: config.output.version } }, definitions: [], label: () => '', features: {} as never, featureLabel: () => '' }

  it('follows the connections: what the step connected into it hands on, or nothing', () => {
    expect(incomingTo('transform', INITIAL_CONNECTIONS, contracts)).toEqual({ from: 'console-in', ref: A })
    expect(incomingTo('transform', INITIAL_CONNECTIONS.filter((c) => c.target !== 'transform'), contracts)).toEqual({ from: null, ref: null })
    // Connected from a Console that receives nothing: connected, but nothing known reaches it.
    expect(incomingTo('transform', [{ source: 'console-out', target: 'transform' }], contracts)).toEqual({ from: 'console-out', ref: null })
  })

  it('relates it to what the Mapping reads, exactly by identity and version', () => {
    expect(inputRelation({ from: 'console-in', ref: A }, A)).toBe('matches')
    expect(inputRelation({ from: 'console-in', ref: { ...A, version: A.version + 1 } }, A)).toBe('differs')
    expect(inputRelation({ from: 'console-out', ref: null }, A)).toBe('unknown')
    expect(inputRelation({ from: null, ref: null }, A)).toBe('none')
  })
})
