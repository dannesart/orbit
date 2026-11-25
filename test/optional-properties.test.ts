// Optional properties (issues #37, #45): a property may be required (as every property was) or
// optional. Optional means it may be absent; never that it may be null, and never that something
// is invented in its place. Checked through Orbit's own validate, checkMapping and invoke.
import { describe, expect, it } from 'vitest'
import { type Data, type DefinitionVersion, defineVersion, validate } from '../shared/features/definitions'
import { type Expression, type Mapping, checkMapping, evaluatePresent } from '../shared/features/mappings'
import { type Catalog, invoke, orbitTransformV2 } from '../shared/features/features'
import { addField, addVersion, changesFrom, createDefinition, draftFrom, fieldsOf, moveField, updateField, versionLike } from '../app/dev/definitions/model'

const W = 'ws-1'
const prop = (name: string): Expression => ({ kind: 'property', name })
const lit = (value: string | number | boolean): Expression => ({ kind: 'literal', value })
const join = (items: Expression[]): Expression => ({ kind: 'call', fn: 'join', args: [{ kind: 'list', items }, lit(' ')] })

// A contact: a required name and age, an optional nickname and an optional "subscribed".
const CONTACT = defineVersion({
  id: 'contact', version: 1, name: 'Contact', workspaceId: W,
  fields: [{ name: 'name', type: 'string' }, { name: 'age', type: 'number' }, { name: 'nickname', type: 'string', optional: true }, { name: 'subscribed', type: 'boolean', optional: true }],
})
// What a Transform makes from it: a required greeting, and an optional "alias".
const CARD = defineVersion({
  id: 'card', version: 1, name: 'Card', workspaceId: W,
  fields: [{ name: 'greeting', type: 'string' }, { name: 'alias', type: 'string', optional: true }],
})

describe('Validating with optional properties', () => {
  const issues = (data: unknown) => validate(CONTACT, data).map((i) => `${i.problem}:${'field' in i ? i.field : ''}`)

  it('still refuses a missing required property', () => {
    expect(issues({ age: 36 })).toEqual(['missing:name'])
  })

  it('accepts a missing optional property, and a valid one', () => {
    expect(issues({ name: 'Ada', age: 36 })).toEqual([])
    expect(issues({ name: 'Ada', age: 36, nickname: 'Countess' })).toEqual([])
  })

  it('refuses an optional property of the wrong type', () => {
    expect(issues({ name: 'Ada', age: 36, nickname: 7 })).toEqual(['wrong_type:nickname'])
  })

  it('never takes null (or an undefined value) as absence: optional isn’t nullable', () => {
    expect(issues({ name: 'Ada', age: 36, nickname: null })).toEqual(['wrong_type:nickname'])
    expect(issues({ name: 'Ada', age: 36, nickname: undefined })).toEqual(['wrong_type:nickname'])
    expect(issues({ name: null, age: 36 })).toEqual(['wrong_type:name'])
  })

  it('keeps false and zero as values, not missing information', () => {
    expect(issues({ name: 'Ada', age: 0, subscribed: false })).toEqual([])
    expect(issues({ name: '', age: 0 })).toEqual([]) // empty text is text
  })

  it('writes “required” as nothing at all, so existing versions read exactly as before', () => {
    const plain = defineVersion({ id: 'p', version: 1, name: 'P', workspaceId: W, fields: [{ name: 'a', type: 'string' }] })
    expect(plain.fields[0]).toEqual({ name: 'a', type: 'string' })
    expect(Object.keys(plain.fields[0]!)).toEqual(['name', 'type'])
    // Anything but true is dropped, so two versions that mean the same look the same.
    const said = defineVersion({ id: 'p', version: 1, name: 'P', workspaceId: W, fields: [{ name: 'a', type: 'string', optional: false as never }] })
    expect(said.fields[0]).toEqual({ name: 'a', type: 'string' })
    expect(CONTACT.fields[2]).toEqual({ name: 'nickname', type: 'string', optional: true })
    expect(Object.isFrozen(CONTACT.fields[2])).toBe(true)
  })
})

