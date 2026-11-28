// Experiment #5, the Designer as part of Orbit (/dev/designer): the floating surfaces never resize
// the canvas or zoom it.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('The floating surfaces: the canvas stays where it is', () => {
  const page = readFileSync(join(import.meta.dirname, '../app/dev/designer/SpatialDesigner.vue'), 'utf8')

  it('never refits or resizes the canvas when the inspector opens or closes', () => {
    expect(page).not.toMatch(/panelWidth/)
    // The canvas fills the page no matter what is selected or open: its container has no bindings
    // that could size or move it (only inert, while Mapping Studio is over it).
    expect(page).toMatch(/<div class="absolute inset-0" :inert="studio \|\| undefined">\s*<ClientOnly>/)
    // The inspector is an overlay; Mapping Studio is a view of its own over the page.
    expect(page).toMatch(/<aside[\s\S]*?data-floating-surface[\s\S]*?lg:absolute/)
  })

  it('only pans (never zooms) to bring a hidden step into view on wide screens', () => {
    const reveal = page.slice(page.indexOf('function reveal('), page.indexOf('watch(selectedId'))
    expect(reveal).toMatch(/if \(small\(\) \|\| !flow\.value\) return/)
    expect(reveal).toMatch(/setViewport\(\{ \.\.\.viewport, x: viewport\.x - shift \}/)
    expect(reveal).not.toMatch(/zoom|fitView/)
  })

  it('Escape steps back one surface at a time: a property in Mapping Studio, then the inspector', () => {
    const property = readFileSync(join(import.meta.dirname, '../app/dev/designer/StudioInspector.vue'), 'utf8')
    expect(property).toMatch(/@keydown\.escape\.stop="emit\('close'\)"/)
    expect(page).toMatch(/@keydown\.escape="closeInspector"/)
  })

  it('keeps the contracts (General) and how values are made (Mapping) as separate segments of Mapping Studio', () => {
    const studio = readFileSync(join(import.meta.dirname, '../app/dev/designer/MappingStudio.vue'), 'utf8')
    expect(studio).toContain("const LABELS: Record<Segment, string> = { general: 'General', mapping: 'Mapping', preview: 'Preview' }")
    const structure = readFileSync(join(import.meta.dirname, '../app/dev/designer/StructureEditor.vue'), 'utf8')
    expect(structure).toMatch(/This is a contract\./)
  })
})
