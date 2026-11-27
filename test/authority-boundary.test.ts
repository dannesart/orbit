// Foundation integrity, closing the verified gaps: Apply, the preview and a run agree on the same
// configuration facts (exact resolution, workspace visibility, every dependency, the Feature version's
// own acceptance), each keeping its own outcome. Everything here is checked by behaviour: what Apply
// does, what the preview says, and what the boundary (invoke) actually does with what was applied.
import { describe, expect, it } from 'vitest'
import { type Data, type DefinitionRef, type DefinitionVersion, type Field, deepFreeze, refOf } from '../shared/features/definitions'
import { type MappingFeature, invoke, orbitConsoleV2, orbitTransformV1, orbitTransformV2, orbitTransformV3 } from '../shared/features/features'
import type { Expression, Mapping, MappingProperty } from '../shared/features/mappings'
import {
  type Configuration, type Offered, type TransformDraft, allDefinitions, applyConfiguration, assessApply, draftFrom, initialConfiguration, scopeOf,
} from '../app/dev/designer/config'
import { placeIn } from '../app/dev/definitions/designer'
import { toDraft } from '../app/dev/designer/parts'
import { previewOutput, exampleFrom } from '../app/dev/designer/preview'
import { readingOf } from '../app/dev/designer/reading'
import { A1, APPLICANT, B1, ELSEWHERE, PINS, WORKSPACE } from '../app/dev/features/experiment'
import { transformView } from '../app/dev/designer/view'
import { stepOf } from './apply'

const prop = (name: string): Expression => ({ kind: 'property', name })
const path = (...names: string[]): Expression => ({ kind: 'path', path: names })
const lit = (value: string | number): Expression => ({ kind: 'literal', value })
const version = (id: string, fields: Field[], workspaceId: string | null = WORKSPACE): DefinitionVersion => deepFreeze({ id, version: 1, name: `Sample ${id}`, workspaceId, fields })
const offer = (...definitions: DefinitionVersion[]): Offered[] => definitions.map((definition) => ({ definition, name: definition.name, source: 'workspace' }))
const draftOf = (config: Configuration, input: DefinitionRef, output: DefinitionRef | { local: Field[] }, properties: MappingProperty[]): TransformDraft => ({
  ...draftFrom(config),
  ...(refOf(input).id === A1.id ? {} : { input: refOf(input) }),
  ...('local' in output ? { use: 'local' as const, local: { name: 'Made here', fields: output.local } } : { use: 'catalogue' as const, catalogue: refOf(output) }),
  properties: toDraft(properties),
})
/** What the boundary does with the applied configuration, run in `workspaceId` exactly as the Designer runs it. */
function runApplied(config: Configuration, feature: MappingFeature, input: DefinitionRef, data: Data, workspaceId = WORKSPACE) {
  const catalog = placeIn({ definitions: allDefinitions(config), records: [], mappings: config.mappings }, workspaceId)
  return invoke(catalog, { workspaceId, feature, input: { definition: refOf(input), data }, mapping: config.mapping })
}
const APPLICANT_DATA = PINS.find((p) => p.key === 'applicant')!.example!
const OTHERS = 'Another workspace’s Definition A'
const THEIRS = { id: 'their-person-name', version: 1 }