describe('Versions when requiredness changes', () => {
  const draftOf = () => {
    let d = draftFrom(createDefinition({ id: 'x', workspaceId: W, name: 'X', description: '', draft: { basedOn: null, nextKey: 1, fields: [{ key: 0, name: 'a', type: 'string', optional: false }] } }).versions[0]!)
    d = updateField(addField(d), 1, { name: 'b' })
    return d
  }
  const v1 = createDefinition({ id: 'x', workspaceId: W, name: 'X', description: '', draft: draftOf() })

  it('makes a new version, says so, and leaves the earlier one exactly as it was', () => {
    const before = structuredClone(v1.versions[0])
    const draft = updateField(draftFrom(v1.versions[0]!), 1, { optional: true })
    expect(changesFrom(v1.versions[0]!, draft)).toEqual([{ kind: 'requirement', name: 'b', optional: true }])
    expect(versionLike(v1, fieldsOf(draft))).toBeNull()
    const v2 = addVersion(v1, draft)
    expect(v2.versions.map((v) => v.fields[1])).toEqual([{ name: 'b', type: 'string' }, { name: 'b', type: 'string', optional: true }])
    expect(v2.versions[0]).toEqual(before)
    expect(v2.versions[0]).toBe(v1.versions[0])
    // And back to required: version 3, which is exactly like version 1, so it isn't made again.
    expect(versionLike(v2, fieldsOf(updateField(draftFrom(v2.versions[1]!), 1, { optional: false })))?.version).toBe(1)
  })

  it('treats order as presentation: the same properties in another order are the same version', () => {
    const reordered = moveField(draftFrom(v1.versions[0]!), 1, 0)
    expect(fieldsOf(reordered).map((f) => f.name)).toEqual(['b', 'a'])
    expect(changesFrom(v1.versions[0]!, reordered)).toEqual([])
    expect(versionLike(v1, fieldsOf(reordered))?.version).toBe(1)
    expect(() => addVersion(v1, reordered)).toThrow('This is exactly version 1')
    // Validation never depended on order.
    const turned: DefinitionVersion = { ...v1.versions[0]!, fields: [...v1.versions[0]!.fields].reverse() }
    expect(validate(turned, { a: 'x', b: 'y' })).toEqual(validate(v1.versions[0]!, { a: 'x', b: 'y' }))
  })
})

