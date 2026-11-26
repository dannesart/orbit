// Phase 4.5B: Mapping Studio as a workspace. The trees keep their shape while a property is edited
// in a floating inspector, and the lines between them are the draft's own dependencies, nothing else.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { orbitTransformV3 } from '../shared/features/features'
import { APPLICANT, DEFINITIONS } from '../app/dev/features/experiment'
import { type DraftProperty, type Piece, fromDraft } from '../app/dev/designer/parts'
import { reviewDraft } from '../app/dev/designer/preview'
import { connections, inputTree, isWithin, outputTree } from '../app/dev/designer/studio'
import { transformSupport } from '../app/dev/designer/support'

const resolve = (r: { id: string; version: number }) => DEFINITIONS.find((d) => d.id === r.id && d.version === r.version) ?? null
const NESTED = { nested: true, resolve }
const field = (name: string): Piece => ({ kind: 'field', name, trim: false })
const nested = (...path: string[]): Piece => ({ kind: 'nested', path, trim: false })
const read = (p: string) => readFileSync(join(import.meta.dirname, '..', p), 'utf8')
const lines = (draft: DraftProperty[]) => {
  const review = reviewDraft(fromDraft(draft), APPLICANT, APPLICANT, 'Applicant · v1', transformSupport(APPLICANT, APPLICANT, orbitTransformV3, resolve))
  return connections(outputTree(APPLICANT, draft, review, resolve), inputTree(APPLICANT, NESTED)).map((c) => `${c.from.join('.') || '(input)'} ${c.kind} ${c.to.join('.')}`)
}

describe('The lines are the draft’s own dependencies', () => {
  it('draws a value read, every argument of an expression, a whole copy and a presence condition, each its own kind', () => {
    const joined: Piece = { kind: 'advanced', expression: { kind: 'call', fn: 'concat', args: [{ kind: 'list', items: [{ kind: 'property', name: 'firstName' }, { kind: 'literal', value: ' ' }, { kind: 'property', name: 'lastName' }, { kind: 'property', name: 'firstName' }] }] } }
    expect(lines([
      { name: 'firstName', piece: joined },
      { name: 'lastName', piece: field('lastName') },
      { name: 'contact', piece: { kind: 'construct', presence: { when: 'present', source: ['contact'] }, properties: [{ name: 'email', piece: nested('contact', 'email') }] } },
      { name: 'home', piece: { kind: 'copy', from: ['home'] } },
    ])).toEqual([
      // Two arguments read firstName: one line, never two.
      'firstName value firstName',
      'lastName value firstName',
      'lastName value lastName',
      'contact presence contact',
      'contact.email value contact.email',
      'home copy home',
    ])
  })

  it('draws nothing for what isn’t mapped, a value with no source, or a condition always met', () => {
    expect(lines([
      { name: 'firstName', piece: { kind: 'text', value: 'Ada', trim: false } },
      { name: 'contact', piece: { kind: 'construct', presence: { when: 'always' }, properties: [] } },
      { name: 'home', piece: { kind: 'copy', from: null } },
    ])).toEqual([])
  })

  it('never draws a line from something the input doesn’t have', () => {
    expect(lines([{ name: 'firstName', piece: field('middleName') }, { name: 'lastName', piece: field('lastName') }])).toEqual(['lastName value lastName'])
  })

  it('knows what lies within a selected property', () => {
    expect(isWithin(['contact', 'email'], ['contact'])).toBe(true)
    expect(isWithin(['contact'], ['contact', 'email'])).toBe(false)
    expect(isWithin(['contactInfo'], ['contact'])).toBe(false)
  })
})

describe('The lines are drawn where their rows are, and only there', () => {
  const lines = read('app/dev/designer/StudioConnections.vue')
  it('are one SVG measured from the rows, redrawn when the layout or the draft changes', () => {
    expect(lines).toContain('new ResizeObserver(schedule)')
    expect(lines).toContain('mutation.observe(el, { childList: true, subtree: true })')
    expect(lines).toContain('watch(() => [props.connections, props.selected], () => nextTick(schedule))')
  })
  it('are not interactive, say nothing to assistive technology, and aren’t drawn on narrow screens', () => {
    expect(lines).toMatch(/<svg[^>]*pointer-events-none[^>]*max-lg:hidden[^>]*aria-hidden="true"/)
    expect(lines).toContain('if (!left.width || !right.width || right.left - left.right < 24) return (drawn.value = [])')
  })
  it('go to the folded object that holds a source, open-ended, rather than nowhere', () => {
    expect(lines).toContain('for (; at > 0 && !from; at--)')
    expect(lines).toContain(":fill=\"l.folded ? 'white' : 'currentColor'\"")
  })
  it('come only from the draft', () => {
    expect(read('app/dev/designer/MappingStudio.vue')).toContain('const links = computed(() => connections(outputs.value, inputs.value))')
  })
})

describe('The workspace keeps its shape while a property is edited', () => {
  const studio = read('app/dev/designer/MappingStudio.vue')
  const tree = read('app/dev/designer/StudioOutputTree.vue')

  it('edits in a floating inspector, never inside the output tree', () => {
    expect(tree).not.toMatch(/<slot/)
    expect(studio).toContain('<StudioInspector')
    expect(read('app/dev/designer/StudioInspector.vue')).toContain('<PropertyEditor')
    // Children are always shown: selecting a row never adds or removes rows.
    expect(tree).toContain('<div v-if="n.children.length"')
  })

  it('returns focus to the row the inspector was opened from', () => {
    expect(studio).toMatch(/function close\(\)[\s\S]*?\[data-output-node=[\s\S]*?> button`\)\?\.focus\(\)/)
  })

  it('shows one contract at a time on narrow screens, Output first', () => {
    expect(studio).toContain("const pane = ref<Pane>('output')")
    expect(studio).toContain('data-studio-pane-switch')
  })

  it('wraps long names rather than cutting them off', () => {
    for (const f of ['StudioOutputTree.vue', 'StudioInputTree.vue']) {
      const source = read(`app/dev/designer/${f}`)
      expect(source).toContain('font-mono')
      expect(source).not.toMatch(/truncate font-mono|font-mono[^"]*truncate/)
      expect(source).toContain('[overflow-wrap:anywhere]')
    }
  })
})
