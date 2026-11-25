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
import { placeOf, workspacePlaces } from '../app/utils/workspaceNav'
import { experimentPlaces } from '../app/dev/workspace/place'
import { COLORS, DEFAULT_APPEARANCE, ICON_NAMES, checkAppearance } from '../app/dev/definitions/appearance'
import { validate } from '../shared/features/definitions'

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
      'full name is missing, and it’s required.',
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

  it('starts as the Definition icon in pink, from a curated set of about two dozen icons and eight colours', () => {
    expect(person().appearance).toEqual({ icon: 'definition', color: 'pink' })
    expect(DEFAULT_APPEARANCE).toEqual({ icon: 'definition', color: 'pink' })
    expect(ICON_NAMES.length).toBeGreaterThanOrEqual(22)
    expect(ICON_NAMES.length).toBeLessThanOrEqual(26)
    expect([...COLORS]).toEqual(['pink', 'purple', 'blue', 'cyan', 'green', 'yellow', 'orange', 'slate'])
    expect(() => checkAppearance({ icon: 'rocket' as never, color: 'pink' })).toThrow()
    expect(() => checkAppearance({ icon: 'person', color: 'teal' as never })).toThrow()
  })

  it('changes appearance without a version, a new identity or anything a version says', () => {
    const made = addVersion(person(), updateField(addField(draftFrom(person().versions[0]!)), 2, { name: 'email' }))
    const next = renamed(made, { name: made.name, description: made.description, appearance: { icon: 'person', color: 'blue' } })
    expect(next.appearance).toEqual({ icon: 'person', color: 'blue' })
    expect(next.id).toBe(made.id)
    expect(next.versions).toBe(made.versions) // the very same, frozen versions: none added, none copied
    for (const v of next.versions) expect(Object.keys(v).sort()).toEqual(['fields', 'id', 'name', 'version', 'workspaceId'])
    // What a version accepts is unchanged.
    const data = { 'full name': 'Ada', subscribed: true, email: 'ada@example.com' }
    expect(validate(next.versions[1]!, data)).toEqual(validate(made.versions[1]!, data))
    // The next version still follows on from the last, exactly as before.
    expect(addVersion(next, updateField(addField(draftFrom(next.versions[1]!)), 3, { name: 'phone' })).versions).toHaveLength(3)
    // Left out, appearance stays as it was (a rename alone never resets it).
    expect(renamed(next, { name: 'Contact', description: '' }).appearance).toEqual({ icon: 'person', color: 'blue' })
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

  it('is unaffected by appearance: the same versions offered, the same run, the same evidence', () => {
    const restyled = renamed(v2, { name: v2.name, description: v2.description, appearance: { icon: 'receipt', color: 'orange' } })
    const before = offeredIn(acme, [v2])
    const after = offeredIn(acme, [restyled])
    expect(after.map((o) => o.definition)).toEqual(before.map((o) => o.definition))
    const runOf = (made: typeof v2) => run(use(initialConfiguration(offeredIn(acme, [made])), { id: v1.id, version: 1 }, [fullName, subscribed]), 'ws-acme')
    const [, a] = runOf(v2)
    const [, b] = runOf(restyled)
    expect(b!.evidence).toEqual(a!.evidence)
    expect(b!.output).toEqual(a!.output)
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
    // Applied regardless (applyConfiguration allows it; the Designer's Apply doesn't): the boundary refuses the output.
    const config = use(start, { id: v1.id, version: 2 }, [fullName, subscribed])
    const [, transform, out] = run(config, 'ws-acme')
    expect(transform!.evidence.outcome).toEqual({ kind: 'failed', reason: 'invalid_output', issues: [{ problem: 'missing', path: ['email'], expected: 'string' }] })
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

  it('is its own place in the navigation, after Workflows, and only behind the flag', () => {
    const extra = experimentPlaces('ws-acme')
    expect(workspacePlaces('ws-acme', true, extra).map((p) => [p.key, p.label, p.to])).toEqual([
      ['home', 'Home', '/w/ws-acme'],
      ['workflows', 'Workflows', '/w/ws-acme/workflows'],
      ['definitions', 'Definitions', '/w/ws-acme/definitions'],
      ['people', 'People', '/w/ws-acme/people'],
      ['settings', 'Settings', '/w/ws-acme/settings'],
    ])
    // Shown as itself, whatever Definition or version is open; never as Workflows.
    expect(placeOf('/w/ws-acme/definitions', 'ws-acme', extra)).toBe('definitions')
    expect(placeOf('/w/ws-acme/definitions?d=x&v=2', 'ws-acme', extra)).toBe('definitions')
    expect(placeOf('/w/ws-acme/definitions?new', 'ws-acme', extra)).toBe('definitions')
    expect(placeOf('/w/ws-acme/workflows', 'ws-acme', extra)).toBe('workflows')
    // Without the experiments (production), neither exists.
    expect(placeOf('/w/ws-acme/definitions', 'ws-acme')).toBe('home')
    expect(source('app/utils/workspaceNav.ts')).not.toMatch(/definitions/i)
  })

  it('is no longer offered from inside the Workflows place: it isn’t part of it', () => {
    const workflows = source('app/dev/workspace/WorkflowsPlace.vue')
    expect(workflows.slice(workflows.indexOf('<template>'))).not.toMatch(/definitions/i)
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
    expect(place).toMatch(/Orbit’s are samples that exist only in this preview/)
    expect(source('app/dev/definitions/DefinitionEditor.vue')).toMatch(/Only this experiment keeps the description and appearance/)
    expect(source('app/dev/definitions/store.ts')).toMatch(/if \(import\.meta\.server\) return emptyShelf\(\)/)
  })
})

describe('The Definitions Studio: a catalogue, an inspector, and editing on purpose', () => {
  const place = source('app/dev/definitions/DefinitionsPlace.vue')
  const inspector = source('app/dev/definitions/DefinitionInspector.vue')
  const editor = source('app/dev/definitions/DefinitionEditor.vue')
  const cards = (group: string) => {
    const from = place.indexOf(`id="${group}"`)
    return place.slice(from, place.indexOf('</section>', from))
  }

  it('shows each Definition as a compact card: icon, name, latest version and property count, nothing more', () => {
    for (const group of ['own-heading', 'orbit-heading']) {
      const markup = cards(group)
      expect(markup).toMatch(/<DefinitionTile :appearance="(d\.appearance|null)" \/>/)
      expect(markup).toMatch(/Version \{\{ d\.versions?(\.length)? \}\} · \{\{ count\(/)
      expect(markup, group).not.toMatch(/description|DESCRIPTIONS|fields\.map|versions\.map/i)
    }
    // The workspace's own in the colour chosen for each; Orbit's in slate with a lock, read-only.
    expect(cards('own-heading')).toContain('<DefinitionTile :appearance="d.appearance" />')
    expect(cards('orbit-heading')).toMatch(/<DefinitionTile :appearance="null" \/>[\s\S]*name="lock"[\s\S]*, read-only/)
    expect(source('app/dev/definitions/DefinitionTile.vue')).toContain("props.appearance ? COLOR_STYLES[props.appearance.color].tile : 'bg-slate-100 text-slate-500'")
  })

  it('opens a Definition in the inspector at its own address, and closes back to the catalogue', () => {
    expect(place).toContain("const open = (id: string) => ({ query: { d: id } })")
    expect(place).toMatch(/<DefinitionInspector v-if="inspecting"[^>]*:version="version"/)
    expect(place).toMatch(/if \(back === route\.path\) router\.back\(\)\s*else navigateTo\(\{ query: \{\} \}, \{ replace: true \}\)/)
    expect(inspector).toMatch(/@keydown\.escape="emit\('close'\)"/)
  })

  it('edits nothing in the inspector: a new version and a new name each open their own view', () => {
    expect(inspector).not.toMatch(/<input|<textarea|ModelBuilder|redescribe|versionFromDraft/)
    expect(inspector).toContain("navigateTo({ query: { d: props.id, next: null } })")
    expect(inspector).toContain(":to=\"{ query: { d: id, about: null } }\"")
    // Only for Definitions made here: Orbit's are read-only.
    expect(inspector).toMatch(/<NuxtLink v-if="made" :to="\{ query: \{ d: id, about: null \} \}"/)
    expect(inspector).toMatch(/<button\s+v-if="made"[\s\S]*@click="newVersion"/)
    expect(editor).toMatch(/<section v-if="part !== 'new' && !made"[\s\S]*Definitions provided by Orbit are read-only/)
  })

  it('leaves an editor by replacing it, so Back never lands on one that has finished', () => {
    expect(editor).toMatch(/const leave = [^\n]*\n  finished = true\n  return navigateTo\(\{ query \}, \{ replace: true \}\)/)
    const act = editor.slice(editor.indexOf('function act()'), editor.indexOf('// --- Something to lose?'))
    expect(act).toContain('navigateTo({ query: { d: id } }, { replace: true })')
    expect(act.match(/leave\(/g)).toHaveLength(2)
    expect(editor.slice(editor.indexOf('async function cancel()'), editor.indexOf('// Name and appearance are held'))).toMatch(/leave\(/)
  })

  it('is one editor in segments, moved between freely: General, Model and Preview', () => {
    expect(editor).toContain("const SEGMENTS: Record<Part, Segment[]> = { new: ['general', 'model', 'preview'], next: ['model', 'preview'], about: ['general'] }")
    expect(editor).toMatch(/role="tablist"[\s\S]*role="tab"[\s\S]*:aria-selected="segment === s"[\s\S]*@click="segment = s"/)
    // No wizard: nothing stops you choosing any segment, and the draft is the shelf's, not a segment's.
    expect(editor).not.toMatch(/disabled[^\n]*segment|segment[^\n]*disabled|Next step/i)
    expect(editor).toContain("const creating = ref<NewDefinition | null>(props.part === 'new' ? startCreating(props.workspace.id) : null)")
    expect(editor).toContain('watch(creating, (next) => next && setCreating(props.workspace.id, next))')
  })

  it('keeps the name, icon and draft in view, and the one action in every segment', () => {
    const header = editor.slice(editor.indexOf("<!-- What's being edited: always in view -->"), editor.indexOf('id="segment-panel"'))
    expect(header).toMatch(/<DefinitionTile :appearance="appearance"[\s\S]*\{\{ name \|\| 'New Definition' \}\}[\s\S]*\{\{ context \}\}/)
    expect(header).toContain('data-back')
    const footer = editor.slice(editor.indexOf('<!-- The one action, in every segment -->'))
    expect(footer).toMatch(/data-editor-action @click="act">\{\{ action \}\}/)
    expect(footer).toContain('@click="cancel"')
    // Preview is optional: nothing about creating depends on it.
    const problems = editor.slice(editor.indexOf('const problems = computed'), editor.indexOf('const tried'))
    expect(problems).not.toMatch(/preview|example/i)
  })

  it('asks before losing real work, with Orbit’s confirmation, and never for an untouched draft', () => {
    expect(editor).toContain("import LeaveDialog from '../designer/LeaveDialog.vue'")
    expect(editor).toMatch(/async function cancel\(\) \{\n  if \(losing\.value\.length && !\(await ask\(losing\.value\)\)\) return/)
    expect(editor).toMatch(/return untouched \? \[\] :/)
    expect(editor).toContain('onBeforeRouteLeave(guard)')
  })

  it('offers an invitation to make the first Definition when there are none', () => {
    expect(place).toMatch(/<ul v-else :class="grid">[\s\S]*data-first-definition[\s\S]*Create \{\{ ws\.name \}\}’s first Definition/)
    expect(place).not.toContain('Nothing is made in')
  })
})

describe('The model builder: a palette, compact rows, and editing in place', () => {
  const builder = source('app/dev/definitions/ModelBuilder.vue')
  const rows = builder.slice(builder.indexOf('<!-- The model -->'))

  it('adds a type by click or by drag, with one result: a required property whose name has focus', () => {
    expect(builder).toMatch(/@click="add\(t\)"\s*@dragstart="startType\(\$event, t\)"/)
    expect(builder).toMatch(/if \(type && TYPES\.includes\(type\)\) add\(type, index\)/)
    const add = builder.slice(builder.indexOf('function add('), builder.indexOf('function remove('))
    expect(add).toContain('addField(props.draft, type)')
    expect(add).toContain('nextTick(() => nameInput(key)?.focus())')
    expect(addField(blankDraft(), 'number').fields.at(-1)).toMatchObject({ type: 'number', optional: false })
  })

  it('shows each property as a row: type icon, name, type, required or optional, and a chevron; the row opens its editor', () => {
    const row = rows.slice(rows.indexOf('data-row-toggle'), rows.indexOf('<!-- The row\'s own editor -->'))
    expect(row).toMatch(/:aria-expanded="open === f\.key"[\s\S]*@click="toggle\(f\.key\)"/)
    expect(row).toMatch(/<DefinitionsIcon :name="f\.type"[\s\S]*f\.name\.trim\(\) \|\| 'unnamed'[\s\S]*typeWords\[f\.type\][\s\S]*'Optional' : 'Required'[\s\S]*name="chevron"/)
    // No type selector, requiredness switch or remove button on a closed row.
    expect(row).not.toMatch(/type="radio"|Remove/)
    const editor = rows.slice(rows.indexOf('<!-- The row\'s own editor -->'))
    expect(editor).toMatch(/v-if="open === f\.key"/)
    expect(editor).toMatch(/updateField\(draft, f\.key, \{ name:[\s\S]*updateField\(draft, f\.key, \{ type: t \}\)[\s\S]*updateField\(draft, f\.key, \{ optional: o \}\)[\s\S]*@click="remove\(f\.key\)"/)
  })

  it('reorders with a handle (drag or arrow keys) or Move up and down, never by accident changing the contract', () => {
    expect(builder).toMatch(/data-handle\s+draggable="true"[\s\S]*@dragstart="startRow\(\$event, f\.key\)"[\s\S]*@keydown="handleKey\(\$event, f\.key\)"/)
    expect(builder).toMatch(/if \(event\.key === 'ArrowUp'\) \{ event\.preventDefault\(\); move\(key, -1, 'handle'\) \}/)
    expect(builder).toMatch(/data-move="up"[\s\S]*data-move="down"/)
    // Order is presentation: a reordered draft is the same version (test/optional-properties.test.ts).
    expect(builder).toContain('moveField(props.draft, key, index > from ? index - 1 : index)')
  })

  it('never needs dragging: the palette is buttons, and a drop target is always shown', () => {
    expect(builder).toMatch(/<button\s+type="button"\s+draggable="true"\s+:data-add-type="t"/)
    expect(builder).toContain("'Drag a type here, or choose one, to add the first property'")
  })
})
