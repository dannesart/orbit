// Experiment #9, Phase 3: the Composable Definition Studio. Its drafts are trees (local objects with
// their own rows, references to exact versions), and everything Orbit accepts is still decided by
// Orbit's own check and validation (shared/features), never a second model or validator.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { type Field, defineVersion, sameFields, validate } from '../shared/features/definitions'
import {
  type Draft, ORBIT_PROVIDED, addField, addVersion, changeWords, changesFrom, childrenOf, createDefinition, draftFrom, draftProblems, fieldsOf,
  findField, isWithin, locate, moveField, placesFor, removeField, updateField, versionLike,
} from '../app/dev/definitions/model'
import { studioCatalogue } from '../app/dev/definitions/catalogue'
import { allNodes, exampleTree, previewResult, reconcile, resetEntries } from '../app/dev/definitions/example'

const W = 'ws-a'
const empty: Draft = { basedOn: null, fields: [], nextKey: 0 }
/** Adds a named property and returns the draft and the new key. */
function add(draft: Draft, name: string, type: Field['type'] = 'string', parent: number | null = null): [Draft, number] {
  const next = addField(draft, type, { parent, name })
  return [next, next.nextKey - 1]
}
/** Candidate: firstName, contact { email, phone? }, address? { street, city }. */
function candidate() {
  let d = empty
  let first, contact, email, phone, address, street, city
  ;[d, first] = add(d, 'firstName')
  ;[d, contact] = add(d, 'contact', 'object')
  ;[d, email] = add(d, 'email', 'string', contact)
  ;[d, phone] = add(d, 'phone', 'string', contact)
  d = updateField(d, phone, { optional: true })
  ;[d, address] = add(d, 'address', 'object')
  d = updateField(d, address, { optional: true })
  ;[d, street] = add(d, 'street', 'string', address)
  ;[d, city] = add(d, 'city', 'string', address)
  return { d, keys: { first, contact, email, phone, address, street, city } }
}
const check = { owner: W, resolve: () => null }

describe('Drafts are trees: local objects hold their own rows', () => {
  it('builds the example with every level intact, as Orbit’s own fields', () => {
    const { d } = candidate()
    expect(fieldsOf(d)).toEqual([
      { name: 'firstName', type: 'string' },
      { name: 'contact', type: 'object', fields: [{ name: 'email', type: 'string' }, { name: 'phone', type: 'string', optional: true }] },
      { name: 'address', type: 'object', optional: true, fields: [{ name: 'street', type: 'string' }, { name: 'city', type: 'string' }] },
    ])
    expect(draftProblems(d, check)).toEqual([])
  })

  it('keeps every row’s key unique across the whole tree, and stable through edits', () => {
    const { d, keys } = candidate()
    const all = locate(d.fields).map((l) => l.field.key)
    expect(new Set(all).size).toBe(all.length)
    const renamed = updateField(d, keys.email, { name: 'mail' })
    expect(findField(renamed, keys.email)?.path).toEqual(['contact', 'mail'])
  })

  it('removes an object with everything inside it, and nothing else', () => {
    const { d, keys } = candidate()
    const without = removeField(d, keys.contact)
    expect(findField(without, keys.email)).toBeNull()
    expect(locate(without.fields).map((l) => l.path.join('.'))).toEqual(['firstName', 'address', 'address.street', 'address.city'])
  })

  it('moves rows within a level, into an object and back out', () => {
    const { d, keys } = candidate()
    const reordered = moveField(d, keys.phone, 0)
    expect(childrenOf(reordered, keys.contact).map((f) => f.name)).toEqual(['phone', 'email'])
    const moved = moveField(d, keys.first, 0, keys.contact)
    expect(findField(moved, keys.first)?.path).toEqual(['contact', 'firstName'])
    const back = moveField(moved, keys.first, 0, null)
    expect(findField(back, keys.first)?.path).toEqual(['firstName'])
  })

  it('never moves an object into itself or its own contents', () => {
    let { d, keys } = candidate()
    let inner
    ;[d, inner] = add(d, 'inner', 'object', keys.contact)
    expect(moveField(d, keys.contact, 0, inner)).toBe(d)
    expect(moveField(d, keys.contact, 0, keys.contact)).toBe(d)
    expect(isWithin(d, inner, keys.contact)).toBe(true)
    expect(placesFor(d, keys.contact).map((p) => p.path.join('.'))).toEqual(['', 'address'])
    expect(placesFor(d, keys.email).map((p) => p.path.join('.'))).toEqual(['', 'contact', 'contact.inner', 'address'])
  })

  it('allows empty local objects, as Orbit does', () => {
    const [d] = add(empty, 'prefs', 'object')
    expect(draftProblems(d, check)).toEqual([])
    expect(fieldsOf(d)).toEqual([{ name: 'prefs', type: 'object', fields: [] }])
  })
})

