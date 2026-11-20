// Orbit's first Feature language: Definitions (immutable versions, exact identity, runtime
// validation), Mappings (a closed expression tree), and the execution boundary that stands
// around every Feature (workspace scoping, contracts, truthful outcomes, evidence without data).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  type Data, type DefinitionVersion, type Value, type WorkspaceRecord, defineVersion, sameData, validate,
} from '../shared/features/definitions'
import { type Expression, type Mapping, FUNCTIONS, checkMapping, evaluate, formatSource, reviseMapping } from '../shared/features/mappings'
import {
  type Catalog, type InvocationResult, type MappingFeature, type PassThroughFeature, invoke, orbitConsole, orbitTransform,
} from '../shared/features/features'

const W = 'ws-1'
const OTHER = 'ws-2'
const A1 = defineVersion({ id: 'person', version: 1, name: 'A', workspaceId: W, fields: [{ name: 'firstName', type: 'string' }, { name: 'lastName', type: 'string' }] })
const A2 = defineVersion({ id: 'person', version: 2, name: 'A', workspaceId: W, fields: [...A1.fields, { name: 'age', type: 'number' }] })
const LOOKALIKE = defineVersion({ id: 'person-copy', version: 1, name: 'A', workspaceId: W, fields: A1.fields })
const B1 = defineVersion({ id: 'full-name', version: 1, name: 'B', workspaceId: W, fields: [{ name: 'fullName', type: 'string' }] })
const THEIRS = defineVersion({ id: 'their-person', version: 1, name: 'A', workspaceId: OTHER, fields: A1.fields })
const PLATFORM = defineVersion({ id: 'orbit.text', version: 1, name: 'Text', workspaceId: null, fields: [{ name: 'text', type: 'string' }] })

const prop = (name: string): Expression => ({ kind: 'property', name })
const lit = (value: string | number | boolean): Expression => ({ kind: 'literal', value })
const trim = (arg: Expression): Expression => ({ kind: 'call', fn: 'trim', args: [arg] })
const join = (items: Expression[], separator: string): Expression => ({ kind: 'call', fn: 'join', args: [{ kind: 'list', items }, lit(separator)] })

/** The owners' example: join([trim(firstName), " ", lastName], ""). */
const FULL_NAME = join([trim(prop('firstName')), lit(' '), prop('lastName')], '')
const mapping = (properties: Mapping['properties'], over: Partial<Mapping> = {}): Mapping =>
  ({ id: 'm', version: 1, workspaceId: W, from: { id: 'person', version: 1 }, to: { id: 'full-name', version: 1 }, properties, ...over })
const M1 = mapping([{ name: 'fullName', source: FULL_NAME }])

const ADA: Data = { firstName: '  Ada  ', lastName: 'Lovelace' }
const recordA = (over: Partial<WorkspaceRecord> = {}): WorkspaceRecord => ({ id: 'rec-a', workspaceId: W, definition: { id: 'person', version: 1 }, data: ADA, ...over })
const catalog = (over: Partial<Catalog> = {}): Catalog => ({
  definitions: [A1, A2, LOOKALIKE, B1, THEIRS, PLATFORM],
  records: [recordA(), { id: 'rec-theirs', workspaceId: OTHER, definition: { id: 'their-person', version: 1 }, data: ADA }],
  mappings: [M1],
  ...over,
})

/** Features that count their runs, to prove a refusal means the code never ran. */
function counted<F extends PassThroughFeature | MappingFeature>(feature: F) {
  const calls = { n: 0 }
  const run = (...args: unknown[]) => { calls.n++; return (feature.run as (...a: unknown[]) => Data)(...args) }
  return { feature: { ...feature, run } as F, calls }
}
const transform = (c: Catalog, input: Catalog['records'][number] | Value | { record: string }, m: { id: string; version: number } = M1, feature: MappingFeature = orbitTransform) =>
  invoke(c, { workspaceId: W, feature, input: 'workspaceId' in input ? { record: input.id } : input, mapping: m })
