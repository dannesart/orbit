// Switching the Transform's output Definition (Related to #38, #41): the draft is reconciled
// against the chosen Definition, mappings that don't fit are set aside (never applied, never
// lost), nothing is made up, and versions and evidence already made stay exactly as they were.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { type Data, type DefinitionVersion, type Field, defineVersion, refOf } from '../shared/features/definitions'
import type { Expression } from '../shared/features/mappings'
import { orbitConsole } from '../shared/features/features'
import { A1, B1, INITIAL_DATA, INITIAL_MAPPING, RECORD_ID, WORKSPACE, runExperiment } from '../app/dev/features/experiment'
import {
  type Configuration, type Offered, type TransformDraft, allDefinitions, draftFrom, findMapping,
  initialConfiguration, outputOf, planApply, scopeOf,
} from '../app/dev/designer/config'
import { type Piece, fromDraft, toPiece } from '../app/dev/designer/parts'
import { reviewDraft } from '../app/dev/designer/preview'
import { asideReason, reconcile } from '../app/dev/designer/switching'
import { draftLoses } from '../app/dev/designer/session'
import { describeSource } from '../app/dev/designer/summary'
import { applyFor } from './apply'

const prop = (name: string): Expression => ({ kind: 'property', name })
const piece = (e: Expression): Piece => toPiece(e)
const define = (id: string, name: string, fields: Field[]): DefinitionVersion => defineVersion({ id, version: 1, name, workspaceId: WORKSPACE, fields })

const CONTACT = define('def-contact', 'Contact', [{ name: 'fullName', type: 'string' }, { name: 'email', type: 'string' }, { name: 'subscribed', type: 'boolean' }])
const BADGE = define('def-badge', 'Badge', [{ name: 'code', type: 'string' }, { name: 'fullName', type: 'number' }])
const LOOKALIKE = define('def-lookalike', 'Look-alike', [{ name: 'full name', type: 'string' }, { name: 'FullName', type: 'string' }])
const offered: Offered[] = [CONTACT, BADGE, LOOKALIKE].map((definition) => ({ definition, name: definition.name, source: 'workspace' }))

/** What choosing a Definition in Structure does: the draft reconciled against it. */
function choose(config: Configuration, draft: TransformDraft, d: DefinitionVersion): TransformDraft {
  const next: TransformDraft = { ...draft, use: 'catalogue', catalogue: refOf(d) }
  return reconcile(next, A1, outputOf(config, next, scopeOf(config, WORKSPACE)).definition)
}
const review = (config: Configuration, draft: TransformDraft) => reviewDraft(fromDraft(draft.properties), A1, outputOf(config, draft, scopeOf(config, WORKSPACE)).definition)
const named = (draft: TransformDraft, name: string) => draft.properties.find((p) => p.name === name)
const names = (list: TransformDraft['properties'] | undefined) => (list ?? []).map((p) => p.name)
function run(config: Configuration) {
  const catalog = { definitions: allDefinitions(config), records: [{ id: RECORD_ID, workspaceId: WORKSPACE, definition: A1, data: INITIAL_DATA as Data }], mappings: config.mappings }
  return runExperiment(catalog, { console: orbitConsole, mapping: config.mapping })
}

