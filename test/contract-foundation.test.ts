// Experiment #9, Phase 0: the foundation composition will stand on. These test the domain's own
// guarantees (shared/features) and that the Studio and the Designer ask the domain, not themselves.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { type Field, defineVersion, propertyPathWords, refOf, sameFields, validate } from '../shared/features/definitions'
import { type Expression, type Mapping, sameMappingProperties } from '../shared/features/mappings'
import { type MappingFeature, invoke, mappingCompatibility, orbitConsole, orbitTransformV1, orbitTransformV2 } from '../shared/features/features'
import { mappingWork, previewOutput, previewSource, reviewDraft } from '../app/dev/designer/preview'
import { propertyRows } from '../app/dev/designer/rows'
import { A1, DEFINITIONS, INITIAL_DATA, INITIAL_MAPPING, RECORD_ID, WORKSPACE, runExperiment, shapeOf } from '../app/dev/features/experiment'
import { ORBIT_PROVIDED, addVersion, createDefinition, draftFrom, moveField } from '../app/dev/definitions/model'
import { applyConfiguration, draftFrom as designerDraft, initialConfiguration, planApply } from '../app/dev/designer/config'
import { toDraft } from '../app/dev/designer/parts'

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

describe('Mapping property order is presentation, not meaning', () => {
  const prop = (name: string): Expression => ({ kind: 'property', name })
  const text = (value: string): Expression => ({ kind: 'literal', value })
  const join = (items: Expression[], separator: string): Expression => ({ kind: 'call', fn: 'join', args: [{ kind: 'list', items }, text(separator)] })
  const full = { name: 'fullName', source: join([prop('firstName'), text(' '), prop('lastName')], '') }
  const last = { name: 'last', source: prop('lastName') }

  it('compares output properties by name, in any order', () => {
    expect(sameMappingProperties([full, last], [last, full])).toBe(true)
    expect(sameMappingProperties([full, last], [full, { ...last, source: prop('firstName') }])).toBe(false)
    expect(sameMappingProperties([full, last], [full])).toBe(false)
    expect(sameMappingProperties([full, last], [full, { ...last, name: 'surname' }])).toBe(false)
  })

  it('keeps order inside a source meaningful: arguments and list items', () => {
    const swapped = { name: 'fullName', source: join([prop('lastName'), text(' '), prop('firstName')], '') }
    expect(sameMappingProperties([full], [swapped])).toBe(false)
    const separatorFirst: Expression = { kind: 'call', fn: 'join', args: [text(''), { kind: 'list', items: [prop('firstName')] }] }
    expect(sameMappingProperties([{ name: 'x', source: join([prop('firstName')], '') }], [{ name: 'x', source: separatorFirst }])).toBe(false)
  })

  it('guesses nothing when a name repeats: only identical lists are the same', () => {
    expect(sameMappingProperties([full, full, last], [full, full, last])).toBe(true)
    expect(sameMappingProperties([full, last, full], [full, full, last])).toBe(false)
  })

  it('in the Designer: reordering the Transform’s properties makes no Mapping version', () => {
    const start = initialConfiguration()
    const draft = { ...designerDraft(start), use: 'local' as const, local: { name: 'Out', fields: [f('fullName'), f('last')] }, properties: toDraft([full, last]) }
    const once = applyConfiguration(start, draft)
    const reordered = { ...draft, properties: [...draft.properties].reverse() }
    expect(planApply(once, reordered)).toMatchObject({ mapping: { isNew: false }, changes: false })
    expect(applyConfiguration(once, reordered)).toBe(once)
    // A change inside a source still does.
    const changed = { ...draft, properties: toDraft([full, { ...last, source: prop('firstName') }]) }
    expect(planApply(once, changed).mapping).toMatchObject({ isNew: true, version: 2 })
  })
})

