// Experiment #7: Definitions made in a workspace, independently of any workflow, then used as an
// exact output version by the Designer's Transform. Preview-only, in this tab's memory only.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Data } from '../shared/features/definitions'
import type { Expression, MappingProperty } from '../shared/features/mappings'
import { orbitConsole } from '../shared/features/features'
import {
  type Draft, ORBIT_PROVIDED, addField, addVersion, blankDraft, changesFrom, checkExample, checkSequence, createDefinition,
  draftFrom, draftProblems, exampleData, fieldsOf, issueWords, nameNotes, newIdentity, removeField, renamed, updateField,
} from '../app/dev/definitions/model'
import { createFromDraft, findMade, setCreating, setEvolving, shelfOf, versionFromDraft } from '../app/dev/definitions/store'
import { designerWorkspace, definitionsPath, offeredIn, placeIn, requestedOutput } from '../app/dev/definitions/designer'
import {
  type Configuration, LOCAL_ID, allDefinitions, applyConfiguration, catalogue, draftFrom as transformDraftFrom, initialConfiguration, labelOf, outputOf,
} from '../app/dev/designer/config'
import { toDraft } from '../app/dev/designer/parts'
import { reviewDraft } from '../app/dev/designer/preview'
import { A1, ELSEWHERE, INITIAL_DATA, RECORD_ID, WORKSPACE, runExperiment } from '../app/dev/features/experiment'
import { experimentPlaceOf } from '../app/dev/workspace/place'

const root = join(import.meta.dirname, '..')
const source = (f: string) => readFileSync(join(root, f), 'utf8')

/** A draft with these properties, as someone would type them. */
function draftOf(...fields: [string, 'string' | 'number' | 'boolean'][]): Draft {
  let draft = removeField(blankDraft(), 0)
  for (const [name, type] of fields) {
    draft = addField(draft)
    draft = updateField(draft, draft.nextKey - 1, { name, type })
  }
  return draft
}
const person = (id = 'definition-person', workspaceId = 'ws-acme') =>
  createDefinition({ id, workspaceId, name: 'Person', description: 'Someone we stay in touch with.', draft: draftOf(['full name', 'string'], ['subscribed', 'boolean']) })

describe('Creating a Definition', () => {
  it('makes an immutable version 1 with Orbit’s own model: exact properties, its workspace, its name', () => {
    const made = person()
    expect(made.versions).toHaveLength(1)
    expect(made.versions[0]).toEqual({
      id: 'definition-person', version: 1, name: 'Person', workspaceId: 'ws-acme',
      fields: [{ name: 'full name', type: 'string' }, { name: 'subscribed', type: 'boolean' }],
    })
    expect(Object.isFrozen(made.versions[0]) && Object.isFrozen(made.versions[0]!.fields[0])).toBe(true)
    expect(() => ((made.versions[0]!.fields as unknown[]).push({ name: 'x', type: 'string' }))).toThrow()
  })

  it('needs a name and sound properties, and says so plainly', () => {
    expect(() => createDefinition({ id: 'd', workspaceId: 'w', name: '  ', description: '', draft: draftOf(['a', 'string']) })).toThrow()
    expect(draftProblems(draftOf())).toEqual(['Add at least one property.'])
    expect(draftProblems(draftOf(['', 'string']))).toEqual(['Every property needs a name.'])
    expect(draftProblems(draftOf(['Email', 'string'], ['email ', 'string']))).toEqual(['Two properties are called “Email”.'])
    expect(fieldsOf(draftOf([' First name ', 'string']))).toEqual([{ name: 'First name', type: 'string' }])
  })

  it('generates identities nobody types, and never reuses one', () => {
    const answers = ['aaaa-1111', 'aaaa-1111', 'bbbb-2222']
    const taken = new Set(['definition-aaaa1111'])
    expect(newIdentity((id) => taken.has(id), () => answers.shift()!)).toBe('definition-bbbb2222')
    expect(() => newIdentity(() => true, () => 'same')).toThrow()
  })

  it('warns (never blocks) when a name repeats another or reads like the workspace’s People', () => {
    expect(nameNotes('person', ['Invoice', 'Person'], 'Acme')).toEqual([
      'Another Definition here is called person. They would be two different Definitions with the same name.',
      'This describes information about people. It doesn’t change who belongs to Acme: that’s People.',
    ])
    expect(nameNotes('Invoice line', ['Invoice'], 'Acme')).toEqual([])
  })
})