describe('Choosing another output Definition', () => {
  const config = initialConfiguration(offered)
  const start = draftFrom(config) // Definition B: fullName ← trim(firstName) + " " + lastName

  it('shows the chosen Definition’s properties at once, keeps a mapping that genuinely fits, and leaves the rest unmapped', () => {
    const contact = choose(config, start, CONTACT)
    expect(outputOf(config, contact, scopeOf(config, WORKSPACE)).definition.fields.map((f) => f.name)).toEqual(['fullName', 'email', 'subscribed'])
    // Same name, and it makes text where Contact wants text: kept, exactly (the same object).
    expect(named(contact, 'fullName')).toBe(start.properties[0])
    // New required properties: unmapped. Nothing is made up for them.
    expect(names(contact.properties)).toEqual(['fullName'])
    expect(review(config, contact)).toMatchObject({ missing: ['email', 'subscribed'], errors: [], extras: [] })
  })

  it('sets aside what doesn’t fit, takes it out of validation, and brings it back on the way back', () => {
    let draft = choose(config, start, CONTACT)
    draft = { ...draft, properties: [...draft.properties, { name: 'email', piece: piece(prop('lastName')) }, { name: 'subscribed', piece: { kind: 'literal', value: true } }] }
    expect(review(config, draft).problems).toEqual([])
    const authored = draft.properties

    const badge = choose(config, draft, BADGE)
    // fullName exists on Badge, but as a number: the text mapping doesn't become valid there.
    expect(badge.properties).toEqual([])
    expect(names(badge.aside)).toEqual(['fullName', 'email', 'subscribed'])
    const checked = review(config, badge)
    expect(checked).toMatchObject({ missing: ['code', 'fullName'], errors: [], extras: [] })
    expect(checked.problems.join(' ')).not.toMatch(/email|subscribed/)

    // Back to Contact: every expression returns, exactly as it was written.
    const back = choose(config, badge, CONTACT)
    expect(back.properties).toHaveLength(3)
    for (const p of authored) expect(named(back, p.name)).toBe(p)
    expect(back.aside).toEqual([])
    expect(review(config, back).problems).toEqual([])
  })

  it('keeps work done for the other Definition too, so switching back and forth loses nothing', () => {
    const contact = choose(config, start, CONTACT)
    const badge = choose(config, contact, BADGE)
    const code = { name: 'code', piece: piece(prop('lastName')) }
    const mapped = { ...badge, properties: [...badge.properties, code] }
    const again = choose(config, choose(config, mapped, CONTACT), BADGE)
    expect(named(again, 'code')).toBe(code)
    // Nothing was copied or duplicated along the way.
    expect(again.properties.length + (again.aside?.length ?? 0)).toBe(mapped.properties.length + (mapped.aside?.length ?? 0))
  })

  it('never matches by a label that only looks similar', () => {
    const lookalike = choose(config, start, LOOKALIKE)
    expect(lookalike.properties).toEqual([])
    expect(review(config, lookalike).missing).toEqual(['full name', 'FullName'])
    expect(asideReason(lookalike.aside![0]!, A1, LOOKALIKE, 'Look-alike · v1')).toBe('Look-alike · v1 has no fullName.')
    expect(asideReason(choose(config, start, BADGE).aside![0]!, A1, BADGE, 'Badge · v1')).toBe('It makes text, and fullName here is a number.')
  })

  it('keeps a mapping with a problem of its own where its name fits: shown as a problem, not hidden', () => {
    const broken: TransformDraft = { ...start, properties: [{ name: 'fullName', piece: piece(prop('middleName')) }] }
    const contact = choose(config, broken, CONTACT)
    expect(names(contact.properties)).toEqual(['fullName'])
    expect(review(config, contact).errors).toEqual(['fullName: The input has no field “middleName”.'])
  })
})

describe('Applying after a switch', () => {
  it('makes a new Mapping for the chosen Definition from the active mappings only, and leaves earlier versions and evidence alone', () => {
    const config = initialConfiguration(offered)
    const before = run(config)
    const evidence = JSON.parse(JSON.stringify(before[1]!.evidence))
    expect(before[1]!.evidence.mapping).toEqual({ id: INITIAL_MAPPING.id, version: 1 })

    // Contact, fully mapped, while Badge's work sits aside: it must not be applied.
    let draft = choose(config, draftFrom(config), BADGE)
    draft = { ...draft, properties: [{ name: 'code', piece: piece(prop('lastName')) }] }
    draft = choose(config, draft, CONTACT)
    draft = { ...draft, properties: [...draft.properties, { name: 'email', piece: piece(prop('lastName')) }, { name: 'subscribed', piece: { kind: 'literal', value: false } }] }
    expect(names(draft.aside)).toEqual(['code'])

    const plan = planApply(config, draft, WORKSPACE)
    expect(plan).toMatchObject({ output: { ref: refOf(CONTACT), isNew: false }, mapping: { id: `transform:${CONTACT.id}@1`, version: 1, isNew: true }, changes: true })
    const applied = applyFor(config, draft)
    const made = findMapping(applied, applied.mapping)!
    expect(made.properties.map((p) => p.name)).toEqual(['fullName', 'email', 'subscribed'])
    expect(made.to).toEqual(refOf(CONTACT))

    // The earlier Mapping version is the very same frozen object; the earlier run's evidence is unchanged.
    expect(findMapping(applied, { id: INITIAL_MAPPING.id, version: 1 })).toBe(INITIAL_MAPPING)
    expect(Object.isFrozen(INITIAL_MAPPING)).toBe(true)
    expect(JSON.parse(JSON.stringify(before[1]!.evidence))).toEqual(evidence)

    // The new run names the new Mapping and Contact v1, and succeeds.
    const after = run(applied)
    expect(after[1]!.evidence).toMatchObject({ outcome: { kind: 'succeeded' }, mapping: { id: `transform:${CONTACT.id}@1`, version: 1 } })
    expect(after[1]!.output).toEqual({ definition: refOf(CONTACT), data: { fullName: 'Ada Lovelace', email: 'Lovelace', subscribed: false } })
  })

  it('switching back to the applied Definition and its mappings has nothing to apply', () => {
    const config = initialConfiguration(offered)
    const back = choose(config, choose(config, draftFrom(config), BADGE), B1)
    expect(planApply(config, back, WORKSPACE).changes).toBe(false)
  })
})