describe('Feature versions guarantee behaviour: Orbit.Transform v1 and v2', () => {
  const W = 'w'
  const CONTACT = defineVersion({ id: 'contact', version: 1, name: 'Contact', workspaceId: W, fields: [f('name'), f('nickname', 'string', true)] })
  const CARD = defineVersion({ id: 'card', version: 1, name: 'Card', workspaceId: W, fields: [f('title'), f('alias', 'string', true)] })
  const prop = (name: string) => ({ kind: 'property' as const, name })
  const mapping = (properties: Mapping['properties']): Mapping => ({ id: 'm', version: 1, workspaceId: W, from: refOf(CONTACT), to: refOf(CARD), properties })
  const run = (feature: MappingFeature, m: Mapping, data: Record<string, unknown>) =>
    invoke({ definitions: [CONTACT, CARD], records: [{ id: 'r', workspaceId: W, definition: refOf(CONTACT), data: data as never }], mappings: [m] }, { workspaceId: W, feature, input: { record: 'r' }, mapping: { id: 'm', version: 1 } })

  it('keeps v1’s exact identity, and gives optional-property support its own', () => {
    expect([orbitTransformV1, orbitTransformV2].map(({ id, version, contract, absence }) => ({ id, version, contract, absence }))).toEqual([
      { id: 'orbit.transform', version: 1, contract: 'mapping', absence: 'unsupported' },
      { id: 'orbit.transform', version: 2, contract: 'mapping', absence: 'omitted' },
    ])
    expect(Object.isFrozen(orbitTransformV1) && Object.isFrozen(orbitTransformV2)).toBe(true)
  })

  it('keeps v1’s original behaviour: no behaviour for absence (it throws, as published)', () => {
    const m = mapping([{ name: 'title', source: prop('name') }, { name: 'alias', source: prop('nickname') }])
    expect(orbitTransformV1.run({ name: 'Ada', nickname: 'A' }, m)).toEqual({ title: 'Ada', alias: 'A' })
    expect(() => orbitTransformV1.run({ name: 'Ada' }, m)).toThrow()
  })

  it('makes exactly what v1 makes whenever every property is present', () => {
    const catalog = { definitions: DEFINITIONS, records: [{ id: RECORD_ID, workspaceId: WORKSPACE, definition: refOf(A1), data: INITIAL_DATA }], mappings: [INITIAL_MAPPING] }
    const invocation = { workspaceId: WORKSPACE, input: { record: RECORD_ID }, mapping: { id: INITIAL_MAPPING.id, version: INITIAL_MAPPING.version } }
    const v1 = invoke(catalog, { ...invocation, feature: orbitTransformV1 })
    const v2 = invoke(catalog, { ...invocation, feature: orbitTransformV2 })
    expect(v2.output).toEqual(v1.output)
    expect({ ...v2.evidence, feature: null }).toEqual({ ...v1.evidence, feature: null })
  })

  it('refuses, before running, a Mapping v1 has no behaviour for: evidence names v1', () => {
    const result = run(orbitTransformV1, mapping([{ name: 'title', source: prop('name') }, { name: 'alias', source: prop('nickname') }]), { name: 'Ada', nickname: 'A' })
    expect(result.evidence.feature).toEqual({ id: 'orbit.transform', version: 1 })
    expect(result.evidence.outcome).toEqual({ kind: 'not_attempted', reason: 'invalid_mapping', issues: [{ problem: 'absence_unsupported', path: ['alias'], optional: ['nickname'] }] })
    expect(result.output).toBeUndefined()
  })

  it('decides compatibility from contracts alone, apart from execution: run is never called', () => {
    const m = mapping([{ name: 'title', source: prop('name') }, { name: 'alias', source: prop('nickname') }])
    let calls = 0
    const counting = (base: MappingFeature): MappingFeature => ({ ...base, run: (...args) => { calls++; return base.run(...args) } })
    expect(mappingCompatibility(counting(orbitTransformV1), m, CONTACT, CARD)).toEqual([{ problem: 'absence_unsupported', path: ['alias'], optional: ['nickname'] }])
    expect(mappingCompatibility(counting(orbitTransformV2), m, CONTACT, CARD)).toEqual([])
    // The boundary asks the same question and, refused, never executes.
    expect(run(counting(orbitTransformV1), m, { name: 'Ada', nickname: 'A' }).evidence.outcome.kind).toBe('not_attempted')
    expect(calls).toBe(0)
    // Compatible, it executes exactly once.
    expect(run(counting(orbitTransformV2), m, { name: 'Ada' }).evidence.outcome.kind).toBe('succeeded')
    expect(calls).toBe(1)
  })

  it('still runs v1 on a Definition with optional properties it doesn’t read', () => {
    const result = run(orbitTransformV1, mapping([{ name: 'title', source: prop('name') }]), { name: 'Ada' })
    expect(result.evidence.outcome).toEqual({ kind: 'succeeded' })
    expect(result.output!.data).toEqual({ title: 'Ada' })
  })

  it('runs the same Mapping with v2, leaving the absent property out: evidence names v2', () => {
    const m = mapping([{ name: 'title', source: prop('name') }, { name: 'alias', source: prop('nickname') }])
    const result = run(orbitTransformV2, m, { name: 'Ada' })
    expect(result.evidence.feature).toEqual({ id: 'orbit.transform', version: 2 })
    expect(result.evidence.outcome).toEqual({ kind: 'succeeded' })
    expect(result.output!.data).toEqual({ title: 'Ada' })
  })

  it('never relabels earlier evidence: a v1 run still names v1 after v2 runs', () => {
    const m = mapping([{ name: 'title', source: prop('name') }])
    const earlier = run(orbitTransformV1, m, { name: 'Ada' })
    run(orbitTransformV2, m, { name: 'Ada' })
    expect(earlier.evidence.feature).toEqual({ id: 'orbit.transform', version: 1 })
    expect(Object.isFrozen(earlier.evidence)).toBe(true)
  })

  it('is what the playground and the Designer run: v2, named explicitly', () => {
    const [, transform] = runExperiment({ definitions: DEFINITIONS, records: [{ id: RECORD_ID, workspaceId: WORKSPACE, definition: refOf(A1), data: INITIAL_DATA }], mappings: [INITIAL_MAPPING] }, { console: orbitConsole, mapping: { id: INITIAL_MAPPING.id, version: 1 } })
    expect(transform!.evidence.feature).toEqual({ id: 'orbit.transform', version: 2 })
    const root = join(import.meta.dirname, '..')
    for (const file of ['app/dev/features/experiment.ts', 'app/dev/designer/flow.ts']) {
      expect(readFileSync(join(root, file), 'utf8')).toMatch(/feature: orbitTransformV2\b/)
    }
  })
})