const show = (c: Catalog, input: Value | { record: string }, feature: PassThroughFeature = orbitConsole, workspaceId = W) =>
  invoke(c, { workspaceId, feature, input })

// Nothing in this language may write to a console: spy on every method, for every test.
const CONSOLE_METHODS = ['log', 'info', 'warn', 'error', 'debug', 'trace', 'dir', 'table'] as const
let spies: ReturnType<typeof vi.spyOn>[] = []
beforeEach(() => { spies = CONSOLE_METHODS.map((m) => vi.spyOn(console, m).mockImplementation(() => {})) })
afterEach(() => {
  for (const [i, spy] of spies.entries()) expect(spy, `console.${CONSOLE_METHODS[i]}`).not.toHaveBeenCalled()
  vi.restoreAllMocks()
})

/** Evidence carries references and shapes only: none of the data's values may appear in it. */
function expectNoData(result: InvocationResult, ...values: string[]) {
  const text = JSON.stringify(result.evidence)
  for (const v of ['Ada', 'Lovelace', ...values]) expect(text).not.toContain(v)
}

describe('Definitions', () => {
  it('validates exactly: every field present, of its type, and nothing else', () => {
    expect(validate(A1, ADA)).toEqual([])
    expect(validate(A1, { firstName: 'Ada' })).toEqual([{ problem: 'missing', field: 'lastName', expected: 'string' }])
    expect(validate(A1, { ...ADA, email: 'a@b.c' })).toEqual([{ problem: 'unexpected', field: 'email' }])
    expect(validate(A1, { firstName: 'Ada', lastName: 1815 })).toEqual([{ problem: 'wrong_type', field: 'lastName', expected: 'string', actual: 'number' }])
    expect(validate(A2, { ...ADA, age: Number.NaN })).toEqual([{ problem: 'wrong_type', field: 'age', expected: 'number', actual: 'other' }])
    expect(validate(A1, ['Ada', 'Lovelace'])).toEqual([{ problem: 'not_an_object', actual: 'array' }])
    expect(validate(A1, null)).toEqual([{ problem: 'not_an_object', actual: 'null' }])
  })

  it('looks only at the data’s own fields, never at what objects inherit', () => {
    const withProtoKey = JSON.parse('{"firstName":"Ada","lastName":"Lovelace","__proto__":"x"}')
    expect(validate(A1, withProtoKey)).toEqual([{ problem: 'unexpected', field: '__proto__' }])
    const toStringField = defineVersion({ id: 't', version: 1, name: 't', workspaceId: W, fields: [{ name: 'toString', type: 'string' }] })
    expect(validate(toStringField, {})).toEqual([{ problem: 'missing', field: 'toString', expected: 'string' }])
  })

  it('reports problems by field and kind, never by value', () => {
    expect(JSON.stringify(validate(A1, { firstName: 'Ada', lastName: 1815, secret: 'Lovelace' }))).not.toMatch(/Ada|1815|Lovelace/)
  })

  it('makes immutable versions: a version can’t be changed, only succeeded by another', () => {
    expect(Object.isFrozen(A1) && Object.isFrozen(A1.fields) && Object.isFrozen(A1.fields[0])).toBe(true)
    expect(() => { (A1.fields as unknown as unknown[]).push({ name: 'age', type: 'number' }) }).toThrow(TypeError)
    expect(() => { (A1.fields[0] as { type: string }).type = 'number' }).toThrow(TypeError)
    expect(validate(A1, ADA)).toEqual([]) // A1 still means what it meant
    expect(() => defineVersion({ id: 'x', version: 1, name: 'x', workspaceId: W, fields: [{ name: 'a', type: 'string' }, { name: 'a', type: 'number' }] })).toThrow()
  })
})