describe('Apply and the run agree on references (gap 1: assessed applicable, then Apply threw)', () => {
  // Transform v3: the Transform's own output with Applicant's properties, a reference to Address included.
  const own: MappingProperty[] = [
    { name: 'firstName', source: prop('firstName') }, { name: 'lastName', source: prop('lastName') },
    { name: 'home', source: { kind: 'copy', from: ['home'] } },
  ]

  for (const workspaceId of [WORKSPACE, 'ws-acme']) {
    it(`applies a valid, resolvable reference in its own output, and the run accepts it (${workspaceId})`, () => {
      const start = initialConfiguration()
      const draft = draftOf(start, APPLICANT, { local: [...APPLICANT.fields] }, own)
      const result = applyConfiguration(start, draft, stepOf(start, orbitTransformV3, workspaceId))
      expect(result.assessment.problems).toEqual([])
      expect(result.applied).toBe(true)
      const made = result.config.locals.at(-1)!
      expect(made.fields.find((f) => f.name === 'home')).toEqual({ name: 'home', type: 'reference', definition: { id: 'address', version: 1 } })
      const ran = runApplied(result.config, orbitTransformV3, APPLICANT, APPLICANT_DATA, workspaceId)
      expect(ran.evidence.outcome).toEqual({ kind: 'succeeded' })
      expect(ran.evidence.output).toEqual({ definition: refOf(made) })
    })
  }

  it('refuses an unresolvable reference in its own output as unresolved: nothing thrown, nothing made', () => {
    const start = initialConfiguration()
    const fields: Field[] = [{ name: 'fullName', type: 'string' }, { name: 'where', type: 'reference', definition: { id: 'nowhere', version: 1 }, optional: true }]
    const draft = draftOf(start, A1, { local: fields }, [{ name: 'fullName', source: prop('firstName') }])
    let result!: ReturnType<typeof applyConfiguration>
    expect(() => { result = applyConfiguration(start, draft, stepOf(start, orbitTransformV3)) }).not.toThrow()
    expect(result.applied).toBe(false)
    expect(result.config).toBe(start)
    expect(result.assessment.state).toBe('unresolved')
    expect(result.assessment.problems.map((p) => [p.kind, p.category])).toEqual([['contract', 'unresolved']])
  })

  it('refuses a reference back to the output itself (a cycle) the same way', () => {
    const start = initialConfiguration()
    const draft = draftOf(start, A1, { local: [{ name: 'fullName', type: 'string' }, { name: 'again', type: 'reference', definition: { id: 'transform.output', version: 1 }, optional: true }] }, [{ name: 'fullName', source: prop('firstName') }])
    const result = applyConfiguration(start, draft, stepOf(start, orbitTransformV3))
    expect([result.applied, result.config === start, result.assessment.state]).toEqual([false, true, 'unresolved'])
  })
})

describe('The whole pinned contract, read or not (gap 2: unresolved contracts were applicable)', () => {
  // Made outside defineVersion (as persistence might hand one back): an optional reference nobody reads, to nothing.
  const dangling = version('dangling', [{ name: 'fullName', type: 'string' }, { name: 'extra', type: 'reference', definition: { id: 'missing', version: 1 }, optional: true }])

  it('as the output: unresolved, never a version; the run refuses the same contract (invalid_contract)', () => {
    const start = initialConfiguration(offer(dangling))
    const draft = draftOf(start, A1, dangling, [{ name: 'fullName', source: prop('firstName') }])
    const result = applyConfiguration(start, draft, stepOf(start, orbitTransformV3))
    expect([result.applied, result.config === start, result.assessment.state]).toEqual([false, true, 'unresolved'])
    expect(result.assessment.problems.every((p) => p.kind === 'contract')).toBe(true)
    // The boundary, given the same configuration as a hand-made Mapping, refuses it for the same reason.
    const forced: Configuration = { ...start, mappings: [...start.mappings, deepFreeze<Mapping>({ id: 'forced', version: 1, workspaceId: WORKSPACE, from: refOf(A1), to: refOf(dangling), properties: [{ name: 'fullName', source: prop('firstName') }] })], mapping: { id: 'forced', version: 1 } }
    expect(runApplied(forced, orbitTransformV3, A1, { firstName: 'Ada', lastName: 'Lovelace' }).evidence.outcome).toMatchObject({ kind: 'not_attempted', reason: 'invalid_contract' })
  })

  it('previewed: an illustration, never a result that fits, though the Definition itself resolves', () => {
    for (const feature of [orbitTransformV2, orbitTransformV3]) {
      const start = initialConfiguration(offer(dangling))
      const view = transformView(start, draftOf(start, A1, dangling, [{ name: 'fullName', source: prop('firstName') }]), stepOf(start, feature), JSON.stringify({ firstName: 'Ada', lastName: 'Lovelace' }))
      expect(view.assessment.target.kind).toBe('existing')
      expect([view.output.kind, view.output.fits], `v${feature.version}`).toEqual(['illustration', null])
      // What the source reads is still shown: the input resolves.
      expect(view.output.values).toEqual([{ value: 'Ada' }])
    }
  })

  it('as the input: unresolved too', () => {
    const reads = version('reads-dangling', [{ name: 'firstName', type: 'string' }, { name: 'extra', type: 'reference', definition: { id: 'missing', version: 1 }, optional: true }])
    const start = initialConfiguration(offer(reads))
    const result = applyConfiguration(start, draftOf(start, reads, B1, [{ name: 'fullName', source: prop('firstName') }]), stepOf(start, orbitTransformV3))
    expect([result.applied, result.assessment.state]).toEqual([false, 'unresolved'])
  })

  it('keeps an unresolved contract apart from an invalid Mapping', () => {
    const start = initialConfiguration(offer(dangling))
    const both = applyConfiguration(start, draftOf(start, A1, dangling, [{ name: 'fullName', source: prop('nobody') }]), stepOf(start, orbitTransformV3)).assessment
    expect(both.state).toBe('unresolved')
    expect(new Set(both.problems.map((p) => p.category))).toEqual(new Set(['unresolved', 'invalid']))
    const mappingOnly = assessApply(initialConfiguration(), draftOf(initialConfiguration(), A1, B1, [{ name: 'fullName', source: prop('nobody') }]), stepOf(initialConfiguration()))
    expect(mappingOnly.state).toBe('invalid')
  })
})

