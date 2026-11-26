// Experiment #3, the parts editor for Transform (/dev/designer): a view of the existing Mapping
// model, never a second language. Unchanged trees round-trip exactly, edits change only what was
// asked, only Apply makes a version, and the preview is the Transform's own evaluation without a
// run, so it creates no evidence.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { type Data, deepFreeze } from '../shared/features/definitions'
import { type Argument, type Expression, type Mapping, type MappingProperty, checkMapping } from '../shared/features/mappings'
import { invoke, orbitConsole, orbitTransformV2 } from '../shared/features/features'
import { A1, B1, DEFINITIONS, INITIAL_DATA, INITIAL_MAPPING, RECORD_ID, WORKSPACE, runExperiment } from '../app/dev/features/experiment'
import {
  type DraftProperty, type Piece, combineWith, fromDraft, fromPiece, insertAt, move, ownIssues, partPaths, removeAt, replaceAt,
  replaceValue, representable, toDraft, toPiece,
} from '../app/dev/designer/parts'
import { exampleFrom, friendlyIssue, previewOutput, previewSource, reviewDraft, visibleSegments, whitespaceNote } from '../app/dev/designer/preview'

const prop = (name: string): Expression => ({ kind: 'property', name })
const text = (value: string): Expression => ({ kind: 'literal', value })
const trim = (e: Expression): Expression => ({ kind: 'call', fn: 'trim', args: [e] })
const joined = (items: Expression[], separator: Expression | string): Expression =>
  ({ kind: 'call', fn: 'join', args: [{ kind: 'list', items }, typeof separator === 'string' ? text(separator) : separator] })
const same = (a: unknown, b: unknown) => expect(JSON.stringify(a)).toBe(JSON.stringify(b))
const roundTrip = (e: Expression) => fromPiece(toPiece(e))
const example = { data: deepFreeze({ ...INITIAL_DATA }) as Data }
const valueOf = (e: Expression) => {
  const p = previewSource(e, A1, example)
  return 'value' in p ? p.value : p
}