describe('Mappings: a closed, declarative expression tree', () => {
  it('builds the owners’ example, nested functions included', () => {
    expect(evaluate(FULL_NAME, ADA)).toBe('Ada Lovelace')
    expect(formatSource(FULL_NAME)).toBe('join([trim(firstName), " ", lastName], "")')
    const deeper = trim(join([lit('  '), join([prop('lastName'), trim(prop('firstName'))], ', '), lit('  ')], ''))
    expect(evaluate(deeper, ADA)).toBe('Lovelace, Ada')
    expect(evaluate(join([], '-'), ADA)).toBe('')
    expect(evaluate(lit(42), ADA)).toBe(42)
  })

  it('infers each property’s type from its source', () => {
    const checked = checkMapping({ properties: [
      { name: 'fullName', source: FULL_NAME }, { name: 'n', source: lit(1) }, { name: 'ok', source: lit(false) }, { name: 'first', source: prop('firstName') },
    ] }, A1)
    expect(checked).toEqual({ issues: [], types: ['string', 'number', 'boolean', 'string'] })
  })

  it('refuses what it can’t do before anything runs: unknown names, wrong arguments, lists where values belong', () => {
    const issues = (source: Expression, def: DefinitionVersion = A1) => checkMapping({ properties: [{ name: 'p', source }] }, def).issues.map((i) => i.problem)
    expect(issues(prop('middleName'))).toEqual(['unknown_property'])
    for (const inherited of ['toString', '__proto__', 'constructor']) expect(issues(prop(inherited))).toEqual(['unknown_property'])
    for (const fn of ['eval', 'constructor', 'toString', 'hasOwnProperty']) expect(issues({ kind: 'call', fn, args: [] })).toEqual(['unknown_function'])
    expect(issues({ kind: 'call', fn: 'trim', args: [] })).toEqual(['argument_count'])
    expect(issues({ kind: 'call', fn: 'trim', args: [{ kind: 'list', items: [prop('firstName')] }] })).toEqual(['argument_type'])
    expect(issues({ kind: 'call', fn: 'join', args: [prop('firstName'), lit(' ')] })).toEqual(['argument_type'])
    expect(issues(join([prop('firstName'), prop('age')], ' '), A2)).toEqual(['list_item_type'])
    expect(issues({ kind: 'list', items: [] } as unknown as Expression)).toEqual(['list_not_allowed'])
    expect(issues(lit(Number.NaN))).toEqual(['invalid_literal'])
    expect(issues(trim(prop('nope')))).toEqual(['unknown_property']) // found however deep
    const named = checkMapping({ properties: [{ name: '', source: lit('') }, { name: 'a', source: lit('') }, { name: 'a', source: lit('') }] }, A1)
    expect(named.issues.map((i) => i.problem)).toEqual(['empty_name', 'duplicate_name'])
  })

  it('says where a problem is, inside nested sources', () => {
    const [issue] = checkMapping({ properties: [{ name: 'fullName', source: join([trim(prop('nope'))], '') }] }, A1).issues
    expect(issue).toEqual({ problem: 'unknown_property', path: ['fullName', 'join', 0, 0, 'trim', 0], name: 'nope' })
  })

  it('grows by adding a function, not by changing the tree: every function declares its parameters and result', () => {
    for (const spec of Object.values(FUNCTIONS)) expect(spec).toEqual({ params: expect.any(Array), returns: expect.any(String), apply: expect.any(Function) })
  })

  it('revises into a new, frozen version and leaves the old one exactly as it was', () => {
    const v1 = reviseMapping(M1, M1.properties) // same content is still a new version
    const v2 = reviseMapping(v1, [{ name: 'fullName', source: prop('lastName') }])
    expect([v1.version, v2.version]).toEqual([2, 3])
    expect(v1.properties[0]!.source).toEqual(FULL_NAME)
    expect(Object.isFrozen(v2) && Object.isFrozen(v2.properties[0]!.source)).toBe(true)
    expect({ id: v2.id, from: v2.from, to: v2.to, workspaceId: v2.workspaceId }).toEqual({ id: M1.id, from: M1.from, to: M1.to, workspaceId: M1.workspaceId })
  })
})

