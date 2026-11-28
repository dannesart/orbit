// Phase 4.5A: Mapping Studio, the view. Going there and back changes nothing; Preview names the
// draft, the applied Mapping and what ran apart; Apply and Cancel are the Designer's own.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { refOf } from '../shared/features/definitions'
import { orbitTransformV2 } from '../shared/features/features'
import { A1, WORKSPACE } from '../app/dev/features/experiment'
import type { Piece } from '../app/dev/designer/parts'
import { draftFrom, initialConfiguration, planApply } from '../app/dev/designer/config'
import { appliedPreview } from '../app/dev/designer/view'
import { applyFor } from './apply'

const field = (name: string): Piece => ({ kind: 'field', name, trim: false })
const read = (p: string) => readFileSync(join(import.meta.dirname, '..', p), 'utf8')

describe('Preview names what it shows', () => {
  it('shows the applied Mapping from what’s applied, and runs from their evidence, each named apart', () => {
    const page = read('app/dev/designer/SpatialDesigner.vue')
    // The page's applied preview is view.ts's: the applied Mapping, never the draft.
    expect(page).toContain('const applied = computed<AppliedPreview>(() => appliedPreview(config.value, step.value, recordText.value, currentRecord.value.name))')
    const config = initialConfiguration()
    const shown = appliedPreview(config, { feature: orbitTransformV2, workspaceId: WORKSPACE }, JSON.stringify({ firstName: 'Ada', lastName: 'Lovelace' }))
    expect([shown.version, shown.properties]).toEqual([config.mapping.version, config.mappings[0]!.properties])
    const preview = read('app/dev/designer/StudioPreview.vue')
    expect(preview).toContain('This draft, previewed with the example. Nothing has run.')
    expect(preview).toContain('what runs use now, previewed with the same example. Nothing has run.')
    expect(preview).toContain('What actually ran: evidence, with the exact versions each run used.')
    expect(preview).toContain('<RunHistory')
    expect(preview).toContain('<summary class="cursor-pointer">JSON</summary>')
    // Nothing in the Studio invokes a Feature.
    for (const f of ['MappingStudio.vue', 'StudioPreview.vue', 'studio.ts']) expect(read(`app/dev/designer/${f}`)).not.toMatch(/\binvoke\(|runFlow/)
  })
})

describe('Going to Mapping Studio and back', () => {
  const page = read('app/dev/designer/SpatialDesigner.vue')
  it('is a place in the address on the same page, so nothing on the canvas is torn down', () => {
    expect(page).toContain("const studio = computed(() => route.query.studio === 'mapping')")
    expect(page).toContain("router.push({ query: { ...route.query, studio: 'mapping' } })")
    expect(page).toContain('<div class="absolute inset-0" :inert="studio || undefined">')
    expect(page).toContain('<div v-if="studio" class="fixed inset-0 z-40 overflow-y-auto bg-slate-50" data-studio-view>')
  })

  it('is opened on purpose from the Transform’s inspector, and opens on Mapping unless asked for a place', () => {
    expect(read('app/dev/designer/TransformInspector.vue')).toContain('data-edit-mapping')
    expect(read('app/dev/designer/MappingStudio.vue')).toContain("const segment = ref<Segment>(props.start?.segment ?? 'mapping')")
  })

  it('applies nothing by going or coming back; Cancel discards on purpose, asking first when that loses work', () => {
    const open = page.slice(page.indexOf('function openStudio('), page.indexOf('function cancelStudio()'))
    expect(open).not.toMatch(/apply|setDraft|config\.value =/)
    expect(page).toContain('losing: draftLoses(draft.value, to, config.value.mappings), act: () => { setDraft(to, false); closeStudio() },')
    expect(page).toContain('@cancel="cancelStudio"')
    // Cancel is always there; Apply only for a changed, compatible draft.
    const bar = read('app/dev/designer/StudioStatusBar.vue')
    expect(bar).toMatch(/<button type="button"[^>]*data-cancel @click="emit\('cancel'\)">Cancel<\/button>/)
    expect(bar).toContain(':disabled="!applicable" data-apply')
  })

  it('applies only what Apply allows everywhere: the same apply, the same checks', () => {
    expect(page).toContain('@apply="apply"')
    expect(read('app/dev/designer/MappingStudio.vue')).toContain('studioStatus(props.assessment)')
  })

  it('makes no version for a presentation-only change, such as the order of properties', () => {
    const start = initialConfiguration()
    const draft = { ...draftFrom(start), use: 'catalogue' as const, catalogue: refOf(A1), properties: [{ name: 'firstName', piece: field('firstName') }, { name: 'lastName', piece: field('lastName') }] }
    const applied = applyFor(start, draft)
    expect(planApply(applied, draft, WORKSPACE).changes).toBe(false)
    expect(planApply(applied, { ...draft, properties: [...draft.properties].reverse() }, WORKSPACE).changes).toBe(false)
    expect(planApply(applied, { ...draft, properties: [draft.properties[0]!, { name: 'lastName', piece: field('firstName') }] }, WORKSPACE).changes).toBe(true)
    expect(applyFor(applied, { ...draft, properties: [...draft.properties].reverse() })).toBe(applied)
  })
})