describe('What a draft may become is Orbit’s own check, at every level', () => {
  it('applies the naming rule within each object, and only there', () => {
    const { d, keys } = candidate()
    const [clash] = add(d, 'Email', 'string', keys.contact)
    expect(draftProblems(clash, check)).toEqual(['In contact: “email” and “Email” differ only in capital letters. Use one name, or two clearly different ones.'])
    const [same] = add(d, 'email', 'string', keys.address)
    expect(draftProblems(same, check)).toEqual([]) // the same name in another object is fine
    const [blank] = add(d, '   ', 'string', keys.address)
    expect(draftProblems(blank, check)).toEqual(['In address: Every property needs a name.'])
  })

  it('refuses a model deeper than 16 levels, as Orbit does, rather than cutting it short', () => {
    let d = empty
    let parent: number | null = null
    for (let level = 2; level <= 17; level++) [d, parent] = add(d, `o${level}`, 'object', parent)
    expect(draftProblems(d, check)).toEqual(['o2 › o3 › o4 › o5 › o6 › o7 › o8 › o9 › o10 › o11 › o12 › o13 › o14 › o15 › o16 › o17 would nest 17 levels deep. At most 16 are allowed.'])
  })

  it('makes versions Orbit itself validates, recursively', () => {
    const made = createDefinition({ id: 'cand', workspaceId: W, name: 'Candidate', description: '', draft: candidate().d })
    const v1 = made.versions[0]!
    expect(validate(v1, { firstName: 'Ada', contact: { email: 'a' } })).toEqual([])
    expect(validate(v1, { firstName: 'Ada', contact: {}, address: { street: 's' } })).toEqual([
      { problem: 'missing', path: ['contact', 'email'], expected: 'string' },
      { problem: 'missing', path: ['address', 'city'], expected: 'string' },
    ])
  })

  it('treats reordering at any level as the same version, and a structural change anywhere as a new one', () => {
    const made = createDefinition({ id: 'cand', workspaceId: W, name: 'Candidate', description: '', draft: candidate().d })
    const base = draftFrom(made.versions[0]!)
    const contact = base.fields.find((f) => f.name === 'contact')!
    const reordered = moveField(moveField(base, contact.fields![1]!.key, 0), contact.key, 0)
    expect(versionLike(made, fieldsOf(reordered))?.version).toBe(1)
    expect(() => addVersion(made, reordered)).toThrow('This is exactly version 1')
    const deeper = updateField(base, contact.fields![1]!.key, { optional: false })
    expect(addVersion(made, deeper).versions).toHaveLength(2)
  })
})

describe('Change summaries follow rows at every level', () => {
  const made = createDefinition({ id: 'cand', workspaceId: W, name: 'Candidate', description: '', draft: candidate().d })
  const v1 = made.versions[0]!
  const keyOf = (d: Draft, path: string) => locate(d.fields).find((l) => l.path.join('.') === path)!.field.key

  it('locates renames, moves, requiredness and type changes by path', () => {
    let d = draftFrom(v1)
    d = updateField(d, keyOf(d, 'contact.email'), { name: 'mail' })
    d = moveField(d, keyOf(d, 'firstName'), 0, keyOf(d, 'contact'))
    d = updateField(d, keyOf(d, 'address'), { optional: false })
    d = updateField(d, keyOf(d, 'address.city'), { type: 'number' })
    expect(changesFrom(v1, d)).toEqual([
      { kind: 'moved', from: ['firstName'], path: ['contact', 'firstName'] },
      { kind: 'renamed', from: ['contact', 'email'], path: ['contact', 'mail'] },
      { kind: 'requirement', path: ['address'], optional: false },
      { kind: 'retyped', path: ['address', 'city'], from: 'string', to: 'number' },
    ])
    expect(changesFrom(v1, d).map((c) => changeWords(c))).toEqual([
      'Moves firstName into contact',
      'Renames contact › email to mail',
      'Makes address required',
      'Changes address › city from text to number',
    ])
  })

  it('says "Adds" or "Removes" once for an object, not for everything inside it', () => {
    let d = draftFrom(v1)
    d = removeField(d, keyOf(d, 'address'))
    let extra
    ;[d, extra] = add(d, 'meta', 'object')
    ;[d] = add(d, 'source', 'string', extra)
    ;[d] = add(d, 'fax', 'string', keyOf(d, 'contact'))
    expect(changesFrom(v1, d).map((c) => changeWords(c))).toEqual(['Removes address', 'Adds contact › fax (text)', 'Adds meta (object)']) // in the model's order
  })
})