describe('Orbit.Console: pass-through, enforced by the boundary', () => {
  it('observes its input and hands on the very same Value, Definition identity included', () => {
    const r = show(catalog(), { record: 'rec-a' })
    expect(r.evidence.outcome).toEqual({ kind: 'succeeded' })
    expect(r.observations).toEqual([ADA])
    expect(r.output).toEqual({ definition: { id: 'person', version: 1 }, data: ADA })
    expect(r.evidence.input).toEqual({ record: 'rec-a', definition: { id: 'person', version: 1 } })
    expect(r.evidence.output).toEqual({ definition: { id: 'person', version: 1 } })
  })

  it('passes any Definition through unchanged, because its output is its input', () => {
    for (const value of [{ definition: { id: 'full-name', version: 1 }, data: { fullName: 'Ada Lovelace' } }, { definition: { id: 'orbit.text', version: 1 }, data: { text: 'hi' } }]) {
      expect(show(catalog(), value).output).toEqual(value)
    }
  })

  it('can’t change the Value: the input it receives is frozen, so trying fails, and nothing goes on', () => {
    const c = catalog()
    const editing: PassThroughFeature = { ...orbitConsole, id: 'test.editing', run(input) { (input as Record<string, unknown>).firstName = 'Grace'; return input } }
    const r = show(c, { record: 'rec-a' }, editing)
    expect(r.evidence.outcome).toEqual({ kind: 'failed', reason: 'threw', error: 'TypeError' })
    expect(r.output).toBeUndefined()
    expect(c.records[0]!.data).toEqual(ADA)
    expect(r.evidence.feature).toEqual({ id: 'test.editing', version: 1 }) // evidence names what actually ran
  })

  it('stops a pass-through that hands on anything else, even data that would still be valid', () => {
    const swapping: PassThroughFeature = { ...orbitConsole, id: 'test.swapping', run: (input) => ({ ...input, firstName: 'Grace' }) }
    const r = show(catalog(), { record: 'rec-a' }, swapping)
    expect(r.evidence.outcome).toEqual({ kind: 'failed', reason: 'pass_through_broken' })
    expect(r.output).toBeUndefined()
    expectNoData(r, 'Grace')
  })

  it('accepts an equal copy as unchanged', () => {
    const copying: PassThroughFeature = { ...orbitConsole, id: 'test.copying', run: (input) => ({ ...input }) }
    expect(show(catalog(), { record: 'rec-a' }, copying).output).toEqual({ definition: { id: 'person', version: 1 }, data: ADA })
  })
})