describe('Checking an example, with Orbit’s own validation', () => {
  const fields = [{ name: 'full name', type: 'string' as const }, { name: 'age', type: 'number' as const }, { name: 'subscribed', type: 'boolean' as const }]

  it('accepts exactly what the Definition describes', () => {
    const data = exampleData(fields, { values: { 'full name': { kind: 'text', text: 'Ada' }, age: { kind: 'text', text: '36' }, subscribed: { kind: 'yes' } }, extra: null })
    expect(data).toEqual({ 'full name': 'Ada', age: 36, subscribed: true })
    expect(checkExample(fields, data)).toEqual([])
  })

  it('shows what a missing property, a wrong type and something extra do, in plain words', () => {
    const data = exampleData(fields, { values: { age: { kind: 'text', text: 'thirty' }, subscribed: { kind: 'no' } }, extra: { name: 'nickname', text: 'A' } })
    expect(checkExample(fields, data).map(issueWords)).toEqual([
      'full name is missing. Every property is required.',
      'age should be a number, not text.',
      'nickname isn’t one of its properties, so it isn’t accepted.',
    ])
  })
})

describe('Evolving a Definition', () => {
  it('makes version 2 after version 1, and leaves version 1 exactly as it was', () => {
    const v1made = person()
    const draft = addField(draftFrom(v1made.versions[0]!))
    const next = addVersion(v1made, updateField(draft, draft.nextKey - 1, { name: 'email', type: 'string' }))
    expect(next.versions.map((v) => v.version)).toEqual([1, 2])
    expect(next.versions[0]).toBe(v1made.versions[0])
    expect(next.versions[1]!.fields.map((f) => f.name)).toEqual(['full name', 'subscribed', 'email'])
    expect(next.id).toBe(v1made.id)
  })

  it('never makes a version that is exactly like one that exists, even when started from an older one', () => {
    const one = person()
    expect(() => addVersion(one, draftFrom(one.versions[0]!))).toThrow('exactly version 1')
    const two = addVersion(one, removeField(draftFrom(one.versions[0]!), 1))
    expect(() => addVersion(two, removeField(draftFrom(one.versions[0]!), 1))).toThrow('exactly version 2')
    const three = addVersion(two, updateField(draftFrom(one.versions[0]!), 1, { type: 'string' }))
    expect(three.versions.map((v) => v.version)).toEqual([1, 2, 3])
  })

  it('refuses a history with a gap, a repeat or a stranger in it', () => {
    const made = person()
    const v2 = { ...made.versions[0]!, version: 3 }
    expect(() => checkSequence({ ...made, versions: [made.versions[0]!, v2] })).toThrow('version 3 where version 2 belongs')
    expect(() => checkSequence({ ...made, versions: [made.versions[0]!, made.versions[0]!] })).toThrow()
    expect(() => checkSequence({ ...made, versions: [{ ...made.versions[0]!, workspaceId: 'ws-other' }] })).toThrow()
  })

  it('renames and redescribes without making a version: names are for people', () => {
    const made = person()
    const next = renamed(made, { name: 'Contact', description: 'Anyone we write to.' })
    expect(next.versions).toBe(made.versions)
    expect([next.id, next.name, next.description]).toEqual([made.id, 'Contact', 'Anyone we write to.'])
    expect(next.versions[0]!.name).toBe('Person') // the name it was made with, as Orbit's model keeps it
  })

  it('says what changed, row by row: renamed, retyped, removed, added', () => {
    const base = person().versions[0]!
    let draft = draftFrom(base)
    draft = updateField(draft, 0, { name: 'name' })
    draft = updateField(draft, 1, { type: 'string' })
    draft = addField(draft)
    draft = updateField(draft, draft.nextKey - 1, { name: 'email' })
    expect(changesFrom(base, draft)).toEqual([
      { kind: 'renamed', from: 'full name', to: 'name' },
      { kind: 'retyped', name: 'subscribed', from: 'boolean', to: 'string' },
      { kind: 'added', name: 'email', type: 'string' },
    ])
    expect(changesFrom(base, removeField(draftFrom(base), 0))).toEqual([{ kind: 'removed', name: 'full name' }])
  })
})