describe('Workspace visibility (gap 3: another workspace’s private Definitions)', () => {
  const words = (config: Configuration, draft: TransformDraft, workspaceId = WORKSPACE) => {
    const a = assessApply(config, draft, stepOf(config, orbitTransformV3, workspaceId))
    return { state: a.state, text: a.problems.map((p) => `${p.words} ${p.short}`).join(' ') }
  }

  it('reproduced directly: another workspace’s input is unresolved, exactly like one that doesn’t exist, and says nothing about it', () => {
    const start = initialConfiguration()
    const theirs = words(start, draftOf(start, THEIRS, B1, [{ name: 'fullName', source: prop('firstName') }]))
    const nobody = words(start, draftOf(start, { id: 'nobody', version: 1 }, B1, [{ name: 'fullName', source: prop('firstName') }]))
    expect(theirs).toEqual(nobody)
    expect(theirs.state).toBe('unresolved')
    expect(theirs.text).not.toContain(OTHERS)
    expect(theirs.text).not.toContain(ELSEWHERE)
    // The run agrees: a Mapping from it isn't found.
    const forced: Configuration = { ...start, mappings: [deepFreeze<Mapping>({ id: 'forced', version: 1, workspaceId: WORKSPACE, from: THEIRS, to: refOf(B1), properties: [{ name: 'fullName', source: prop('firstName') }] })], mapping: { id: 'forced', version: 1 } }
    expect(runApplied(forced, orbitTransformV2, THEIRS, { firstName: 'Ada', lastName: 'Lovelace' }).evidence.outcome).toEqual({ kind: 'not_attempted', reason: 'not_found' })
  })

  it('another workspace’s output is unresolved, never quietly replaced by another', () => {
    const start = initialConfiguration()
    const result = applyConfiguration(start, draftOf(start, A1, THEIRS, [{ name: 'firstName', source: prop('firstName') }, { name: 'lastName', source: prop('lastName') }]), stepOf(start))
    expect([result.applied, result.config === start, result.assessment.state]).toEqual([false, true, 'unresolved'])
    expect(result.assessment.problems.map((p) => p.words).join(' ')).not.toContain(OTHERS)
  })

  it('through a reference in the Transform’s own output: unresolved, without naming it', () => {
    const start = initialConfiguration()
    const result = words(start, draftOf(start, A1, { local: [{ name: 'fullName', type: 'string' }, { name: 'who', type: 'reference', definition: THEIRS, optional: true }] }, [{ name: 'fullName', source: prop('firstName') }]))
    expect(result.state).toBe('unresolved')
    expect(result.text).not.toContain(OTHERS)
  })

  it('transitively: a visible Definition that depends on another workspace’s is unresolved, on either side', () => {
    const bridge = version('bridge', [{ name: 'fullName', type: 'string' }, { name: 'who', type: 'reference', definition: THEIRS, optional: true }], 'ws-acme')
    const reads = version('reads-bridge', [{ name: 'firstName', type: 'string' }, { name: 'via', type: 'reference', definition: refOf(bridge), optional: true }], 'ws-acme')
    const start = initialConfiguration(offer(bridge, reads))
    const out = words(start, draftOf(start, A1, bridge, [{ name: 'fullName', source: prop('firstName') }]), 'ws-acme')
    const into = words(start, draftOf(start, reads, B1, [{ name: 'fullName', source: prop('firstName') }]), 'ws-acme')
    expect([out.state, into.state]).toEqual(['unresolved', 'unresolved'])
    expect(`${out.text} ${into.text}`).not.toContain(OTHERS)
  })

  it('a workspace’s own Definitions are used in that workspace, and nowhere else', () => {
    const acme = version('acme-name', [{ name: 'fullName', type: 'string' }], 'ws-acme')
    const start = initialConfiguration(offer(acme))
    const draft = draftOf(start, A1, acme, [{ name: 'fullName', source: prop('firstName') }])
    expect(assessApply(start, draft, stepOf(start, orbitTransformV2, 'ws-acme')).state).toBe('applicable')
    expect(assessApply(start, draft, stepOf(start, orbitTransformV2, WORKSPACE)).state).toBe('unresolved')
    expect(assessApply(start, draft, stepOf(start, orbitTransformV2, 'ws-other')).state).toBe('unresolved')
  })

  it('the configuration’s scope resolves exactly what the run’s resolver resolves', () => {
    const acme = version('acme-name', [{ name: 'fullName', type: 'string' }], 'ws-acme')
    const config = initialConfiguration(offer(acme))
    for (const workspaceId of [WORKSPACE, 'ws-acme', ELSEWHERE]) {
      const { resolve } = scopeOf(config, workspaceId)
      const catalog = placeIn({ definitions: allDefinitions(config), records: [], mappings: [] }, workspaceId)
      for (const d of allDefinitions(config)) {
        // A pass-through run of a Value of that Definition: not_found means exactly that it didn't resolve there.
        const outcome = invoke(catalog, { workspaceId, feature: orbitConsoleV2, input: { definition: refOf(d), data: {} } }).evidence.outcome
        const runFinds = !(outcome.kind === 'not_attempted' && outcome.reason === 'not_found')
        expect(resolve(d) !== null, `${d.id} in ${workspaceId}`).toBe(runFinds)
      }
    }
  })
})