describe('Orbit.Transform: exact contracts, validated output', () => {
  it('turns Definition A into a Value of Definition B, and creates no Record', () => {
    const c = catalog()
    const before = structuredClone(c)
    const r = transform(c, recordA())
    expect(r.evidence.outcome).toEqual({ kind: 'succeeded' })
    expect(r.output).toEqual({ definition: { id: 'full-name', version: 1 }, data: { fullName: 'Ada Lovelace' } })
    expect(Object.keys(r.output!)).toEqual(['definition', 'data']) // a Value: no id, no workspace
    expect(r.observations).toEqual([])
    expect(c).toEqual(before) // nothing added, nothing changed
    expect(r.evidence).toEqual({
      workspaceId: W,
      feature: { id: 'orbit.transform', version: 1 },
      mapping: { id: 'm', version: 1 },
      input: { record: 'rec-a', definition: { id: 'person', version: 1 } },
      output: { definition: { id: 'full-name', version: 1 } },
      outcome: { kind: 'succeeded' },
    })
  })

  it('is deterministic: the same Value and Mapping version always give the same output', () => {
    expect(transform(catalog(), recordA()).output).toEqual(transform(catalog(), recordA()).output)
  })

  it('matches by exact identity: another version, or a look-alike Definition, is refused and nothing runs', () => {
    const { feature, calls } = counted(orbitTransform)
    const a2 = transform(catalog(), { definition: { id: 'person', version: 2 }, data: { ...ADA, age: 36 } }, M1, feature)
    expect(a2.evidence.outcome).toEqual({ kind: 'not_attempted', reason: 'contract_mismatch', expected: { id: 'person', version: 1 }, actual: { id: 'person', version: 2 } })
    const lookalike = transform(catalog(), { definition: { id: 'person-copy', version: 1 }, data: ADA }, M1, feature)
    expect(lookalike.evidence.outcome).toMatchObject({ kind: 'not_attempted', reason: 'contract_mismatch' })
    expect(calls.n).toBe(0)
    expect([a2.output, lookalike.output]).toEqual([undefined, undefined])
  })

  it('refuses input that isn’t what it claims to be, from a Record or from a caller, and nothing runs', () => {
    const { feature, calls } = counted(orbitTransform)
    const badRecord = catalog({ records: [recordA({ data: { firstName: 'Ada' } })] })
    const fromRecord = transform(badRecord, recordA(), M1, feature)
    expect(fromRecord.evidence.outcome).toEqual({ kind: 'not_attempted', reason: 'invalid_input', issues: [{ problem: 'missing', field: 'lastName', expected: 'string' }] })
    const forged = transform(catalog(), { definition: { id: 'person', version: 1 }, data: { firstName: 'Ada', lastName: 'Lovelace', role: 'admin' } }, M1, feature)
    expect(forged.evidence.outcome).toMatchObject({ kind: 'not_attempted', reason: 'invalid_input' })
    expect(calls.n).toBe(0)
    expectNoData(forged, 'admin')
  })

  it('refuses a Mapping that can’t be applied, and nothing runs', () => {
    const { feature, calls } = counted(orbitTransform)
    const broken = mapping([{ name: 'fullName', source: trim(prop('middleName')) }], { id: 'broken' })
    const r = transform(catalog({ mappings: [broken] }), recordA(), broken, feature)
    expect(r.evidence.outcome).toMatchObject({ kind: 'not_attempted', reason: 'invalid_mapping', issues: [{ problem: 'unknown_property' }] })
    expect(calls.n).toBe(0)
  })

  it('never hands on output that doesn’t satisfy the target Definition', () => {
    const cases: [Mapping['properties'], string][] = [
      [[{ name: 'fullName', source: lit(1815) }], 'wrong_type'],
      [[{ name: 'name', source: FULL_NAME }], 'missing'],
      [[{ name: 'fullName', source: FULL_NAME }, { name: 'firstName', source: prop('firstName') }], 'unexpected'],
    ]
    for (const [properties, problem] of cases) {
      const m = mapping(properties, { id: `m-${problem}` })
      const r = transform(catalog({ mappings: [m] }), recordA(), m)
      expect(r.evidence.outcome).toMatchObject({ kind: 'failed', reason: 'invalid_output' })
      expect((r.evidence.outcome as { issues: { problem: string }[] }).issues.map((i) => i.problem)).toContain(problem)
      expect(r.output).toBeUndefined()
      expect(r.evidence.output).toBeUndefined()
      expectNoData(r, '1815')
    }
  })

  it('reports a Feature that throws as failed, by the error’s name only (its message could quote data)', () => {
    const leaky: MappingFeature = { ...orbitTransform, id: 'test.leaky', run: (input) => { throw new RangeError(`bad ${input.lastName}`) } }
    const r = transform(catalog(), recordA(), M1, leaky)
    expect(r.evidence.outcome).toEqual({ kind: 'failed', reason: 'threw', error: 'RangeError' })
    expect(r.output).toBeUndefined()
    expectNoData(r)
  })

  it('validates output whatever the Feature claims: a Feature that ignores its Mapping is caught', () => {
    const rogue: MappingFeature = { ...orbitTransform, id: 'test.rogue', run: () => ({ fullName: 42 }) as unknown as Data }
    expect(transform(catalog(), recordA(), M1, rogue).evidence.outcome).toMatchObject({ kind: 'failed', reason: 'invalid_output' })
  })
})