describe('The Studio catalogue: this workspace’s Definitions and Orbit’s, never another’s', () => {
  const mine = createDefinition({ id: 'mine', workspaceId: W, name: 'Candidate', description: '', draft: candidate().d })
  const theirs = createDefinition({ id: 'theirs', workspaceId: 'ws-b', name: 'Secret', description: '', draft: candidate().d })
  const catalogue = studioCatalogue(W, [mine, theirs])

  it('offers its own first, then Orbit’s, with every version', () => {
    expect(catalogue.blocks.map((b) => [b.id, b.provided, b.versions.length])).toEqual([
      ['mine', false, 1],
      ...[...new Set(ORBIT_PROVIDED.map((d) => d.id))].map((id) => [id, true, ORBIT_PROVIDED.filter((d) => d.id === id).length]),
    ])
  })

  it('never offers or resolves another workspace’s Definitions', () => {
    expect(catalogue.find('theirs')).toBeNull()
    expect(catalogue.resolve({ id: 'theirs', version: 1 })).toBeNull()
  })

  it('resolves exact versions only, and names them for people', () => {
    expect(catalogue.resolve({ id: 'mine', version: 1 })).toBe(mine.versions[0])
    expect(catalogue.resolve({ id: 'mine', version: 2 })).toBeNull()
    expect(catalogue.label({ id: 'orbit.postal-address', version: 1 })).toBe('Postal address · v1')
  })

  it('a version made through the Studio is Orbit’s own: frozen and the same contract', () => {
    const v = mine.versions[0]!
    expect(Object.isFrozen(v.fields[1]) && Object.isFrozen((v.fields[1] as { fields: readonly Field[] }).fields)).toBe(true)
    expect(sameFields(v.fields, defineVersion(v).fields)).toBe(true)
  })
})