describe('The preview says when it isn’t a result (gap 4: a refused Mapping previewed as fitting)', () => {
  const NICKED = version('nicked', [{ name: 'first', type: 'string' }, { name: 'nick', type: 'string', optional: true }])
  const NICK = version('nick', [{ name: 'nick', type: 'string' }])
  const resolve = (ref: DefinitionRef) => [NICKED, NICK].find((d) => d.id === ref.id) ?? null
  const example = exampleFrom(JSON.stringify({ first: 'Ada', nick: 'A' }), NICKED)

  for (const feature of [orbitTransformV2, orbitTransformV3]) {
    it(`a required output fed by an optional input: an illustration, with the refusal (v${feature.version})`, () => {
      const properties = [{ name: 'nick', source: prop('nick') }]
      const preview = previewOutput(properties, NICKED, NICK, example, readingOf(feature, resolve))
      expect(preview.kind).toBe('illustration')
      expect(preview.fits).toBeNull()
      expect(preview.refused.length).toBeGreaterThan(0)
      // Still useful: what the source reads from this example is shown.
      expect(preview.values).toEqual([{ value: 'A' }])
      // And the run does refuse it, before running.
      const start = initialConfiguration(offer(NICKED, NICK))
      const forced: Configuration = { ...start, mappings: [deepFreeze<Mapping>({ id: 'forced', version: 1, workspaceId: WORKSPACE, from: refOf(NICKED), to: refOf(NICK), properties })], mapping: { id: 'forced', version: 1 } }
      expect(runApplied(forced, feature, NICKED, { first: 'Ada', nick: 'A' }).evidence.outcome).toMatchObject({ kind: 'not_attempted', reason: 'invalid_mapping' })
    })
  }

  it('a Mapping the version accepts is a transformation, and only that says whether it fits', () => {
    const preview = previewOutput([{ name: 'nick', source: prop('first') }], NICKED, NICK, example, readingOf(orbitTransformV2, resolve))
    expect([preview.kind, preview.refused, preview.fits]).toEqual(['transformation', [], { issues: [] }])
  })
})

describe('Malformed sources are invalid; capabilities a version lacks are incompatible (gap 5)', () => {
  const start = initialConfiguration()
  const assess = (source: unknown, feature: MappingFeature) => assessApply(start, draftOf(start, APPLICANT, B1, [{ name: 'fullName', source: source as Expression }]), stepOf(start, feature))
  // Transform v2 refuses Applicant itself (unsupported contract); read A1 for the flat versions instead.
  const flat = (source: unknown, feature: MappingFeature) => assessApply(start, draftOf(start, A1, B1, [{ name: 'fullName', source: source as Expression }]), stepOf(start, feature))
  const categories = (a: ReturnType<typeof assessApply>) => a.problems.map((p) => p.category)

  it('a nested read, a construction and a copy are capabilities flat versions lack: incompatible', () => {
    for (const source of [path('contact', 'email'), { kind: 'construct', presence: { when: 'always' }, properties: [] }, { kind: 'copy', from: [] }]) {
      for (const feature of [orbitTransformV1, orbitTransformV2]) expect(categories(flat(source, feature)), JSON.stringify(source)).toContain('incompatible')
      for (const feature of [orbitTransformV1, orbitTransformV2]) expect(categories(flat(source, feature))).not.toContain('invalid')
    }
  })

  it('anything malformed or unknown is invalid, for every version, wherever it is', () => {
    const malformed: unknown[] = [
      { kind: 'path', path: 'contact.email' }, { kind: 'path', path: ['contact'] }, { kind: 'regex', pattern: '.*' }, { kind: 'property' }, null, 'firstName',
      { kind: 'call', fn: 'trim', args: [{ kind: 'nonsense' }] }, { kind: 'copy', from: null },
    ]
    for (const source of malformed) {
      for (const feature of [orbitTransformV1, orbitTransformV2]) expect(flat(source, feature).state, `${JSON.stringify(source)} v${feature.version}`).toBe('invalid')
      expect(assess(source, orbitTransformV3).state, `${JSON.stringify(source)} v3`).toBe('invalid')
    }
  })

  it('published behaviour is unchanged: flat versions refuse both kinds exactly as before (unsupported_source)', () => {
    const data = { firstName: 'Ada', lastName: 'Lovelace' }
    for (const source of [path('contact', 'email'), { kind: 'regex' }, { kind: 'path', path: 'x' }]) {
      const forced: Configuration = { ...start, mappings: [deepFreeze<Mapping>({ id: 'forced', version: 1, workspaceId: WORKSPACE, from: refOf(A1), to: refOf(B1), properties: [{ name: 'fullName', source: source as Expression }] })], mapping: { id: 'forced', version: 1 } }
      for (const feature of [orbitTransformV1, orbitTransformV2]) {
        expect(runApplied(forced, feature, A1, data).evidence.outcome).toEqual({ kind: 'not_attempted', reason: 'invalid_mapping', issues: [{ problem: 'unsupported_source', path: ['fullName'] }] })
      }
    }
  })
})

