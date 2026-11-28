// Experiment #9, Phase 2: reusable Definitions. A property may reference another published
// Definition version, pinned exactly. These test the domain itself (shared/features): resolution,
// ownership, validation across reference boundaries, equality, cycles, depth, immutability, and what
// existing Feature versions do with Definitions that contain references.
import { describe, expect, it } from 'vitest'
import {
  type DefinitionRef, type DefinitionVersion, type Field, type Resolve, MAX_OBJECT_LEVELS,
  checkContract, checkFields, defineVersion, refOf, referencePaths, sameDefinition, sameFields, validate,
} from '../shared/features/definitions'
import { type Feature, type InvocationResult, contractCompatibility, invoke, orbitConsole, orbitTransformV1, orbitTransformV2 } from '../shared/features/features'
import type { Mapping } from '../shared/features/mappings'
import { DEFINITIONS, describeDefinitionIssue, describeOutcome, outcomeIssues } from '../app/dev/features/experiment'
import { REALISTIC_DEFINITIONS } from '../app/dev/features/realistic'
import { ORBIT_PROVIDED, draftFrom, fieldsOf } from '../app/dev/definitions/model'

const W = 'ws-a'
const OTHER = 'ws-b'
const text = (name: string, optional = false): Field => (optional ? { name, type: 'string', optional: true } : { name, type: 'string' })
const object = (name: string, fields: Field[], optional = false): Field => (optional ? { name, type: 'object', optional: true, fields } : { name, type: 'object', fields })
const ref = (name: string, to: DefinitionRef, optional = false): Field => {
  const definition = { id: to.id, version: to.version }
  return optional ? { name, type: 'reference', optional: true, definition } : { name, type: 'reference', definition }
}
/** An exact resolver over these versions: what the boundary or a version store supplies. */
const resolverOf = (...versions: DefinitionVersion[]): Resolve => (r) => versions.find((v) => sameDefinition(v, r)) ?? null
const make = (id: string, version: number, workspaceId: string | null, fields: Field[], resolve?: Resolve) =>
  defineVersion({ id, version, name: id, workspaceId, fields }, resolve)