describe('The Designer previews absence by the domain’s own rules', () => {
  const W = 'w'
  const CONTACT = defineVersion({ id: 'contact', version: 1, name: 'Contact', workspaceId: W, fields: [f('name'), f('nickname', 'string', true)] })
  const CARD = defineVersion({ id: 'card', version: 1, name: 'Card', workspaceId: W, fields: [f('title'), f('alias', 'string', true), f('note', 'string', true)] })
  const prop = (name: string) => ({ kind: 'property' as const, name })
  const ada = { data: { name: 'Ada' } }

  it('shows an absent optional value as left out, instead of failing', () => {
    expect(previewSource(prop('nickname'), CONTACT, ada)).toEqual({ absent: ['nickname'] })
    expect(previewSource({ kind: 'call', fn: 'trim', args: [prop('nickname')] }, CONTACT, ada)).toEqual({ absent: ['nickname'] })
    expect(previewSource(prop('nickname'), CONTACT, { data: { name: 'Ada', nickname: '' } })).toEqual({ value: '' })
  })

  it('previews the object Transform v2 would make, absent properties left out, judged by validate', () => {
    const properties = [{ name: 'title', source: prop('name') }, { name: 'alias', source: prop('nickname') }]
    const preview = previewOutput(properties, CONTACT, CARD, ada)
    expect(preview.fits).toEqual({ issues: [] })
    const m: Mapping = { id: 'm', version: 1, workspaceId: W, from: refOf(CONTACT), to: refOf(CARD), properties }
    const ran = invoke({ definitions: [CONTACT, CARD], records: [{ id: 'r', workspaceId: W, definition: refOf(CONTACT), data: ada.data }], mappings: [m] }, { workspaceId: W, feature: orbitTransformV2, input: { record: 'r' }, mapping: { id: 'm', version: 1 } })
    expect(ran.output!.data).toEqual({ title: 'Ada' })
    expect(preview.values).toEqual([{ value: 'Ada' }, { absent: ['nickname'] }])
  })

  it('flags, as the boundary would, a required output fed by an optional input', () => {
    const review = reviewDraft([{ name: 'title', source: prop('nickname') }], CONTACT, CARD, 'Card · v1')
    expect(review.issues[0]).toEqual([{ problem: 'may_be_absent', path: ['title'], optional: ['nickname'] }])
    expect(review.fields.find((x) => x.name === 'title')!.state).toBe('problem')
  })

  it('never presents optional unmapped outputs as unfinished required work', () => {
    const review = reviewDraft([{ name: 'title', source: prop('name') }], CONTACT, CARD, 'Card · v1')
    expect(review.fields.map((x) => [x.name, x.state])).toEqual([['title', 'set'], ['alias', 'left_out'], ['note', 'left_out']])
    expect(review.missing).toEqual([])
    expect(mappingWork(review, [])).toEqual([])
    expect(propertyRows({ properties: [] } as never, reviewDraft([], CONTACT, CARD)).map((r) => r.summary)).toEqual(['Not mapped', 'Left out (optional)', 'Left out (optional)'])
    expect(mappingWork(reviewDraft([], CONTACT, CARD), [])).toEqual(['title'])
  })

  it('uses the domain’s evaluation, not its own', () => {
    const source = readFileSync(join(import.meta.dirname, '..', 'app/dev/designer/preview.ts'), 'utf8')
    expect(source).toMatch(/evaluatePresent\(source, example\.data\)/)
    expect(source).not.toMatch(/\bevaluate\(/)
  })
})

describe('Validation locates problems by structured property paths', () => {
  const D = defineVersion({ id: 'd', version: 1, name: 'D', workspaceId: 'w', fields: [f('a.b'), f('a', 'number'), f('n', 'number', true)] })

  it('keeps flat validation exactly as it was, each issue at a one-name path', () => {
    expect(validate(D, { 'a.b': 'x', a: 1 })).toEqual([])
    expect(validate(D, { a: 'x', n: null, extra: 1 })).toEqual([
      { problem: 'missing', path: ['a.b'], expected: 'string' },
      { problem: 'wrong_type', path: ['a'], expected: 'number', actual: 'string' },
      { problem: 'wrong_type', path: ['n'], expected: 'number', actual: 'null' },
      { problem: 'unexpected', path: ['extra'] },
    ])
    expect(validate(D, [1])).toEqual([{ problem: 'not_an_object', path: [], actual: 'array' }])
  })

  it('keeps a literal name containing a dot one name, never a nested location', () => {
    const [issue] = validate(D, { a: 1 })
    expect(issue!.path).toEqual(['a.b'])
    expect(issue!.path).not.toEqual(['a', 'b'])
    expect(validate(D, { a: 1, 'a.b': 'x', 'a.c': true })).toEqual([{ problem: 'unexpected', path: ['a.c'] }])
  })

  it('carries paths into evidence, never the data', () => {
    const W = 'w'
    const C = defineVersion({ id: 'c', version: 1, name: 'C', workspaceId: W, fields: [f('a.b')] })
    const result = invoke({ definitions: [C], records: [{ id: 'r', workspaceId: W, definition: refOf(C), data: { 'a.b': 42 } as never }], mappings: [] }, { workspaceId: W, feature: orbitConsole, input: { record: 'r' } })
    expect(result.evidence.outcome).toEqual({ kind: 'not_attempted', reason: 'invalid_input', issues: [{ problem: 'wrong_type', path: ['a.b'], expected: 'string', actual: 'number' }] })
    expect(JSON.stringify(result.evidence)).not.toContain('42')
  })

  it('words a path for people without ever parsing it back', () => {
    expect([propertyPathWords([]), propertyPathWords(['a.b']), propertyPathWords(['a', 'b'])]).toEqual(['the data', 'a.b', 'a › b'])
  })
})

describe('The Designer marks optional properties', () => {
  it('in the structure summary', () => {
    const card = defineVersion({ id: 'card', version: 1, name: 'Card', workspaceId: 'w', fields: [f('fullName'), f('alias', 'string', true)] })
    expect(shapeOf(card)).toBe('{ fullName: string, alias?: string }')
  })

  it('without a source arrow on rows that are left out', () => {
    const source = readFileSync(join(import.meta.dirname, '..', 'app/dev/designer/PropertyRows.vue'), 'utf8')
    expect(source).toContain(`<span v-if="r.state !== 'left_out' && r.state !== 'unsupported'" aria-hidden="true" class="text-slate-400">←</span>`)
  })
})

describe('The Designer’s Output count', () => {
  it('counts the properties that need a value, not optional ones left out', () => {
    const inspector = readFileSync(join(import.meta.dirname, '..', 'app/dev/designer/TransformInspector.vue'), 'utf8')
    expect(inspector).toMatch(/const needed = computed\(\(\) => props\.review\.fields\.filter\(\(f\) => f\.state !== 'left_out' && f\.state !== 'unsupported'\)\.length\)/)
    expect(inspector).toMatch(/\{\{ mapped \}\}\/\{\{ needed \}\}/)
  })
})
