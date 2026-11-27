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

  it('keeps the contract summary, the output overview and its rows, and Apply', async () => {
    const html = await inspector()
    expect(text(html.slice(html.indexOf('data-contract-summary')))).toMatch(/^[^<]*?Definition A · v1 → makes Definition B · v1/)
    expect(html).toMatch(/<h3 id="output-heading"[^>]*>Output<\/h3>/)
    expect(html).toMatch(/data-property-row="fullName"[^>]*aria-label="fullName, text, Mapped: [^"]*\. Edit in Mapping Studio"/)
    expect(html).toMatch(/data-apply/)
  })
})

describe('Preview, readable first', () => {
  it('shows each property and its value as rows, never braces, and keeps raw JSON one named toggle away', async () => {
    const html = await inspector()
    const preview = html.slice(html.indexOf('>Preview</h3>'))
    expect(preview).toMatch(/<dl[^>]*data-preview-rows/)
    expect(preview).toMatch(/<dt[^>]*>fullName<\/dt>/)
    expect(text(preview)).toContain('Ada')
    expect(preview).not.toMatch(/data-preview-raw|>\{<|>\}</)
    expect(preview).toMatch(/<button[^>]*data-preview-json[^>]*aria-pressed="false"[^>]*aria-label="Show as JSON"[^>]*title="Show as JSON"/)
    // Still a preview: never a run's outcome or evidence.
    expect(text(preview)).toContain('Not executed')
    expect(text(preview)).not.toMatch(/Succeeded|Failed|Run \d/)
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
    // Where the input and output contracts are chosen.
    expect(general).toMatch(/data-input-definition/)
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
    return renderToString(vue.createSSRApp(FeatureVersions, { open, choices, pinned: { 'console-in': 'orbit.console@1', 'transform': 'orbit.transform@3' } }))
  }

  it('says it’s for development, and offers every version, provisional Transform v3 included', async () => {
    const html = await render(true)
    expect(text(html)).toContain('Feature versions Development only')
    expect(text(html)).toContain('nothing upgrades on its own')
    expect(html).toMatch(/<select[^>]*data-feature-version="transform"[^>]*data-transform-version/)
    expect(html).toMatch(/<option value="orbit\.transform@3"[^>]*>Orbit\.Transform v3 \(provisional\)<\/option>/)
    expect(html).toMatch(/<option value="playground\.console-that-edits@1"/)
  })

  it('shows nothing until it’s opened', async () => {
    expect(await render(false)).not.toMatch(/<select/)
  })
})