const CANDIDATE_1 = make('candidate', 1, W, [text('firstName'), text('lastName'), text('email')])
const CANDIDATE_2 = make('candidate', 2, W, [text('firstName'), text('lastName'), text('email'), text('phone', true)])
const LOOKALIKE = make('candidate-copy', 1, W, [text('firstName'), text('lastName'), text('email')])
const THEIRS = make('their-candidate', 1, OTHER, [text('firstName'), text('lastName'), text('email')])
const POSTAL = ORBIT_PROVIDED.find((d) => d.id === 'orbit.postal-address')!
const ALL = resolverOf(CANDIDATE_1, CANDIDATE_2, LOOKALIKE, THEIRS, POSTAL)
const PROCESS_1 = make('process', 1, W, [text('name'), ref('candidate', CANDIDATE_1)], ALL)
const ADA = { firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com' }
const problems = (fields: Field[], owner: string | null = W, resolve: Resolve = ALL) => checkFields(fields, { owner, resolve }).map((i) => i.problem)

describe('Making a version with references', () => {
  it('references a workspace’s own published version and Orbit-provided ones', () => {
    const v = make('process', 1, W, [text('name'), ref('candidate', CANDIDATE_1), ref('address', POSTAL, true)], ALL)
    expect(v.fields).toEqual([
      { name: 'name', type: 'string' },
      { name: 'candidate', type: 'reference', definition: { id: 'candidate', version: 1 } },
      { name: 'address', type: 'reference', optional: true, definition: { id: 'orbit.postal-address', version: 1 } },
    ])
  })

  it('keeps only the exact identity: nothing of the referenced version is copied in', () => {
    expect(JSON.stringify(PROCESS_1)).not.toMatch(/firstName|email/)
    expect(Object.keys(PROCESS_1.fields[1]!)).toEqual(['name', 'type', 'definition'])
  })

  it('can’t be made without a resolver: no reference resolves by itself', () => {
    expect(() => make('process', 1, W, [ref('candidate', CANDIDATE_1)])).toThrow(/unresolved_reference at candidate/)
  })

  it('resolves through whatever resolver it is given, asking only for exact identities', () => {
    const asked: DefinitionRef[] = []
    const spy: Resolve = (r) => { asked.push(r); return ALL(r) }
    make('process', 1, W, [ref('a', CANDIDATE_1), ref('b', POSTAL)], spy)
    expect(asked).toEqual([{ id: 'candidate', version: 1 }, { id: 'orbit.postal-address', version: 1 }])
  })
})

describe('Ownership', () => {
  it('refuses another workspace’s versions, even when the resolver could find them', () => {
    expect(checkFields([ref('candidate', THEIRS)], { owner: W, resolve: ALL })).toEqual([{ problem: 'unavailable_reference', path: ['candidate'], definition: { id: 'their-candidate', version: 1 } }])
    expect(() => make('process', 1, W, [ref('candidate', THEIRS)], ALL)).toThrow(/unavailable_reference/)
  })

  it('never lets Orbit-provided versions depend on a workspace’s', () => {
    expect(problems([ref('candidate', CANDIDATE_1)], null)).toEqual(['unavailable_reference'])
    expect(problems([ref('address', POSTAL)], null)).toEqual([])
    expect(ORBIT_PROVIDED.every((d) => referencePaths(d.fields).length === 0)).toBe(true)
  })

  it('judges each step by the referencing version’s owner, so no chain reaches another workspace', () => {
    // A forged Orbit-provided version that depends on workspace data (defineVersion would refuse it).
    const forgedOrbit = { id: 'orbit.forged', version: 1, name: 'Forged', workspaceId: null, fields: [ref('theirs', THEIRS)] } as DefinitionVersion
    const issues = checkFields([ref('o', forgedOrbit)], { owner: W, resolve: resolverOf(forgedOrbit, THEIRS) })
    expect(issues).toEqual([{ problem: 'unavailable_reference', path: ['o', 'theirs'], definition: { id: 'their-candidate', version: 1 } }])
  })
})

describe('Exact resolution, never a fallback', () => {
  it('refuses missing identities and missing versions alike', () => {
    expect(checkFields([ref('c', { id: 'nobody', version: 1 })], { owner: W, resolve: ALL })).toEqual([{ problem: 'unresolved_reference', path: ['c'], definition: { id: 'nobody', version: 1 } }])
    expect(problems([ref('c', { id: 'candidate', version: 3 })])).toEqual(['unresolved_reference'])
  })

  it('treats a resolver that answers with another version (a "latest" alias) as not resolving', () => {
    const latest: Resolve = (r) => (r.id === 'candidate' ? CANDIDATE_2 : null)
    expect(problems([ref('c', CANDIDATE_1)], W, latest)).toEqual(['unresolved_reference'])
    const lookalike: Resolve = () => LOOKALIKE
    expect(problems([ref('c', CANDIDATE_1)], W, lookalike)).toEqual(['unresolved_reference'])
  })

  it('validates against exactly the version referenced', () => {
    expect(validate(PROCESS_1, { name: 'Hire', candidate: ADA }, ALL)).toEqual([])
    expect(validate(PROCESS_1, { name: 'Hire', candidate: { ...ADA, phone: '1' } }, ALL)).toEqual([{ problem: 'unexpected', path: ['candidate', 'phone'] }])
  })

  it('refuses to validate against a contract that doesn’t resolve, rather than guessing', () => {
    expect(() => validate(PROCESS_1, { name: 'Hire', candidate: ADA })).toThrow(/doesn’t resolve here/)
    expect(() => validate(PROCESS_1, { name: 'Hire', candidate: ADA }, resolverOf(CANDIDATE_2))).toThrow(/unresolved_reference/)
  })
})

describe('Versions stay pinned', () => {
  it('a newer referenced version changes nothing in an earlier referencing version', () => {
    const before = JSON.stringify(PROCESS_1)
    const CANDIDATE_3 = make('candidate', 3, W, [text('fullName')])
    const all = resolverOf(CANDIDATE_1, CANDIDATE_2, CANDIDATE_3)
    expect(JSON.stringify(PROCESS_1)).toBe(before)
    expect(validate(PROCESS_1, { name: 'Hire', candidate: ADA }, all)).toEqual([])
    expect(validate(PROCESS_1, { name: 'Hire', candidate: { fullName: 'Ada' } }, all).map((i) => i.problem)).toEqual(['missing', 'missing', 'missing', 'unexpected'])
  })

  it('changing the referenced version is a different contract', () => {
    const toV2 = make('process', 2, W, [text('name'), ref('candidate', CANDIDATE_2)], ALL)
    expect(sameFields(PROCESS_1.fields, toV2.fields)).toBe(false)
    expect(sameFields(PROCESS_1.fields, [ref('candidate', CANDIDATE_1), text('name')])).toBe(true)
    expect(sameFields(PROCESS_1.fields, [text('name'), ref('candidate', CANDIDATE_1, true)])).toBe(false)
  })

  it('structurally identical Definitions with different identities are different references', () => {
    expect(sameFields(CANDIDATE_1.fields, LOOKALIKE.fields)).toBe(true)
    expect(sameFields([ref('c', CANDIDATE_1)], [ref('c', LOOKALIKE)])).toBe(false)
  })

  it('a local object is never the same contract as a reference, however alike', () => {
    expect(sameFields([object('candidate', [...CANDIDATE_1.fields])], [ref('candidate', CANDIDATE_1)])).toBe(false)
  })

  it('names and appearance are not identity: a reference carrying more than { id, version } is refused', () => {
    expect(problems([{ name: 'c', type: 'reference', definition: { id: 'candidate', version: 1, name: 'Candidate' } } as never])).toEqual(['malformed'])
    expect(problems([{ name: 'c', type: 'reference', definition: CANDIDATE_1 } as never])).toEqual(['malformed'])
  })

  it('is frozen all the way down, and a private copy of what it was made from', () => {
    const target = { id: 'candidate', version: 1 }
    const v = make('process', 9, W, [{ name: 'c', type: 'reference', definition: target }], ALL)
    target.version = 2
    expect((v.fields[0] as { definition: DefinitionRef }).definition).toEqual({ id: 'candidate', version: 1 })
    expect(Object.isFrozen(v.fields[0]) && Object.isFrozen((v.fields[0] as { definition: object }).definition)).toBe(true)
    expect(() => { ((v.fields[0] as { definition: { version: number } }).definition).version = 2 }).toThrow(TypeError)
  })
})

describe('Validation across reference boundaries, with the one validator', () => {
  const PROCESS = make('process', 3, W, [text('name'), ref('candidate', CANDIDATE_1), ref('backup', CANDIDATE_1, true)], ALL)

  it('a required reference must be there; an absent optional one requires nothing', () => {
    expect(validate(PROCESS, { name: 'Hire', candidate: ADA }, ALL)).toEqual([])
    expect(validate(PROCESS, { name: 'Hire' }, ALL)).toEqual([{ problem: 'missing', path: ['candidate'], expected: 'object' }])
  })

  it('a present optional reference must satisfy the exact referenced contract', () => {
    expect(validate(PROCESS, { name: 'Hire', candidate: ADA, backup: { firstName: 'Grace' } }, ALL)).toEqual([
      { problem: 'missing', path: ['backup', 'lastName'], expected: 'string' },
      { problem: 'missing', path: ['backup', 'email'], expected: 'string' },
    ])
  })

  it('never takes null for absence, on either side of the boundary', () => {
    expect(validate(PROCESS, { name: 'Hire', candidate: ADA, backup: null }, ALL)).toEqual([{ problem: 'wrong_type', path: ['backup'], expected: 'object', actual: 'null' }])
    expect(validate(PROCESS, { name: 'Hire', candidate: { ...ADA, email: null } }, ALL)).toEqual([{ problem: 'wrong_type', path: ['candidate', 'email'], expected: 'string', actual: 'null' }])
  })

  it('keeps exact paths across the boundary, and refuses unexpected properties inside it', () => {
    expect(validate(PROCESS, { name: 'Hire', candidate: { firstName: 'Ada', lastName: 1, email: 'a', fax: '2' } }, ALL)).toEqual([
      { problem: 'wrong_type', path: ['candidate', 'lastName'], expected: 'string', actual: 'number' },
      { problem: 'unexpected', path: ['candidate', 'fax'] },
    ])
    expect(validate(PROCESS, { name: 'Hire', candidate: 'Ada' }, ALL)).toEqual([{ problem: 'wrong_type', path: ['candidate'], expected: 'object', actual: 'string' }])
  })

  it('locates problems separately for several properties referencing the same version', () => {
    expect(validate(PROCESS, { name: 'Hire', candidate: { ...ADA, email: 1 }, backup: { ...ADA, email: 2 } }, ALL)).toEqual([
      { problem: 'wrong_type', path: ['candidate', 'email'], expected: 'string', actual: 'number' },
      { problem: 'wrong_type', path: ['backup', 'email'], expected: 'string', actual: 'number' },
    ])
  })

  it('mixes local objects and references, either inside the other', () => {
    const PROFILE = make('profile', 1, W, [object('contact', [text('email'), text('phone', true)])])
    const resolve = resolverOf(CANDIDATE_1, PROFILE)
    const MIXED = make('mixed', 1, W, [object('meta', [ref('owner', PROFILE)]), ref('candidate', CANDIDATE_1)], resolve)
    expect(validate(MIXED, { meta: { owner: { contact: { email: 'a' } } }, candidate: ADA }, resolve)).toEqual([])
    expect(validate(MIXED, { meta: { owner: { contact: { phone: '1', x: 2 } } }, candidate: ADA }, resolve)).toEqual([
      { problem: 'missing', path: ['meta', 'owner', 'contact', 'email'], expected: 'string' },
      { problem: 'unexpected', path: ['meta', 'owner', 'contact', 'x'] },
    ])
  })

  it('references Definitions that themselves contain references', () => {
    const TEAM = make('team', 1, W, [ref('lead', CANDIDATE_1), ref('office', POSTAL)], ALL)
    const resolve = resolverOf(CANDIDATE_1, POSTAL, TEAM)
    const ORG = make('org', 1, W, [ref('team', TEAM)], resolve)
    expect(validate(ORG, { team: { lead: ADA, office: { street: 's', postcode: 'p' } } }, resolve)).toEqual([
      { problem: 'missing', path: ['team', 'office', 'city'], expected: 'string' },
    ])
  })
})

describe('Cycles and malformed graphs', () => {
  it('allows a version to reference an earlier version of its own Definition: a different, finite contract', () => {
    const resolve = resolverOf(PROCESS_1, CANDIDATE_1)
    const PROCESS_2 = make('process', 2, W, [text('name'), ref('previous', PROCESS_1, true)], resolve)
    expect(validate(PROCESS_2, { name: 'Hire again', previous: { name: 'Hire', candidate: ADA } }, resolve)).toEqual([])
  })

  it('allows identity-level loops between exact versions that end (A v2 → B v1 → A v1)', () => {
    const A1 = make('a', 1, W, [text('x')])
    const B1 = make('b', 1, W, [ref('a', A1)], resolverOf(A1))
    const A2 = make('a', 2, W, [ref('b', B1)], resolverOf(A1, B1))
    expect(validate(A2, { b: { a: { x: '1' } } }, resolverOf(A1, B1))).toEqual([])
  })

  it('refuses an exact-version cycle, however it got into the catalog', () => {
    // Only a forged catalog can hold one: a version can only reference versions that resolve when it is made.
    const A = { id: 'a', version: 1, name: 'A', workspaceId: W, fields: [ref('b', { id: 'b', version: 1 })] } as DefinitionVersion
    const B = { id: 'b', version: 1, name: 'B', workspaceId: W, fields: [ref('a', { id: 'a', version: 1 })] } as DefinitionVersion
    const resolve = resolverOf(A, B)
    expect(checkContract(A, resolve)).toEqual([{ problem: 'cyclic_reference', path: ['b', 'a'], definition: { id: 'a', version: 1 } }])
    // Validation is still bounded: it ends where the data ends, and refuses to go past 16 levels.
    expect(validate(A, { b: { a: { b: {} } } }, resolve)).toEqual([{ problem: 'missing', path: ['b', 'a', 'b', 'a'], expected: 'object' }])
    let endless: Record<string, unknown> = {}
    for (let i = 0; i < 21; i++) endless = i % 2 ? { a: endless } : { b: endless } // outermost: b
    expect(() => validate(A, endless, resolve)).toThrow(/more than 16 object levels/)
    const SELF = { id: 's', version: 1, name: 'S', workspaceId: W, fields: [ref('me', { id: 's', version: 1 }, true)] } as DefinitionVersion
    expect(checkContract(SELF, resolverOf(SELF))).toEqual([{ problem: 'cyclic_reference', path: ['me'], definition: { id: 's', version: 1 } }])
  })

  it('refuses a version that would reference itself when it is made', () => {
    const existing = { id: 'p', version: 1, name: 'P', workspaceId: W, fields: [] } as DefinitionVersion
    expect(() => make('p', 1, W, [ref('me', { id: 'p', version: 1 })], resolverOf(existing))).toThrow(/cyclic_reference at me/)
    expect(() => make('p', 2, W, [ref('me', { id: 'p', version: 2 })], ALL)).toThrow(/unresolved_reference at me/)
  })

  it('refuses malformed references and malformed referenced versions', () => {
    for (const definition of [{ id: '', version: 1 }, { id: 'candidate', version: 0 }, { id: 'candidate', version: 1.5 }, { id: 'candidate' }, null, 'candidate@1']) {
      expect(problems([{ name: 'c', type: 'reference', definition } as never])).toEqual(['malformed'])
    }
    const broken = { id: 'broken', version: 1, name: 'Broken', workspaceId: W, fields: 'nope' } as unknown as DefinitionVersion
    expect(checkFields([ref('b', broken)], { owner: W, resolve: resolverOf(broken) })).toEqual([{ problem: 'malformed', path: ['b'] }])
  })

  it('checks a shared dependency once, however many paths reach it', () => {
    // 15 levels, each referencing the level below through 10 properties: 10^14 paths, 15 versions.
    let below = make('d1', 1, W, [text('leaf')])
    const versions = [below]
    for (let level = 2; level <= 15; level++) {
      below = make(`d${level}`, 1, W, Array.from({ length: 10 }, (_, i) => ref(`p${i}`, below)), resolverOf(...versions))
      versions.push(below)
    }
    let calls = 0
    const resolve: Resolve = (r) => { calls++; return resolverOf(...versions)(r) }
    const started = Date.now()
    expect(checkContract(below, resolve)).toEqual([])
    expect(Date.now() - started).toBeLessThan(1000)
    expect(calls).toBeLessThan(200)
  })
})

describe(`Depth across the complete resolved contract: at most ${MAX_OBJECT_LEVELS} object levels`, () => {
  /** A chain of `levels` levels: L1 is flat; each L(k) references L(k-1) as `next`. Returns the top and every version. */
  function chain(levels: number) {
    const versions = [make('l1', 1, W, [text('leaf')])]
    for (let k = 2; k <= levels; k++) versions.push(make(`l${k}`, 1, W, [ref('next', versions.at(-1)!)], resolverOf(...versions)))
    return { top: versions.at(-1)!, resolve: resolverOf(...versions), versions }
  }
  const chainData = (levels: number): Record<string, unknown> => (levels === 1 ? { leaf: 'x' } : { next: chainData(levels - 1) })

  it('allows a chain of references reaching exactly level 16', () => {
    const { top, resolve } = chain(16)
    expect(checkContract(top, resolve)).toEqual([])
    expect(validate(top, chainData(16), resolve)).toEqual([])
    const issues = validate(top, chainData(16) as never, resolve)
    expect(issues).toEqual([])
  })

  it('refuses the version that would reach level 17, at the reference that crosses the limit', () => {
    const { top, resolve } = chain(16)
    expect(checkFields([ref('next', top)], { owner: W, resolve })).toEqual([{ problem: 'too_deep', path: ['next'], level: 17 }])
    expect(() => make('l17', 1, W, [ref('next', top)], resolve)).toThrow(/too_deep at next/)
  })

  it('counts local objects and references together, wherever the reference sits', () => {
    const { versions, resolve } = chain(15) // l15 spans 15 levels
    const l15 = versions.at(-1)!
    expect(checkFields([ref('r', l15)], { owner: W, resolve })).toEqual([]) // 1 + 15 = 16
    expect(checkFields([object('box', [ref('r', l15)])], { owner: W, resolve })).toEqual([{ problem: 'too_deep', path: ['box', 'r'], level: 17 }])
    const l14 = versions[13]!
    expect(checkFields([object('box', [ref('r', l14)])], { owner: W, resolve })).toEqual([])
  })

  it('counts a referenced version’s own local objects too', () => {
    let fields: Field[] = [text('leaf')]
    for (let i = 0; i < 14; i++) fields = [object(`o${i}`, fields)] // 15 levels, by local objects alone
    const deep = make('deep', 1, W, fields)
    const resolve = resolverOf(deep)
    expect(checkFields([ref('d', deep)], { owner: W, resolve })).toEqual([])
    expect(checkFields([object('x', [ref('d', deep)])], { owner: W, resolve }).map((i) => i.problem)).toEqual(['too_deep'])
  })
})

describe('Existing contracts are unchanged', () => {
  it('flat and local-object versions resolve as contracts with or without a resolver', () => {
    // The realistic samples (realistic.ts) are composed; realistic-playground.test.ts covers them.
    for (const d of [...DEFINITIONS, ...ORBIT_PROVIDED].filter((x) => x.id !== 'applicant' && !REALISTIC_DEFINITIONS.includes(x))) {
      expect(checkContract(d)).toEqual([])
      expect(defineVersion(d)).toEqual(d)
    }
    // The composed sample (Phase 4.1) resolves only with what it references, exactly.
    const samples = (r: { id: string; version: number }) => DEFINITIONS.find((x) => x.id === r.id && x.version === r.version) ?? null
    const applicant = DEFINITIONS.find((x) => x.id === 'applicant')!
    expect(checkContract(applicant, samples)).toEqual([])
    expect(checkContract(applicant).map((i) => i.problem)).toEqual(['unresolved_reference'])
    const local = make('local', 1, W, [object('contact', [text('email')])])
    expect(checkContract(local)).toEqual([])
    expect(validate(local, { contact: { email: 'a' } })).toEqual([])
  })

  it('the Studio drafts a version with references as references, never copying what they contain', () => {
    const draft = draftFrom(PROCESS_1)
    expect(draft.fields[1]).toEqual({ key: 1, name: 'candidate', type: 'reference', optional: false, definition: { id: 'candidate', version: 1 } })
    expect(fieldsOf(draft)).toEqual(PROCESS_1.fields)
  })
})

describe('Existing Feature versions refuse composed contracts before running', () => {
  const SUMMARY = make('summary', 1, W, [text('title')])
  const NESTED_OUT = make('nested-out', 1, W, [ref('candidate', CANDIDATE_1)], ALL)
  const IN_OBJECT = make('in-object', 1, W, [object('meta', [ref('owner', CANDIDATE_1)])], ALL)
  const prop = (name: string) => ({ kind: 'property' as const, name })
  const mapping = (from: DefinitionVersion, to: DefinitionVersion): Mapping => ({ id: 'm', version: 1, workspaceId: W, from: refOf(from), to: refOf(to), properties: [{ name: 'title', source: prop('name') }] })
  const catalog = (definitions: DefinitionVersion[], m?: Mapping) => ({
    definitions,
    records: [
      { id: 'proc', workspaceId: W, definition: refOf(PROCESS_1), data: { name: 'Hire', candidate: ADA } },
      { id: 'sum', workspaceId: W, definition: refOf(SUMMARY), data: { title: 'x' } },
      { id: 'obj', workspaceId: W, definition: refOf(IN_OBJECT), data: { meta: { owner: ADA } } },
    ],
    mappings: m ? [m] : [],
  })
  const FULL = [CANDIDATE_1, PROCESS_1, SUMMARY, NESTED_OUT, IN_OBJECT, THEIRS]
  let runs = 0
  const counted = <F extends Feature>(feature: F): F => ({ ...feature, run: (...args: never[]) => { runs++; return (feature.run as (...a: never[]) => unknown)(...args) } }) as F
  const outcome = (r: InvocationResult) => r.evidence.outcome

  it('every existing Feature version declares no support for references', () => {
    for (const feature of [orbitConsole, orbitTransformV1, orbitTransformV2]) {
      expect(feature.references).toBe('unsupported')
      expect(contractCompatibility(feature, PROCESS_1)).toEqual([['candidate']])
      expect(contractCompatibility(feature, IN_OBJECT)).toEqual([['meta'], ['meta', 'owner']])
      expect(contractCompatibility(feature, SUMMARY)).toEqual([])
    }
  })

  it('Orbit.Console v1 refuses a Record whose Definition references another, without running', () => {
    runs = 0
    const result = invoke(catalog(FULL), { workspaceId: W, feature: counted(orbitConsole), input: { record: 'proc' } })
    expect(outcome(result)).toEqual({ kind: 'not_attempted', reason: 'unsupported_contract', definition: refOf(PROCESS_1), paths: [['candidate']] })
    expect(runs).toBe(0)
    expect(describeOutcome(outcome(result))).toBe('This version of the Feature doesn’t accept process · v1: it has objects or other Definitions inside it (candidate). The Feature didn’t run.')
  })

  it('Orbit.Transform v1 and v2 refuse references on the input side and the output side', () => {
    for (const feature of [orbitTransformV1, orbitTransformV2]) {
      runs = 0
      const inSide = invoke(catalog(FULL, mapping(PROCESS_1, SUMMARY)), { workspaceId: W, feature: counted(feature), input: { record: 'proc' }, mapping: { id: 'm', version: 1 } })
      expect(outcome(inSide)).toMatchObject({ reason: 'unsupported_contract', definition: refOf(PROCESS_1), paths: [['candidate']] })
      const outSide = invoke(catalog(FULL, mapping(SUMMARY, NESTED_OUT)), { workspaceId: W, feature: counted(feature), input: { record: 'sum' }, mapping: { id: 'm', version: 1 } })
      expect(outcome(outSide)).toMatchObject({ reason: 'unsupported_contract', definition: refOf(NESTED_OUT), paths: [['candidate']] })
      expect(runs).toBe(0)
    }
  })

  it('refuses explicitly a contract whose reference doesn’t resolve in the invoking workspace', () => {
    // The referenced version is missing from the catalog: refused before anything else, by exact identity.
    const missing = invoke(catalog([PROCESS_1]), { workspaceId: W, feature: orbitConsole, input: { record: 'proc' } })
    expect(outcome(missing)).toEqual({
      kind: 'not_attempted', reason: 'invalid_contract', definition: refOf(PROCESS_1),
      issues: [{ problem: 'unresolved_reference', path: ['candidate'], definition: { id: 'candidate', version: 1 } }],
    })
    expect(outcomeIssues(outcome(missing))).toEqual(['candidate refers to candidate · v1, which can’t be found here.'])
  })

  it('never reaches another workspace’s version through a reference: it is indistinguishable from missing', () => {
    const forged = { id: 'proc-x', version: 1, name: 'X', workspaceId: W, fields: [ref('c', THEIRS)] } as DefinitionVersion
    const result = invoke({ definitions: [forged, THEIRS], records: [{ id: 'x', workspaceId: W, definition: refOf(forged), data: { c: ADA } }], mappings: [] }, { workspaceId: W, feature: orbitConsole, input: { record: 'x' } })
    expect(outcome(result)).toMatchObject({ reason: 'invalid_contract', issues: [{ problem: 'unresolved_reference', path: ['c'] }] })
    expect(JSON.stringify(result.evidence)).not.toMatch(/Ada|example\.com/)
  })

  it('words every contract problem for people', () => {
    expect(describeDefinitionIssue({ problem: 'cyclic_reference', path: ['b', 'a'], definition: { id: 'a', version: 1 } })).toBe('b › a refers back to a · v1, which contains it, so it never ends.')
    expect(describeDefinitionIssue({ problem: 'too_deep', path: ['next'], level: 17 })).toBe('next would nest 17 levels deep. At most 16 are allowed.')
    expect(describeDefinitionIssue({ problem: 'unavailable_reference', path: ['c'], definition: { id: 'x', version: 1 } })).toBe('c refers to x · v1, which this Definition may not depend on.')
  })
})