describe('This tab’s shelves: one per workspace, nothing shared between them', () => {
  it('creates and evolves through the shelf, with generated identities that never collide with the samples', () => {
    setCreating('ws-shelf-a', { name: 'Person', description: '', draft: draftOf(['full name', 'string']) })
    const id = createFromDraft('ws-shelf-a')
    expect(id).toMatch(/^definition-[a-z0-9]+$/)
    expect([LOCAL_ID, ...ORBIT_PROVIDED.map((d) => d.id), A1.id]).not.toContain(id)
    expect(shelfOf('ws-shelf-a').creating).toBeNull()
    const made = findMade('ws-shelf-a', id)!
    setEvolving('ws-shelf-a', id, addField(draftFrom(made.versions[0]!)))
    setEvolving('ws-shelf-a', id, updateField(shelfOf('ws-shelf-a').evolving[id]!, 1, { name: 'email' }))
    expect(versionFromDraft('ws-shelf-a', id)).toBe(2)
    expect(findMade('ws-shelf-a', id)!.versions[0]).toBe(made.versions[0])
    expect(shelfOf('ws-shelf-a').evolving[id]).toBeUndefined()
    expect(shelfOf('ws-shelf-b').made).toEqual([])
    expect(findMade('ws-shelf-b', id)).toBeNull()
  })
})