describe('Incomplete is not wrong', () => {
  it('tells what’s still missing apart from actual errors', () => {
    expect(reviewDraft([], A1, B1)).toMatchObject({ missing: ['fullName'], errors: [] })
    // While editing (no switch), a wrong type stays where it was written and is an error.
    const wrong = reviewDraft([{ name: 'fullName', source: { kind: 'literal', value: 7 } }], A1, CONTACT, 'Contact · v1')
    expect(wrong.missing).toEqual(['email', 'subscribed'])
    expect(wrong.errors).toEqual(['fullName: Contact · v1 needs text here, but this makes a number.'])
  })
})

describe('Resetting the draft says what it would lose, and only then asks', () => {
  const config = initialConfiguration(offered)
  const start = draftFrom(config)

  it('loses nothing when only the chosen Definition changed', () => {
    expect(draftLoses(choose(config, start, CONTACT), draftFrom(config))).toEqual([])
    expect(draftLoses(start, draftFrom(config))).toEqual([])
  })

  it('names unapplied mappings, set-aside mappings and changes to the own output', () => {
    let draft = choose(config, start, CONTACT)
    draft = { ...draft, properties: [...draft.properties, { name: 'email', piece: piece(prop('lastName')) }] }
    expect(draftLoses(draft, draftFrom(config))).toEqual(['1 mapping you haven’t applied'])
    // Switched on to Badge: the applied fullName mapping and the new email mapping wait aside.
    const badge = choose(config, draft, BADGE)
    expect(draftLoses(badge, draftFrom(config))).toEqual(['1 mapping set aside when you switched Definitions'])
    const local: TransformDraft = { ...start, use: 'local', local: { ...start.local, name: 'Badge text' } }
    expect(draftLoses(local, draftFrom(config))).toEqual(['Changes to the Transform’s own output'])
  })
})

describe('The calm editor', () => {
  const designer = join(__dirname, '../app/dev/designer')
  const read = (file: string) => readFileSync(join(designer, file), 'utf8')

  it('has no way to apply a draft that is incomplete or wrong', () => {
    expect(read('ApplyBar.vue')).not.toMatch(/anyway/i)
    // Behaviour: Apply itself refuses, whoever calls it (apply-authority.test.ts has every case).
    const config = initialConfiguration(offered)
    const incomplete = { ...draftFrom(config), catalogue: refOf(CONTACT), properties: [{ name: 'fullName', piece: piece(prop('firstName')) }] }
    expect(() => applyFor(config, incomplete)).toThrow(/refused \(incomplete\)/)
    const wrong = { ...draftFrom(config), properties: [{ name: 'fullName', piece: piece(prop('middleName')) }] }
    expect(() => applyFor(config, wrong)).toThrow(/refused \(invalid\)/)
  })

  it('calls a yes-or-no property the same everywhere people see it', () => {
    const surfaces = [designer, join(__dirname, '../app/dev/definitions')]
    for (const dir of surfaces) {
      for (const file of readdirSync(dir).filter((f) => /\.(vue|ts)$/.test(f) && f !== 'parts.ts')) {
        expect(readFileSync(join(dir, file), 'utf8'), file).not.toMatch(/true or false|a boolean/i)
      }
    }
    expect(describeSource({ kind: 'literal', value: true })).toBe('yes')
    expect(reviewDraft([{ name: 'subscribed', source: { kind: 'literal', value: 'yes' } }], A1, define('def-flag', 'Flag', [{ name: 'subscribed', type: 'boolean' }]), 'Flag · v1').errors)
      .toEqual(['subscribed: Flag · v1 needs yes or no here, but this makes text.'])
  })
})
