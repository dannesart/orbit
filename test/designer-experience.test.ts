// Experiment #5, the Designer as part of Orbit (/dev/designer): the floating surfaces never resize
// the canvas or zoom it.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('The floating surfaces: the canvas stays where it is', () => {
  const page = readFileSync(join(import.meta.dirname, '../app/dev/designer/SpatialDesigner.vue'), 'utf8')
  const focusEditor = readFileSync(join(import.meta.dirname, '../app/dev/designer/FocusEditor.vue'), 'utf8')

  it('never refits or resizes the canvas when the inspector or the editor opens or closes', () => {
    expect(page).not.toMatch(/panelWidth/)
    // The canvas fills the page no matter what is selected or open: its container has no bindings.
    expect(page).toMatch(/<div class="absolute inset-0">\s*<ClientOnly>/)
    // The inspector and the editor are overlays.
    expect(page).toMatch(/<aside[\s\S]*?data-floating-surface[\s\S]*?lg:absolute/)
    expect(page).toMatch(/<section[\s\S]*?data-floating-surface[\s\S]*?lg:absolute/)
  })

  it('only pans (never zooms) to bring a hidden step into view on wide screens', () => {
    const reveal = page.slice(page.indexOf('function reveal('), page.indexOf('watch(selectedId'))
    expect(reveal).toMatch(/if \(small\(\) \|\| !flow\.value\) return/)
    expect(reveal).toMatch(/setViewport\(\{ \.\.\.viewport, x: viewport\.x - shift \}/)
    expect(reveal).not.toMatch(/zoom|fitView/)
  })

  it('Escape steps back one surface at a time: editor, then inspector', () => {
    expect(focusEditor).toMatch(/@keydown\.escape\.stop="emit\('close'\)"/)
    expect(page).toMatch(/@keydown\.escape="closeInspector"/)
    expect(page).toMatch(/function closeFocus\(\)[\s\S]*?\[data-open-editor\][\s\S]*?focus\(\)/)
  })

  it('keeps Structure and Mapping as separate intentions in the editor', () => {
    expect(focusEditor).toMatch(/Mapping<span[^>]*> · how values are made/)
    expect(focusEditor).toMatch(/Structure<span[^>]*> · what it contains/)
    const structure = readFileSync(join(import.meta.dirname, '../app/dev/designer/StructureEditor.vue'), 'utf8')
    expect(structure).toMatch(/This is a contract\./)
  })
})