describe('Nested reads inside an expression’s list', () => {
  const start = initialConfiguration()
  const joined = (item: unknown): Expression => ({ kind: 'call', fn: 'join', args: [{ kind: 'list', items: [prop('firstName'), item as Expression] }, lit(' ')] })
  const assess = (item: unknown, feature: MappingFeature) => assessApply(start, draftOf(start, A1, B1, [{ name: 'fullName', source: joined(item) }]), stepOf(start, feature))

  it('a well-formed nested read in a list is a capability flat versions lack: incompatible', () => {
    for (const feature of [orbitTransformV1, orbitTransformV2]) {
      const a = assess(path('contact', 'email'), feature)
      expect([a.state, a.problems.map((p) => p.category)], `v${feature.version}`).toEqual(['incompatible', ['incompatible']])
    }
  })

  it('a malformed one in a list is invalid, for every version', () => {
    for (const feature of [orbitTransformV1, orbitTransformV2, orbitTransformV3]) expect(assess({ kind: 'path', path: 'contact.email' }, feature).state, `v${feature.version}`).toBe('invalid')
  })
})

describe('The Transform’s own output: one problem per naming fact', () => {
  const start = initialConfiguration()
  const structure = (names: string[]) => assessApply(start, draftOf(start, A1, { local: names.map((name) => ({ name, type: 'string' as const })) }, []), stepOf(start, orbitTransformV3)).problems.filter((p) => p.kind === 'structure')

  it('keeps separate facts of the same kind separate', () => {
    expect(structure(['a', 'a', 'b', 'b'])).toHaveLength(2)
    expect(structure(['Email', 'email', 'Name', 'name'])).toHaveLength(2)
  })

  it('and one fact one problem, however many names it’s about', () => {
    expect(structure([' a', 'b ', 'c'])).toHaveLength(1)
    expect(structure(['a', 'a', 'a'])).toHaveLength(1)
  })
})

describe('A Mapping identity already taken by other contracts', () => {
  it('is refused, never revised into a Mapping between other contracts (identities spelled to collide)', () => {
    // A hand-made Definition id spelling another pair: from Definition A to "x@1->full-name" · v1 is transform:x@1->full-name@1,
    // the identity of the Mapping from x · v1 to Definition B · v1.
    const x = version('x', [{ name: 'firstName', type: 'string' }])
    const start = initialConfiguration(offer(x))
    const first = applyConfiguration(start, draftOf(start, x, B1, [{ name: 'fullName', source: prop('firstName') }]), stepOf(start))
    expect(first.applied).toBe(true)
    const colliding = version('x@1->full-name', [{ name: 'label', type: 'string' }])
    const withIt: Configuration = { ...first.config, offered: [...(first.config.offered ?? []), ...offer(colliding)] }
    const second = applyConfiguration(withIt, { ...draftOf(withIt, A1, colliding, [{ name: 'label', source: prop('firstName') }]), input: undefined }, stepOf(withIt))
    expect(second.assessment.plan.mapping.id).toBe(first.config.mapping.id)
    expect([second.applied, second.config === withIt, second.assessment.state]).toEqual([false, true, 'invalid'])
  })
})
