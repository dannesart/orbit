// Phase 4.4, part A: a construction's condition names its source object on purpose, never taken
// from the contract's order; one not chosen yet is draft work the check refuses.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { type Expression, type MappingProperty, checkNestedMapping } from '../shared/features/mappings'
import { APPLICANT, DEFINITIONS, PINS } from '../app/dev/features/experiment'

const prop = (name: string): Expression => ({ kind: 'property', name })
const at = (output: string[]) => ({ output, expression: [] })

describe('A condition’s source object is chosen on purpose', () => {
  const resolve = (r: { id: string; version: number }) => DEFINITIONS.find((d) => d.id === r.id && d.version === r.version) ?? null
  it('refuses a condition with no source object chosen, as draft work', () => {
    const properties: MappingProperty[] = [
      { name: 'firstName', source: prop('firstName') }, { name: 'lastName', source: prop('lastName') },
      { name: 'home', source: { kind: 'construct', presence: { when: 'always' }, properties: [{ name: 'street', source: { kind: 'path', path: ['home', 'street'] } }, { name: 'city', source: { kind: 'path', path: ['home', 'city'] } }] } },
      { name: 'contact', source: { kind: 'construct', presence: { when: 'present', source: [] }, properties: [] } },
    ]
    expect(checkNestedMapping({ properties }, APPLICANT, APPLICANT, { resolve }).issues).toEqual([
      { problem: 'condition_not_chosen', at: { output: ['contact'], expression: ['presence'] } },
      { problem: 'missing_output_property', at: at(['contact', 'email']), name: 'email' },
    ])
    expect(PINS.length).toBeGreaterThan(0)
  })

  it('never picks one from the contract’s order in the Designer', () => {
    const editor = readFileSync(join(import.meta.dirname, '..', 'app/dev/designer/ConstructionEditor.vue'), 'utf8')
    expect(editor).toContain("if (built.value?.presence.when !== 'present') build({ when: 'present', source: [] })")
    expect(editor).toContain('<option value="" disabled>Choose a source object…</option>')
    expect(editor).not.toMatch(/sources\.value\[0\]/)
  })
})