describe('The Designer meets the workspace’s Definitions', () => {
  const acme = { id: 'ws-acme', name: 'Acme' }

  it('works in a workspace only when a workspace page set it in this tab and the way back leads there', () => {
    expect(designerWorkspace('/w/ws-acme/definitions?d=x', acme)).toBe(acme)
    expect(designerWorkspace('/w/ws-acme/workflows', acme)).toBe(acme)
    expect(designerWorkspace('/w/ws-other/workflows', acme)).toBeNull()
    expect(designerWorkspace('/w/ws-acme-2/workflows', acme)).toBeNull()
    expect(designerWorkspace(null, acme)).toBeNull()
    expect(designerWorkspace('/w/ws-acme/workflows', null)).toBeNull()
  })

  it('is offered every version made in its workspace and what Orbit provides; never another workspace’s', () => {
    const mine = addVersion(person(), removeField(draftFrom(person().versions[0]!), 1))
    const theirs = person('definition-theirs', 'ws-other')
    const offered = offeredIn(acme, [mine, theirs])
    expect(offered.map((o) => `${o.source}:${o.definition.id}@${o.definition.version}`)).toEqual([
      'workspace:definition-person@1', 'workspace:definition-person@2', 'orbit:orbit.contact-name@1', 'orbit:orbit.postal-address@1',
    ])
    expect(offeredIn(null, [mine]).every((o) => o.source === 'orbit')).toBe(true)
  })

  it('lists no other workspace’s Definition in the output catalogue, not even disabled', () => {
    expect(catalogue().some((d) => d.workspaceId === ELSEWHERE)).toBe(false)
    expect(source('app/dev/designer/StructureEditor.vue')).not.toMatch(/another workspace’s|:disabled="d\.workspaceId/)
  })

  it('accepts a requested output only when it’s exactly an offered version', () => {
    const offered = offeredIn(acme, [person()])
    expect(requestedOutput('definition-person@1', offered)).toEqual({ id: 'definition-person', version: 1 })
    expect(requestedOutput('definition-person@2', offered)).toBeNull()
    expect(requestedOutput('definition-theirs@1', offered)).toBeNull()
    expect(requestedOutput(['definition-person@1'], offered)).toBeNull()
    expect(definitionsPath('ws-acme', 'definition-person', 2)).toBe('/w/ws-acme/definitions?d=definition-person&v=2')
  })

  it('places only the playground’s own samples in the workspace; another workspace’s stay where they are', () => {
    const catalog = { definitions: allDefinitions(initialConfiguration()), records: [{ id: RECORD_ID, workspaceId: WORKSPACE, definition: A1, data: INITIAL_DATA }], mappings: [] }
    const placed = placeIn(catalog, 'ws-acme')
    expect(placed.records[0]!.workspaceId).toBe('ws-acme')
    expect(placed.definitions.find((d) => d.id === A1.id)!.workspaceId).toBe('ws-acme')
    expect(placed.definitions.find((d) => d.workspaceId === ELSEWHERE)).toBeTruthy()
    expect(placeIn(catalog, WORKSPACE)).toBe(catalog)
  })
})

describe('Journey A: made in Definitions, used as an exact version in the Transform', () => {
  const acme = { id: 'ws-acme', name: 'Acme' }
  const prop = (name: string): Expression => ({ kind: 'property', name })
  const fullName: MappingProperty = {
    name: 'full name',
    source: { kind: 'call', fn: 'join', args: [{ kind: 'list', items: [{ kind: 'call', fn: 'trim', args: [prop('firstName')] }, { kind: 'literal', value: ' ' }, prop('lastName')] }, { kind: 'literal', value: '' }] },
  }
  const subscribed: MappingProperty = { name: 'subscribed', source: { kind: 'literal', value: true } }
  const v1 = person()
  const v2 = addVersion(v1, updateField(addField(draftFrom(v1.versions[0]!)), 2, { name: 'email' }))

  function use(config: Configuration, ref: { id: string; version: number }, properties: MappingProperty[]) {
    return applyConfiguration(config, { ...transformDraftFrom(config), use: 'catalogue', catalogue: ref, properties: toDraft(properties) })
  }
  function run(config: Configuration, workspaceId: string) {
    const catalog = { definitions: allDefinitions(config), records: [{ id: RECORD_ID, workspaceId: WORKSPACE, definition: A1, data: INITIAL_DATA as Data }], mappings: config.mappings }
    return runExperiment(placeIn(catalog, workspaceId), { console: orbitConsole, mapping: config.mapping, workspaceId })
  }

  it('maps, applies and runs into a Value of exactly that version, with evidence naming it', () => {
    const config = use(initialConfiguration(offeredIn(acme, [v2])), { id: v1.id, version: 1 }, [fullName, subscribed])
    expect(labelOf(config, config.output)).toBe('Person · v1')
    const [, transform, out] = run(config, 'ws-acme')
    expect(transform!.evidence.outcome).toEqual({ kind: 'succeeded' })
    expect(transform!.output).toEqual({ definition: { id: v1.id, version: 1 }, data: { 'full name': 'Ada Lovelace', subscribed: true } })
    expect(transform!.evidence).toMatchObject({ workspaceId: 'ws-acme', mapping: { id: `transform:${v1.id}@1`, version: 1 }, output: { definition: { id: v1.id, version: 1 } } })
    expect(out!.evidence.outcome.kind).toBe('succeeded')
  })

  it('keeps using version 1 after version 2 exists: nothing moves by itself', () => {
    const config = use(initialConfiguration(offeredIn(acme, [v2])), { id: v1.id, version: 1 }, [fullName, subscribed])
    expect(run(config, 'ws-acme')[1]!.output!.definition).toEqual({ id: v1.id, version: 1 })
  })

  it('fails truthfully when the mapping doesn’t fit the chosen version', () => {
    const offered = offeredIn(acme, [v2])
    const start = initialConfiguration(offered)
    const target = outputOf(start, { ...transformDraftFrom(start), use: 'catalogue', catalogue: { id: v1.id, version: 2 } }).definition
    expect(reviewDraft([fullName, subscribed], A1, target).problems.length).toBeGreaterThan(0)
    // Applied anyway (the playground allows it for Mapping problems): the boundary refuses the output.
    const config = use(start, { id: v1.id, version: 2 }, [fullName, subscribed])
    const [, transform, out] = run(config, 'ws-acme')
    expect(transform!.evidence.outcome).toEqual({ kind: 'failed', reason: 'invalid_output', issues: [{ problem: 'missing', field: 'email', expected: 'string' }] })
    expect(transform!.output).toBeUndefined()
    expect(out).toBeNull()
  })

  it('can’t use one workspace’s Definition from another: not found, exactly as if it didn’t exist', () => {
    const config = use(initialConfiguration(offeredIn(acme, [v2])), { id: v1.id, version: 1 }, [fullName, subscribed])
    const [first, transform] = run(config, 'ws-other')
    expect(first!.evidence.outcome.kind).toBe('succeeded')
    expect(transform!.evidence.outcome).toEqual({ kind: 'not_attempted', reason: 'not_found' })
  })
})

describe('Journey B stays as it was', () => {
  it('keeps the Transform’s own output, under its one identity, apart from the workspace’s Definitions', () => {
    const start = initialConfiguration(offeredIn({ id: 'ws-acme', name: 'Acme' }, [person()]))
    const config = applyConfiguration(start, { ...transformDraftFrom(start), use: 'local', local: { name: 'Summary', fields: [{ name: 'fullName', type: 'string' }] } })
    expect(config.locals[0]).toMatchObject({ id: LOCAL_ID, version: 1 })
    expect(catalogue(config.offered).some((d) => d.id === LOCAL_ID)).toBe(false)
    expect(shelfOf('ws-acme').made.some((d) => d.id === LOCAL_ID)).toBe(false)
  })
})

describe('Preview-only, and nothing kept', () => {
  const files = readdirSync(join(root, 'app/dev/definitions')).map((f) => join('app/dev/definitions', f))

  it('registers the Definitions place below the preview-only guard, and nothing under app/pages mentions it', () => {
    const config = source('nuxt.config.ts')
    const guard = config.indexOf('if (!playgroundAvailable(')
    expect(config.indexOf("path: 'definitions'")).toBeGreaterThan(guard)
    expect(config).toMatch(/app\/dev\/definitions\/DefinitionsPlace\.vue/)
    const pages = (dir: string): string[] => readdirSync(join(root, dir), { withFileTypes: true })
      .flatMap((e) => (e.isDirectory() ? pages(join(dir, e.name)) : [join(dir, e.name)]))
    for (const page of pages('app/pages')) expect(source(page), page).not.toMatch(/definitions|DefinitionsPlace/i)
  })

  it('adds no navigation item: Definitions shows as the Workflows place, and only behind the flag', () => {
    expect(experimentPlaceOf('/w/ws-acme/definitions', 'ws-acme')).toBe('workflows')
    expect(experimentPlaceOf('/w/ws-acme/definitions?d=x&v=2', 'ws-acme')).toBe('workflows')
    expect(experimentPlaceOf('/w/ws-acme/people', 'ws-acme')).toBeNull()
    expect(source('app/components/WorkspaceNav.vue')).toMatch(/import\.meta\.env\.ORBIT_PLAYGROUND === true \? experimentPlaceOf\(/)
    expect(source('app/utils/workspaceNav.ts')).not.toMatch(/definitions/i)
  })

  it('never fetches, stores, logs or evaluates anything, and imports only the experiments and Orbit’s language', () => {
    const forbidden = /\bconsole\s*\.|\$?fetch\s*\(|useFetch|useAsyncData|localStorage|sessionStorage|indexedDB|document\.cookie|\beval\s*\(|new\s+Function\b|useDb|postgres/
    for (const f of files) {
      expect(source(f), f).not.toMatch(forbidden)
      for (const [, from] of source(f).matchAll(/(?:from\s+|import\s+)'([^']+)'/g)) {
        expect(from, `${f} imports ${from}`).toMatch(/^(\.\/|\.\.\/features\/|\.\.\/designer\/|#shared\/features\/|vue)$|^(\.\/|\.\.\/features\/|\.\.\/designer\/|#shared\/features\/)/)
      }
    }
  })

  it('tells the truth about how long things last, and what’s a sample', () => {
    const place = source('app/dev/definitions/DefinitionsPlace.vue')
    expect(place).toMatch(/stays in this browser tab, for \{\{ ws\.name \}\} only, until you reload or close it\. Nothing is saved/)
    expect(place).toMatch(/These are samples that exist only in this preview/)
    expect(source('app/dev/definitions/DefinitionCreate.vue')).toMatch(/Only this experiment keeps the description/)
    expect(source('app/dev/definitions/store.ts')).toMatch(/if \(import\.meta\.server\) return emptyShelf\(\)/)
  })
})
