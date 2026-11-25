// Experiment #9, Phase 0: the foundation composition will stand on. These test the domain's own
// guarantees (shared/features) and that the Studio and the Designer ask the domain, not themselves.
import { describe, expect, it } from 'vitest'
import { type Field, defineVersion, sameFields } from '../shared/features/definitions'
import { ORBIT_PROVIDED, addVersion, createDefinition, draftFrom, moveField } from '../app/dev/definitions/model'
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

describe('Orbit-provided versions are pinned', () => {
  // Every Orbit-provided version, exactly as published. Changing one of these is never a fix: it
  // would change what every Record, Mapping and piece of evidence naming it means. Publish a new
  // version instead, and add it here. (These tests catch an edit; they can't make a version durable.)
  const PUBLISHED = [
    { id: 'orbit.contact-name', version: 1, name: 'Contact name', workspaceId: null, fields: [f('name')] },
    { id: 'orbit.postal-address', version: 1, name: 'Postal address', workspaceId: null, fields: [f('street'), f('postcode'), f('city')] },
  ] as const

  it('still say exactly what they said when published', () => {
    for (const p of PUBLISHED) {
      const now = ORBIT_PROVIDED.find((d) => d.id === p.id && d.version === p.version)
      expect(now, `${p.id}@${p.version} must stay resolvable`).toBeDefined()
      expect({ id: now!.id, version: now!.version, name: now!.name, workspaceId: now!.workspaceId }).toEqual({ id: p.id, version: p.version, name: p.name, workspaceId: p.workspaceId })
      expect(sameFields(now!.fields, p.fields), `${p.id}@${p.version}’s contract changed`).toBe(true)
    }
  })

  it('are only ever added to: every published version is still there, numbered without gaps', () => {
    expect(ORBIT_PROVIDED.length).toBeGreaterThanOrEqual(PUBLISHED.length)
    for (const id of new Set(ORBIT_PROVIDED.map((d) => d.id))) {
      expect(ORBIT_PROVIDED.filter((d) => d.id === id).map((d) => d.version)).toEqual(ORBIT_PROVIDED.filter((d) => d.id === id).map((_, i) => i + 1))
    }
    expect(ORBIT_PROVIDED.every((d) => d.workspaceId === null)).toBe(true)
  })

  it('are frozen all the way down', () => {
    for (const d of ORBIT_PROVIDED) {
      expect(Object.isFrozen(d) && Object.isFrozen(d.fields) && d.fields.every(Object.isFrozen)).toBe(true)
      expect(() => { (d.fields[0] as { type: string }).type = 'number' }).toThrow(TypeError)
    }
  })
})

describe('A published version is never modified', () => {
  it('is a private, frozen copy of what it was made from', () => {
    const fields: Field[] = [f('a')]
    const v = defineVersion({ id: 'd', version: 1, name: 'D', workspaceId: 'w', fields })
    ;(fields[0] as { type: string }).type = 'number'
    expect(v.fields[0]!.type).toBe('string')
    expect(() => { (v as { name: string }).name = 'E' }).toThrow(TypeError)
  })

  it('stays the very same object when later versions are made', () => {
    const made = createDefinition({ id: 'd', workspaceId: 'w', name: 'Contact', description: '', draft: { basedOn: null, fields: [{ key: 0, name: 'a', type: 'string', optional: false }], nextKey: 1 } })
    const v1 = made.versions[0]!
    const next = addVersion(made, { ...draftFrom(v1), fields: [...draftFrom(v1).fields, { key: 1, name: 'b', type: 'number', optional: true }], nextKey: 2 })
    expect(next.versions[0]).toBe(v1)
    expect(next.versions.map((v) => v.version)).toEqual([1, 2])
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