describe('References in the Studio: exact versions, chosen on purpose', () => {
  /** Candidate v1 (firstName), then v2 (firstName, email). */
  function setup() {
    let d = empty
    ;[d] = add(d, 'firstName')
    let cand = createDefinition({ id: 'cand', workspaceId: W, name: 'Candidate', description: '', draft: d })
    let d2 = draftFrom(cand.versions[0]!)
    ;[d2] = add(d2, 'email')
    cand = addVersion(cand, d2)
    const catalogue = studioCatalogue(W, [cand])
    return { cand, catalogue, check: { owner: W, resolve: catalogue.resolve, label: catalogue.label } }
  }

  it('pins exactly the version chosen, at any level, never copying what it contains', () => {
    const { catalogue, check } = setup()
    let d = empty, process
    ;[d] = add(d, 'name')
    d = addField(d, 'reference', { definition: { id: 'cand', version: 1 }, name: 'candidate' })
    ;[d, process] = add(d, 'meta', 'object')
    d = addField(d, 'reference', { parent: process, definition: { id: 'orbit.postal-address', version: 1 }, name: 'office' })
    expect(draftProblems(d, check)).toEqual([])
    const made = createDefinition({ id: 'proc', workspaceId: W, name: 'Process', description: '', draft: d, resolve: catalogue.resolve })
    expect(made.versions[0]!.fields).toEqual([
      { name: 'name', type: 'string' },
      { name: 'candidate', type: 'reference', definition: { id: 'cand', version: 1 } },
      { name: 'meta', type: 'object', fields: [{ name: 'office', type: 'reference', definition: { id: 'orbit.postal-address', version: 1 } }] },
    ])
    // v2 exists, and nothing moved to it: the data must still fit v1 exactly.
    expect(validate(made.versions[0]!, { name: 'Hire', candidate: { firstName: 'Ada', email: 'a' }, meta: { office: { street: 's', postcode: 'p', city: 'c' } } }, catalogue.resolve))
      .toEqual([{ problem: 'unexpected', path: ['candidate', 'email'] }])
  })

  it('refuses, in words, a reference this workspace can’t resolve, and never creates it', () => {
    const { catalogue, check } = setup()
    const d = addField(empty, 'reference', { definition: { id: 'their-secret', version: 1 }, name: 'x' })
    expect(draftProblems(d, check)).toEqual(['x refers to their-secret · v1, which can’t be found here.'])
    expect(() => createDefinition({ id: 'p', workspaceId: W, name: 'P', description: '', draft: d, resolve: catalogue.resolve })).toThrow()
  })

  it('lets a next version reference an earlier version of its own Definition', () => {
    const { cand, catalogue } = setup()
    const d = addField(draftFrom(cand.versions[1]!), 'reference', { definition: { id: 'cand', version: 1 }, name: 'previous' })
    expect(addVersion(cand, d, catalogue.resolve).versions[2]!.fields.at(-1)).toEqual({ name: 'previous', type: 'reference', definition: { id: 'cand', version: 1 } })
  })

  it('records switching versions as a change, named for people', () => {
    const { catalogue } = setup()
    const d = addField(empty, 'reference', { definition: { id: 'cand', version: 1 }, name: 'candidate' })
    const made = createDefinition({ id: 'proc', workspaceId: W, name: 'Process', description: '', draft: d, resolve: catalogue.resolve })
    const next = updateField(draftFrom(made.versions[0]!), 0, { definition: { id: 'cand', version: 2 } })
    const changes = changesFrom(made.versions[0]!, next)
    expect(changes).toEqual([{ kind: 'repointed', path: ['candidate'], from: { id: 'cand', version: 1 }, to: { id: 'cand', version: 2 } }])
    expect(changeWords(changes[0]!, catalogue.label)).toBe('Changes candidate from Candidate · v1 to Candidate · v2')
    expect(versionLike(made, fieldsOf(next))).toBeNull()
  })
})