// A seeded generator over the whole expression grammar, including trees that aren't valid.
function generator(seed: number) {
  let s = seed
  const rand = () => ((s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31)
  const pick = <T>(xs: T[]) => xs[Math.floor(rand() * xs.length)]!
  const expr = (depth: number): Expression => {
    const r = rand()
    if (depth <= 0 || r < 0.3) {
      return pick<Expression>([prop('firstName'), prop('lastName'), prop('missing'), prop(''), text(''), text(' '), text('  x '), { kind: 'literal', value: 7 }, { kind: 'literal', value: false }])
    }
    if (r < 0.5) return trim(expr(depth - 1))
    if (r < 0.8) return joined(Array.from({ length: Math.floor(rand() * 4) }, () => expr(depth - 1)), pick<Expression | string>(['', ' ', ', ', prop('lastName'), { kind: 'literal', value: 1 }]))
    const args: Argument[] = Array.from({ length: Math.floor(rand() * 3) }, () => (rand() < 0.3 ? { kind: 'list', items: [expr(depth - 1)] } : expr(depth - 1)))
    return { kind: 'call', fn: pick(['trim', 'join', 'upper', 'concat']), args }
  }
  return expr
}

describe('The parts view round-trips every tree exactly', () => {
  it('shows the playground’s Mapping as parts and gives back the identical tree', () => {
    const source = INITIAL_MAPPING.properties[0]!.source
    expect(toPiece(source)).toEqual({
      kind: 'combine', separator: '', trim: false,
      parts: [{ kind: 'field', name: 'firstName', trim: true }, { kind: 'text', value: ' ', trim: false }, { kind: 'field', name: 'lastName', trim: false }],
    })
    same(roundTrip(source), source)
    same(fromDraft(toDraft(INITIAL_MAPPING.properties)), INITIAL_MAPPING.properties)
  })

  it('shows what it can as parts, including nested groups, separators and a trimmed result', () => {
    const cases: [Expression, Piece['kind']][] = [
      [prop('firstName'), 'field'],
      [text('Dr. '), 'text'],
      [trim(prop('firstName')), 'field'],
      [joined([prop('lastName'), trim(prop('firstName'))], ', '), 'combine'],
      [trim(joined([prop('firstName'), text(' '), prop('lastName')], '')), 'combine'],
      [joined([trim(joined([prop('firstName'), prop('lastName')], ' ')), text('!')], ''), 'combine'],
      [joined([], ''), 'combine'],
    ]
    for (const [e, kind] of cases) {
      expect(toPiece(e).kind, JSON.stringify(e)).toBe(kind)
      same(roundTrip(e), e)
    }
  })

  it('leaves what it can’t show exactly to the advanced editor, untouched (the very same object)', () => {
    const odd: Expression[] = [
      trim(trim(prop('firstName'))), // two trims: no single checkbox can show it
      joined([prop('firstName')], prop('lastName')), // a separator that isn't text
      { kind: 'call', fn: 'join', args: [{ kind: 'list', items: [prop('a')] }] }, // wrong argument count
      { kind: 'call', fn: 'join', args: [prop('a'), text('')] }, // not a list
      { kind: 'call', fn: 'trim', args: [{ kind: 'list', items: [prop('a')] }] },
      { kind: 'call', fn: 'upper', args: [prop('a')] }, // a function Orbit doesn't have
      { kind: 'property', name: 'firstName', note: 'extra' } as unknown as Expression, // an unexpected key
      { kind: 'literal', value: null } as unknown as Expression,
    ]
    for (const e of odd) {
      const piece = toPiece(e)
      expect(piece.kind, JSON.stringify(e)).toBe('advanced')
      expect(fromPiece(piece)).toBe(e)
      expect(representable(e)).toBe(false)
    }
    // Inside a group, only the odd part is advanced; the rest are parts, and the whole is exact.
    const mixed = joined([prop('firstName'), { kind: 'literal', value: 7 }, trim(trim(prop('lastName')))], ' ')
    const piece = toPiece(mixed)
    expect(piece.kind === 'combine' && piece.parts.map((p) => p.kind)).toEqual(['field', 'literal', 'advanced'])
    same(fromPiece(piece), mixed)
  })

  it('shows a fixed number or true/false as a value of its own (Experiment #4), exactly', () => {
    for (const value of [1815, 0, -2.5, true, false]) {
      const e: Expression = { kind: 'literal', value }
      expect(toPiece(e)).toEqual({ kind: 'literal', value })
      same(roundTrip(e), e)
    }
    // Spaces can't be removed from a number: that tree stays as it is, in the advanced view.
    expect(toPiece(trim({ kind: 'literal', value: 7 })).kind).toBe('advanced')
  })

  it('round-trips 2,000 generated trees exactly, valid or not', () => {
    const expr = generator(42)
    let advanced = 0
    for (let i = 0; i < 2000; i++) {
      const e = expr(4)
      same(roundTrip(e), e)
      if (toPiece(e).kind === 'advanced') advanced++
    }
    // Both paths are exercised.
    expect(advanced).toBeGreaterThan(100)
    expect(advanced).toBeLessThan(1900)
  })

  it('round-trips frozen trees (as applied Mapping versions are) without touching them', () => {
    const frozen = deepFreeze(structuredClone(INITIAL_MAPPING))
    same(fromDraft(toDraft(frozen.properties)), frozen.properties)
  })
})

describe('Edits change only what was asked, and the tree says exactly what the person did', () => {
  /** The Full name walk-through, from nothing, as the editor's buttons do it. */
  function buildFullName(): DraftProperty[] {
    let draft: DraftProperty[] = []
    draft = [...draft, { name: 'fullName', piece: { kind: 'field', name: 'firstName', trim: false } }] // Choose a value: firstName
    draft = replaceAt(draft, 0, { ...draft[0]!, piece: combineWith(draft[0]!.piece, { kind: 'text', value: ' ', trim: false }) }) // Add another part: a space
    const combine = draft[0]!.piece as Extract<Piece, { kind: 'combine' }>
    const withLast = { ...combine, parts: insertAt(combine.parts, 2, { kind: 'field', name: 'lastName', trim: false }) } // Add a part: lastName
    const trimmed = { ...withLast, parts: replaceAt(withLast.parts, 0, { ...(withLast.parts[0] as Extract<Piece, { kind: 'field' }>), trim: true }) } // Remove spaces
    return replaceAt(draft, 0, { ...draft[0]!, piece: trimmed })
  }

  it('builds Ada Lovelace from nothing, giving exactly the playground’s tree', () => {
    const draft = buildFullName()
    same(fromDraft(draft), INITIAL_MAPPING.properties)
    expect(valueOf(fromDraft(draft)[0]!.source)).toBe('Ada Lovelace')
  })

  it('turns it into “Lovelace, Ada” by moving and changing parts', () => {
    const piece = buildFullName()[0]!.piece as Extract<Piece, { kind: 'combine' }>
    let parts = move(piece.parts, 2, -1) // lastName up
    parts = move(parts, 1, -1) // and up again: lastName, firstName, space
    parts = replaceAt(parts, 2, replaceValue(parts[2]!, { kind: 'text', value: ', ', trim: false }))
    parts = move(parts, 2, -1) // lastName, ", ", firstName
    const source = fromPiece({ ...piece, parts })
    same(source, joined([prop('lastName'), text(', '), trim(prop('firstName'))], ''))
    expect(valueOf(source)).toBe('Lovelace, Ada')
  })

  it('removes spaces from the whole result, around the group', () => {
    const piece = toPiece(joined([prop('firstName'), text(' '), prop('lastName')], ''))
    const source = fromPiece({ ...piece, trim: true } as Piece)
    same(source, trim(joined([prop('firstName'), text(' '), prop('lastName')], '')))
    expect(valueOf(source)).toBe('Ada   Lovelace') // only the ends go: firstName's own trailing spaces stay inside
  })

  it('edits inside a nested group without touching anything around it', () => {
    const original = joined([trim(joined([prop('firstName'), prop('lastName')], ' ')), text('!')], '')
    const outer = toPiece(original) as Extract<Piece, { kind: 'combine' }>
    const group = outer.parts[0] as Extract<Piece, { kind: 'combine' }>
    const edited = { ...outer, parts: replaceAt(outer.parts, 0, { ...group, separator: ' & ' }) }
    const source = fromPiece(edited)
    same(source, joined([trim(joined([prop('firstName'), prop('lastName')], ' & ')), text('!')], ''))
    expect(valueOf(source)).toBe('Ada   & Lovelace!')
    // The untouched part is the very same object.
    expect((edited.parts[1])).toBe(outer.parts[1])
  })

  it('keeps “Remove spaces” when a part’s value is changed, and never moves past the ends', () => {
    expect(replaceValue({ kind: 'field', name: 'firstName', trim: true }, { kind: 'field', name: 'lastName', trim: false })).toEqual({ kind: 'field', name: 'lastName', trim: true })
    const list = [1, 2, 3]
    expect(move(list, 0, -1)).toEqual([1, 2, 3])
    expect(move(list, 2, 1)).toEqual([1, 2, 3])
    expect(removeAt(list, 1)).toEqual([1, 3])
    expect(insertAt(list, 1, 9)).toEqual([1, 9, 2, 3])
  })
})

describe('The preview: the Transform’s own evaluation, without a run', () => {
  const sound: MappingProperty[][] = [
    INITIAL_MAPPING.properties as MappingProperty[],
    [{ name: 'fullName', source: joined([prop('lastName'), text(', '), trim(prop('firstName'))], '') }],
    [{ name: 'fullName', source: trim(joined([prop('firstName'), text(' '), prop('lastName')], '')) }],
    [{ name: 'fullName', source: joined([trim(joined([prop('firstName'), prop('lastName')], ' ')), text('!')], '') }],
    [{ name: 'fullName', source: text('') }],
  ]

  it('makes exactly what a successful invocation of Orbit.Transform produces', () => {
    for (const properties of sound) {
      const mapping: Mapping = deepFreeze({ ...INITIAL_MAPPING, properties })
      const result = invoke(
        { definitions: DEFINITIONS, records: [], mappings: [mapping] },
        { workspaceId: WORKSPACE, feature: orbitTransformV2, input: { definition: A1, data: INITIAL_DATA }, mapping: { id: mapping.id, version: mapping.version } },
      )
      expect(result.evidence.outcome.kind).toBe('succeeded')
      const preview = previewOutput(properties, A1, B1, example)
      expect(Object.fromEntries(properties.map((p, i) => [p.name, (preview.values[i] as { value: unknown }).value]))).toEqual(result.output!.data)
      expect(preview.fits).toEqual({ issues: [] })
    }
  })

  it('never changes its input or the Mapping (both frozen here: a write would throw)', () => {
    const data = deepFreeze({ firstName: '  Ada  ', lastName: 'Lovelace' })
    const properties = deepFreeze(structuredClone(sound[3]!))
    const before = JSON.stringify([data, properties])
    previewOutput(properties, A1, B1, { data })
    reviewDraft(properties, A1, B1)
    expect(JSON.stringify([data, properties])).toBe(before)
  })

  it('uses Record A’s data only when it fits the Definition the Mapping reads, and says why not', () => {
    expect(exampleFrom('{', A1)).toEqual({ problem: 'Record A’s data isn’t valid JSON, so there’s no example to preview with.', details: [] })
    const v2 = exampleFrom(JSON.stringify({ ...INITIAL_DATA, email: 'ada@example.com' }), A1)
    expect(v2).toMatchObject({ details: ['email isn’t part of this Definition.'] })
    const missing = exampleFrom(JSON.stringify({ firstName: 'Ada' }), A1)
    expect(missing).toMatchObject({ details: ['lastName is missing (it should be text).'] })
    const ok = exampleFrom(JSON.stringify(INITIAL_DATA), A1)
    expect('data' in ok && Object.isFrozen(ok.data)).toBe(true)
    expect(previewSource(prop('firstName'), A1, v2)).toEqual({ noExample: true })
  })

  it('explains incomplete and invalid values in plain words, and shows no value for them', () => {
    expect(previewSource(prop('middleName'), A1, example)).toEqual({ problems: ['The input has no field “middleName”.'] })
    expect(previewSource(joined([prop('firstName'), { kind: 'literal', value: 7 }], ''), A1, example)).toEqual({ problems: ['Only text can be combined. This is a number.'] })
    expect(previewSource(trim({ kind: 'literal', value: 7 }), A1, example)).toEqual({ problems: ['Spaces can only be removed from text, not from a number.'] })
    // A property the target doesn't have: every value can be made, but the target wouldn't accept the object.
    const wrong = previewOutput([{ name: 'fullname', source: prop('firstName') }], A1, B1, example)
    expect(wrong.fits!.issues).toEqual(['fullName is missing (it should be text).', 'fullname isn’t part of this Definition.'])
  })

  it('never imports anything that invokes a Feature or records evidence', () => {
    const preview = readFileSync(join(import.meta.dirname, '../app/dev/designer/preview.ts'), 'utf8')
    const imports = [...preview.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1])
    expect(imports).toEqual(['#shared/features/definitions', '#shared/features/mappings', './reading', '../features/experiment'])
    expect(preview).not.toMatch(/\binvoke\s*\(|runExperiment|orbitTransformV\d|evidence\s*:/)
    // How the chosen version reads (reading.ts) is plain data and the domain's own checks: no Feature either.
    const reading = readFileSync(join(import.meta.dirname, '../app/dev/designer/reading.ts'), 'utf8')
    expect([...reading.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1])).toEqual(['#shared/features/definitions', '#shared/features/mappings'])
  })

  it('makes whitespace visible where it matters, and says it in words', () => {
    expect(visibleSegments('  Ada  ')).toEqual([{ text: '··', mark: true }, { text: 'Ada', mark: false }, { text: '··', mark: true }])
    expect(visibleSegments('Ada Lovelace')).toEqual([{ text: 'Ada', mark: false }, { text: ' ', mark: false }, { text: 'Lovelace', mark: false }])
    expect(visibleSegments('Ada   Lovelace').map((s) => s.text)).toEqual(['Ada', '···', 'Lovelace'])
    expect(whitespaceNote(' ')).toBe('a space')
    expect(whitespaceNote('   ')).toBe('3 spaces')
    expect(whitespaceNote('  Ada  ')).toBe('2 spaces at the start, 2 spaces at the end')
    expect(whitespaceNote('Ada   Lovelace')).toBe('3 spaces in a row')
    expect(whitespaceNote('')).toBe('empty')
  })
})

