// Experiment #9, Phase 0: the foundation composition will stand on. These test the domain's own
// guarantees (shared/features) and that the Studio and the Designer ask the domain, not themselves.
import { describe, expect, it } from 'vitest'
import { type Field, sameFields } from '../shared/features/definitions'
import { addVersion, createDefinition, draftFrom, moveField } from '../app/dev/definitions/model'
import { applyConfiguration, draftFrom as designerDraft, initialConfiguration, planApply } from '../app/dev/designer/config'

const f = (name: string, type: Field['type'] = 'string', optional = false): Field => (optional ? { name, type, optional: true } : { name, type })

describe('One comparison of Definition structures', () => {
  it('ignores order: order is presentation, never contract identity', () => {
    expect(sameFields([f('a'), f('b', 'number')], [f('b', 'number'), f('a')])).toBe(true)
  })

  it('tells apart a different name, type or requiredness', () => {
    const base = [f('a'), f('b', 'number')]
    expect(sameFields(base, [f('a'), f('c', 'number')])).toBe(false)
    expect(sameFields(base, [f('a'), f('b', 'boolean')])).toBe(false)
    expect(sameFields(base, [f('a'), f('b', 'number', true)])).toBe(false)
    expect(sameFields(base, [f('a')])).toBe(false)
  })

  it('treats "required" the same however it is written (absent, or a draft’s optional: false)', () => {
    expect(sameFields([{ name: 'a', type: 'string', optional: false } as never], [f('a')])).toBe(true)
  })

  it('compares names exactly, as validation matches them', () => {
    expect(sameFields([f('email')], [f('Email')])).toBe(false)
    expect(sameFields([f('a.b')], [f('a'), f('b')])).toBe(false)
  })

  it('never calls a list with a repeated name the same as one without', () => {
    expect(sameFields([f('a'), f('a')], [f('a'), f('b')])).toBe(false)
    expect(sameFields([f('a'), f('b')], [f('a'), f('a')])).toBe(false)
  })
})

describe('Reordering alone never makes a contract version', () => {
  it('in the Definitions Studio', () => {
    const made = createDefinition({ id: 'd', workspaceId: 'w', name: 'Contact', description: '', draft: { basedOn: null, fields: [{ key: 0, name: 'a', type: 'string', optional: false }, { key: 1, name: 'b', type: 'number', optional: true }], nextKey: 2 } })
    const reordered = moveField(draftFrom(made.versions[0]!), 1, 0)
    expect(reordered.fields.map((x) => x.name)).toEqual(['b', 'a'])
    expect(() => addVersion(made, reordered)).toThrow('This is exactly version 1')
  })

  it('in the Designer, for the Transform’s own output', () => {
    const start = initialConfiguration()
    const local = { ...designerDraft(start), use: 'local' as const, local: { name: 'Out', fields: [f('fullName'), f('note', 'string', true)] } }
    const once = applyConfiguration(start, local)
    expect(once.locals.map((d) => d.version)).toEqual([1])
    const reordered = { ...local, local: { name: 'Out', fields: [f('note', 'string', true), f('fullName')] } }
    expect(planApply(once, reordered).output.isNew).toBe(false)
    expect(applyConfiguration(once, reordered)).toBe(once)
  })
})
