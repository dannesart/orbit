// Experiment #5, the Designer as part of Orbit (/dev/designer): quick mappings in the inspector
// are exactly the Pieces the parts editor would make, composed values are never offered to a
// dropdown, and the floating surfaces never resize the canvas or zoom it.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { FieldType } from '../shared/features/definitions'
import { type Expression, checkMapping } from '../shared/features/mappings'
import { A1 } from '../app/dev/features/experiment'
import { type Piece, fromPiece, toPiece } from '../app/dev/designer/parts'
import { pieceOf, quickOf, startingValue } from '../app/dev/designer/quick'

const prop = (name: string): Expression => ({ kind: 'property', name })
const text = (value: string): Expression => ({ kind: 'literal', value })
const same = (a: unknown, b: unknown) => expect(JSON.stringify(a)).toBe(JSON.stringify(b))

describe('Quick mappings: one field, or one fixed value, and nothing else', () => {
  it('reads simple values, and gives back exactly the same Piece and tree', () => {
    const simple: [Expression, ReturnType<typeof quickOf>][] = [
      [prop('firstName'), { kind: 'field', name: 'firstName' }],
      [text('AL'), { kind: 'fixed', value: 'AL' }],
      [text(''), { kind: 'fixed', value: '' }],
      [{ kind: 'literal', value: 36 }, { kind: 'fixed', value: 36 }],
      [{ kind: 'literal', value: false }, { kind: 'fixed', value: false }],
    ]
    for (const [e, quick] of simple) {
      const piece = toPiece(e)
      expect(quickOf(piece)).toEqual(quick)
      const back = pieceOf(quick as Extract<typeof quick, { kind: 'field' | 'fixed' }>)
      expect(back).toEqual(piece)
      same(fromPiece(back), e)
    }
    expect(quickOf(null)).toEqual({ kind: 'none' })
  })

  it('calls everything else composed, so the inspector never offers to replace it from a dropdown', () => {
    const composed: Expression[] = [
      { kind: 'call', fn: 'trim', args: [prop('firstName')] },
      { kind: 'call', fn: 'trim', args: [text(' x ')] },
      { kind: 'call', fn: 'join', args: [{ kind: 'list', items: [prop('firstName'), text(' '), prop('lastName')] }, text('')] },
      { kind: 'call', fn: 'join', args: [{ kind: 'list', items: [] }, text('')] },
      { kind: 'call', fn: 'upper', args: [prop('firstName')] },
    ]
    for (const e of composed) expect(quickOf(toPiece(e)).kind, JSON.stringify(e)).toBe('composed')
  })

  it('starts a fixed value with the property’s own type, so nothing is ever converted', () => {
    for (const type of ['string', 'number', 'boolean'] as FieldType[]) {
      const piece: Piece = pieceOf({ kind: 'fixed', value: startingValue(type) })
      const { issues, types } = checkMapping({ properties: [{ name: 'x', source: fromPiece(piece) }] }, A1)
      expect(issues).toEqual([])
      expect(types[0]).toBe(type)
    }
  })
})

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