describe('The nested Preview: examples from the actual contract, judged by Orbit', () => {
  // Process: name, candidate → Candidate v1 (firstName, contact { email }), address? { street, city }
  const cand = createDefinition({ id: 'cand', workspaceId: W, name: 'Candidate', description: '', draft: (() => {
    let d = empty, contact
    ;[d] = add(d, 'firstName')
    ;[d, contact] = add(d, 'contact', 'object')
    ;[d] = add(d, 'email', 'string', contact)
    return d
  })() })
  const catalogue = studioCatalogue(W, [cand])
  const context = { owner: W, resolve: catalogue.resolve, label: catalogue.label }
  let draft = empty, address
  ;[draft] = add(draft, 'name')
  draft = addField(draft, 'reference', { definition: { id: 'cand', version: 1 }, name: 'candidate' })
  ;[draft, address] = add(draft, 'address', 'object')
  draft = updateField(draft, address, { optional: true })
  ;[draft] = add(draft, 'street', 'string', address)
  ;[draft] = add(draft, 'city', 'string', address)
  const nodeId = (path: string) => allNodes(exampleTree(draft.fields, catalogue.resolve)).find((n) => n.path.join('.') === path)!.id

  it('generates example information all the way down, through references, and it fits', () => {
    const entries = resetEntries(draft.fields, catalogue.resolve)
    const result = previewResult(draft.fields, entries, null, context)
    expect(result.data).toEqual({
      name: 'Example text',
      candidate: { firstName: 'Example text', contact: { email: 'Example text' } },
      address: { street: 'Example text', city: 'Example text' },
    })
    expect(result.issues).toEqual([])
    expect(result.unavailable).toEqual([])
  })

  it('leaves an optional object out entirely, keeps what was typed inside it, and brings it back', () => {
    let entries = resetEntries(draft.fields, catalogue.resolve)
    entries = { ...entries, [nodeId('address.city')]: { ...entries[nodeId('address.city')]!, value: 'London', edited: true } }
    const out = { ...entries, [nodeId('address')]: { ...entries[nodeId('address')]!, given: false } }
    const left = previewResult(draft.fields, out, null, context)
    expect(Object.hasOwn(left.data, 'address')).toBe(false)
    expect(left.left).toEqual(['address'])
    expect(left.issues).toEqual([])
    // Reconciling keeps the hidden value; given again, it's there.
    const kept = reconcile(out, draft.fields, catalogue.resolve)
    expect(kept[nodeId('address.city')]!.value).toBe('London')
    const back = previewResult(draft.fields, { ...kept, [nodeId('address')]: { ...kept[nodeId('address')]!, given: true } }, null, context)
    expect(back.data.address).toEqual({ street: 'Example text', city: 'London' })
  })

  it('locates Orbit’s problems at exact paths, across objects and references', () => {
    const entries = resetEntries(draft.fields, catalogue.resolve)
    const broken = {
      ...entries,
      [nodeId('address.city')]: { ...entries[nodeId('address.city')]!, given: false },
      [nodeId('candidate.contact.email')]: { ...entries[nodeId('candidate.contact.email')]!, given: false },
    }
    const result = previewResult(draft.fields, broken, null, context)
    expect(result.byPath['candidate\u001fcontact\u001femail']).toBe('candidate › contact › email is missing, and it’s required.')
    expect(result.byPath['address\u001fcity']).toBe('address › city is missing, and it’s required.')
    expect(result.left).toEqual(['candidate › contact › email', 'address › city'])
  })

  it('reconciles with a changing model at every level, by row', () => {
    let entries = resetEntries(draft.fields, catalogue.resolve)
    entries = { ...entries, [nodeId('address.street')]: { ...entries[nodeId('address.street')]!, value: 'Main St', edited: true } }
    const renamed = updateField(draft, address, { name: 'home' })
    const next = reconcile(entries, renamed.fields, catalogue.resolve)
    expect(previewResult(renamed.fields, next, null, context).data.home).toEqual({ street: 'Main St', city: 'Example text' })
  })

  it('says a reference can’t be resolved here apart from information that doesn’t fit, and judges nothing it can’t', () => {
    const missing = addField(draft, 'reference', { definition: { id: 'gone', version: 3 }, name: 'other' })
    const result = previewResult(missing.fields, resetEntries(missing.fields, catalogue.resolve), null, context)
    expect(result.unavailable).toEqual(['other refers to gone · v3, which can’t be found here.'])
    expect(result.issues).toEqual([])
    const node = exampleTree(missing.fields, catalogue.resolve).find((n) => n.name === 'other')!
    expect(node).toMatchObject({ kind: 'reference', unresolved: true, children: [] })
  })

  it('never decides whether a version can be made: that’s the draft’s own check', () => {
    const entries = resetEntries(draft.fields, catalogue.resolve)
    const nothingGiven = Object.fromEntries(Object.entries(entries).map(([k, e]) => [k, { ...e, given: false }]))
    expect(previewResult(draft.fields, nothingGiven, null, context).issues.length).toBeGreaterThan(0)
    expect(draftProblems(draft, context)).toEqual([])
  })
})

describe('Catalogue and inspector: composed Definitions inspected, never flattened or hidden', () => {
  const root = new URL('..', import.meta.url)
  const read = (f: string) => readFileSync(new URL(f, root), 'utf8')
  const inspector = read('app/dev/definitions/DefinitionInspector.vue')
  const tree = read('app/dev/definitions/ContractTree.vue')
  const place = read('app/dev/definitions/DefinitionsPlace.vue')

  it('inspects the version shown as its whole contract, read-only, through the workspace’s own catalogue', () => {
    expect(inspector).toContain('<ContractTree :key="shown.version" class="-ml-1" :fields="shown.fields" :catalogue="catalogue" data-inspector-contract />')
    expect(inspector).toContain('const catalogue = computed(() => catalogueOf(props.workspace.id))')
    expect(tree).not.toMatch(/updateField|emit\(/)
  })

  it('names exactly the version a reference pins, and says so when one can’t be resolved', () => {
    expect(tree).toContain('{{ catalogue.label(f.definition) }}')
    expect(tree).toContain('can’t be found here')
    expect(tree).toMatch(/const deeper = computed\(\(\) => props\.level < MAX_OBJECT_LEVELS\)/)
  })

  it('tells on a catalogue card when a Definition builds on others', () => {
    expect(place).toContain('{{ uses(d.versions.at(-1)!.fields) }}')
  })
})