describe('Reviewing a draft against Definition B', () => {
  it('says which of the target’s fields are set, missing or in trouble', () => {
    expect(reviewDraft(INITIAL_MAPPING.properties, A1, B1)).toMatchObject({ fields: [{ name: 'fullName', state: 'set', index: 0 }], extras: [], problems: [] })
    expect(reviewDraft([], A1, B1)).toMatchObject({ fields: [{ name: 'fullName', state: 'not_set', index: -1 }], problems: ['fullName isn’t set yet. Definition B · v1 needs it.'] })
    const number = reviewDraft([{ name: 'fullName', source: { kind: 'literal', value: 7 } }], A1, B1)
    expect(number.fields[0]).toMatchObject({ state: 'problem', problems: ['Definition B · v1 needs text here, but this makes a number.'] })
    const unknown = reviewDraft([{ name: 'fullName', source: prop('middleName') }], A1, B1)
    expect(unknown.fields[0]!.state).toBe('problem')
    expect(unknown.problems).toEqual(['fullName: The input has no field “middleName”.'])
  })

  it('keeps properties the target doesn’t ask for, and says why each one is there', () => {
    const draft: MappingProperty[] = [
      { name: 'nickname', source: prop('firstName') },
      { name: 'fullName', source: prop('lastName') },
      { name: 'fullName', source: prop('firstName') },
      { name: '', source: text('x') },
    ]
    const review = reviewDraft(draft, A1, B1)
    expect(review.fields[0]).toMatchObject({ index: 1, state: 'set' })
    expect(review.extras).toEqual([
      { index: 0, reason: 'Definition B · v1 has no field “nickname”, so the Transform’s output would be rejected.' },
      { index: 2, reason: 'Another value already makes fullName.' },
      { index: 3, reason: 'It has no name.' },
    ])
    // Reviewing and round-tripping keep them, exactly.
    same(fromDraft(toDraft(draft)), draft)
  })

  it('shows a problem at the part it’s about, not at the group around it', () => {
    const source = joined([prop('firstName'), { kind: 'literal', value: 7 }], '')
    const issues = checkMapping({ properties: [{ name: 'fullName', source }] }, A1).issues
    const piece = toPiece(source)
    const [first, second] = partPaths(piece, ['fullName'])
    expect(ownIssues(piece, ['fullName'], issues)).toEqual([])
    expect(ownIssues((piece as Extract<Piece, { kind: 'combine' }>).parts[1]!, second!, issues).map(friendlyIssue)).toEqual(['Only text can be combined. This is a number.'])
    expect(ownIssues((piece as Extract<Piece, { kind: 'combine' }>).parts[0]!, first!, issues)).toEqual([])
    // A trimmed group's parts sit one step further in.
    expect(partPaths({ ...piece, trim: true } as Piece, ['fullName'])[0]).toEqual(['fullName', 'trim', 0, 'join', 0, 0])
  })
})