describe('The boundary: workspace isolation, truthful outcomes, nothing kept', () => {
  it('never reaches into another workspace, and says only “not found”, exactly as for what doesn’t exist', () => {
    const notFound = { kind: 'not_attempted', reason: 'not_found' }
    const c = catalog({
      records: [...catalog().records, { id: 'rec-theirs-shared-shape', workspaceId: OTHER, definition: { id: 'orbit.text', version: 1 }, data: { text: 'theirs' } }],
      mappings: [M1, mapping(M1.properties, { id: 'theirs', workspaceId: OTHER }), mapping(M1.properties, { id: 'into-theirs', to: { id: 'their-person', version: 1 } })],
    })
    const results = [
      show(c, { record: 'rec-theirs' }), // their Record
      show(c, { record: 'rec-theirs-shared-shape' }), // their Record, even of a Definition we may use
      show(c, { record: 'no-such-record' }),
      show(c, { definition: { id: 'their-person', version: 1 }, data: ADA }), // a Value of their Definition
      show(c, { definition: { id: 'no-such-definition', version: 1 }, data: ADA }),
      show(c, { record: 'rec-a' }, orbitConsole, OTHER), // our Record, invoked from their workspace
      transform(c, recordA(), { id: 'theirs', version: 1 }), // their Mapping
      transform(c, recordA(), { id: 'into-theirs', version: 1 }), // our Mapping, pointing at their Definition
      transform(c, recordA(), { id: 'm', version: 99 }),
    ]
    for (const r of results) {
      expect(r.evidence.outcome).toEqual(notFound)
      expect(r.observations).toEqual([])
      expect(r.output).toBeUndefined()
    }
  })

  it('lets every workspace use a Definition Orbit provides', () => {
    expect(show(catalog(), { definition: { id: 'orbit.text', version: 1 }, data: { text: 'hi' } }).evidence.outcome).toEqual({ kind: 'succeeded' })
  })

  it('never claims a run that didn’t happen: a refused Console observed nothing', () => {
    const { feature, calls } = counted(orbitConsole)
    const r = show(catalog({ records: [recordA({ data: { firstName: 1 } as unknown as Data })] }), { record: 'rec-a' }, feature)
    expect(r.evidence.outcome).toMatchObject({ kind: 'not_attempted', reason: 'invalid_input' })
    expect(r.observations).toEqual([])
    expect(calls.n).toBe(0)
  })

  it('keeps data out of evidence, whatever the outcome', () => {
    const c = catalog()
    for (const r of [show(c, { record: 'rec-a' }), transform(c, recordA()), show(c, transform(c, recordA()).output!)]) expectNoData(r)
  })

  it('freezes everything it returns, so nobody downstream can rewrite a Value or the evidence', () => {
    const r = transform(catalog(), recordA())
    expect(() => { (r.output!.data as Record<string, unknown>).fullName = 'x' }).toThrow(TypeError)
    expect(() => { (r.evidence as { workspaceId: string }).workspaceId = OTHER }).toThrow(TypeError)
    const seen = show(catalog(), { record: 'rec-a' }).observations[0]!
    expect(() => { (seen as Record<string, unknown>).firstName = 'x' }).toThrow(TypeError)
  })

  it('composes only through Values: Record A → Console → Transform → Console, each invoked on its own', () => {
    const c = catalog()
    const before = structuredClone(c)
    const first = show(c, { record: 'rec-a' })
    const second = transform(c, first.output!)
    const third = show(c, second.output!)
    expect(first.observations).toEqual([{ firstName: '  Ada  ', lastName: 'Lovelace' }])
    expect(third.observations).toEqual([{ fullName: 'Ada Lovelace' }])
    expect(third.output).toEqual({ definition: { id: 'full-name', version: 1 }, data: { fullName: 'Ada Lovelace' } })
    expect([first, second, third].map((r) => r.evidence.feature.id)).toEqual(['orbit.console', 'orbit.transform', 'orbit.console'])
    expect(c).toEqual(before)
    expect(sameData(c.records[0]!.data, ADA)).toBe(true)
  })
})