describe('Transforms with optional properties', () => {
  const mapping = (properties: Mapping['properties'], to = CARD): Mapping => ({ id: 'm', version: 1, workspaceId: W, from: { id: 'contact', version: 1 }, to: { id: to.id, version: to.version }, properties })
  const catalog = (m: Mapping, data: Data): Catalog => ({ definitions: [CONTACT, CARD], records: [{ id: 'r', workspaceId: W, definition: { id: 'contact', version: 1 }, data }], mappings: [m] })
  const run = (m: Mapping, data: Data) => invoke(catalog(m, data), { workspaceId: W, feature: orbitTransformV2, input: { record: 'r' }, mapping: { id: 'm', version: 1 } })

  it('needs every required output, and may leave an optional one unmapped: it is simply left out', () => {
    const result = run(mapping([{ name: 'greeting', source: prop('name') }]), { name: 'Ada', age: 36 })
    expect(result.evidence.outcome).toEqual({ kind: 'succeeded' })
    expect(result.output!.data).toEqual({ greeting: 'Ada' })
    expect(Object.hasOwn(result.output!.data, 'alias')).toBe(false)
    // A required output left unmapped is still refused, by the output's own Definition.
    const without = run(mapping([{ name: 'alias', source: prop('name') }]), { name: 'Ada', age: 36 })
    expect(without.evidence.outcome).toMatchObject({ kind: 'failed', reason: 'invalid_output', issues: [{ problem: 'missing', field: 'greeting' }] })
  })

  it('maps an optional input into an optional output: there when it’s there, left out (never invented) when it isn’t', () => {
    const m = mapping([{ name: 'greeting', source: prop('name') }, { name: 'alias', source: prop('nickname') }])
    expect(run(m, { name: 'Ada', age: 36, nickname: 'Countess' }).output!.data).toEqual({ greeting: 'Ada', alias: 'Countess' })
    const absent = run(m, { name: 'Ada', age: 36 })
    expect(absent.evidence.outcome).toEqual({ kind: 'succeeded' })
    expect(absent.output!.data).toEqual({ greeting: 'Ada' })
    // Inside a function too: the whole value is absent, not joined around a hole.
    expect(evaluatePresent(join([prop('name'), prop('nickname')]), { name: 'Ada', age: 36 })).toEqual({ present: false })
    expect(evaluatePresent(join([prop('name'), prop('nickname')]), { name: 'Ada', age: 36, nickname: '' })).toEqual({ present: true, value: 'Ada ' })
  })

  it('refuses, before running, to feed a required output from an optional input: there is no fallback', () => {
    const m = mapping([{ name: 'greeting', source: join([prop('name'), prop('nickname')]) }])
    expect(checkMapping(m, CONTACT, CARD).issues).toEqual([{ problem: 'may_be_absent', path: ['greeting'], optional: ['nickname'] }])
    // Refused even when this particular input happens to have it: it can't be assumed to exist.
    const result = run(m, { name: 'Ada', age: 36, nickname: 'Countess' })
    expect(result.evidence.outcome).toMatchObject({ kind: 'not_attempted', reason: 'invalid_mapping' })
    expect(result.output).toBeUndefined()
    // Without the output Definition (e.g. one property previewed on its own) there's nothing to refuse.
    expect(checkMapping(m, CONTACT).issues).toEqual([])
    expect(checkMapping(m, CONTACT).absent).toEqual([['nickname']])
  })

  it('keeps false and zero from an optional input as values', () => {
    const FLAGS = defineVersion({ id: 'flags', version: 1, name: 'Flags', workspaceId: W, fields: [{ name: 'on', type: 'boolean', optional: true }, { name: 'n', type: 'number', optional: true }] })
    const m: Mapping = { id: 'm', version: 1, workspaceId: W, from: { id: 'contact', version: 1 }, to: { id: 'flags', version: 1 }, properties: [{ name: 'on', source: prop('subscribed') }, { name: 'n', source: prop('age') }] }
    const result = invoke({ definitions: [CONTACT, FLAGS], records: [{ id: 'r', workspaceId: W, definition: { id: 'contact', version: 1 }, data: { name: 'Ada', age: 0, subscribed: false } }], mappings: [m] }, { workspaceId: W, feature: orbitTransformV2, input: { record: 'r' }, mapping: { id: 'm', version: 1 } })
    expect(result.output!.data).toEqual({ on: false, n: 0 })
  })

  it('writes evidence in the same shape: references and outcomes only, naming Transform v2, nothing about absence', () => {
    const result = run(mapping([{ name: 'greeting', source: prop('name') }]), { name: 'Ada', age: 36 })
    expect(result.evidence).toEqual({
      workspaceId: W,
      feature: { id: 'orbit.transform', version: 2 },
      mapping: { id: 'm', version: 1 },
      input: { record: 'r', definition: { id: 'contact', version: 1 } },
      output: { definition: { id: 'card', version: 1 } },
      outcome: { kind: 'succeeded' },
    })
    expect(Object.isFrozen(result.evidence)).toBe(true)
  })
})

describe('The Designer’s review of a Transform agrees', () => {
  it('counts only required outputs as missing; an optional one may stay unmapped', async () => {
    const { reviewDraft } = await import('../app/dev/designer/preview')
    const review = reviewDraft([{ name: 'greeting', source: prop('name') }], CONTACT, CARD, 'Card · v1')
    expect(review.missing).toEqual([])
    expect(review.problems).toEqual([])
    expect(review.fields.find((f) => f.name === 'alias')).toMatchObject({ state: 'not_set', optional: true })
    expect(reviewDraft([], CONTACT, CARD, 'Card · v1').missing).toEqual(['greeting'])
  })
})
