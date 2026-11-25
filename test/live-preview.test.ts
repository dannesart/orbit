// The live Preview (issue #45): an illustrative example of the Definition being built, judged by
// Orbit's own validation. Never a Record, never guessed from names, never replacing what was typed.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { validate } from '../shared/features/definitions'
import { type DraftField, fieldsOf } from '../app/dev/definitions/model'
import { type ExampleEntries, previewResult, reconcile, resetEntries, sampleFor, shown } from '../app/dev/definitions/example'

const field = (key: number, name: string, type: DraftField['type'], optional = false): DraftField => ({ key, name, type, optional })
const FIELDS = [field(0, 'email', 'string'), field(1, 'age', 'number'), field(2, 'subscribed', 'boolean', true), field(3, 'nickname', 'string', true)]

describe('Generated examples', () => {
  it('are neutral values of the right kind, whatever the property is called', () => {
    const entries = resetEntries([field(0, 'email', 'string'), field(1, 'price', 'number'), field(2, 'vip', 'boolean')])
    expect(entries[0]).toEqual({ given: true, value: 'Example text', edited: false, type: 'string', raw: false })
    expect(entries[1]!.value).toBe('1')
    expect(entries[2]!.value).toBe(true)
    for (const name of ['email', 'firstName', 'invoice total', 'zip']) expect(resetEntries([field(0, name, 'string')])[0]!.value).toBe(sampleFor('string'))
  })

  it('fit the draft as generated: every property given, judged by Orbit’s own validation', () => {
    const result = previewResult(FIELDS, resetEntries(FIELDS), null)
    expect(result.data).toEqual({ email: 'Example text', age: 1, subscribed: true, nickname: 'Example text' })
    expect(result.issues).toEqual([])
    expect(validate({ id: 'x', version: 1, name: 'x', workspaceId: null, fields: fieldsOf({ basedOn: null, fields: FIELDS, nextKey: 4 }) }, result.data)).toEqual([])
  })
})

describe('Reconciling with a changing model', () => {
  const edited: ExampleEntries = { ...resetEntries(FIELDS), 0: { given: true, value: 'ada@example.com', edited: true, type: 'string', raw: false } }

  it('keeps what was typed through a rename, and drops removed properties', () => {
    const renamed = FIELDS.map((f) => (f.key === 0 ? { ...f, name: 'contact' } : f)).filter((f) => f.key !== 3)
    const next = reconcile(edited, renamed)
    expect(next[0]!.value).toBe('ada@example.com')
    expect(next[3]).toBeUndefined()
    expect(previewResult(renamed, next, null).data).toMatchObject({ contact: 'ada@example.com' })
  })

  it('gives new properties a generated value, and lets generated values follow a new type', () => {
    const next = reconcile(resetEntries(FIELDS), [...FIELDS.map((f) => (f.key === 1 ? { ...f, type: 'boolean' as const } : f)), field(4, 'notes', 'string')])
    expect(next[1]).toMatchObject({ type: 'boolean', value: true, edited: false })
    expect(next[4]).toMatchObject({ value: 'Example text', given: true })
  })

  it('never replaces an edited value when the type changes: the result says it no longer fits', () => {
    const typed: ExampleEntries = { ...resetEntries(FIELDS), 1: { given: true, value: '36', edited: true, type: 'number', raw: false } }
    const retyped = FIELDS.map((f) => (f.key === 1 ? { ...f, type: 'boolean' as const } : f))
    const next = reconcile(typed, retyped)
    expect(next[1]).toEqual(typed[1])
    expect(previewResult(retyped, next, null).byProperty.age).toBe('age should be yes or no, not text.')
  })

  it('keeps a left-out property left out when its generated value follows a new type', () => {
    const left: ExampleEntries = { ...resetEntries(FIELDS), 2: { ...resetEntries(FIELDS)[2]!, given: false } }
    expect(reconcile(left, FIELDS.map((f) => (f.key === 2 ? { ...f, type: 'string' as const } : f)))[2]).toMatchObject({ given: false, type: 'string' })
  })
})

describe('Absence, empty text, false and zero stay distinct', () => {
  const with_ = (key: number, change: Partial<ExampleEntries[number]>): ExampleEntries => ({ ...resetEntries(FIELDS), [key]: { ...resetEntries(FIELDS)[key]!, ...change, edited: true } })

  it('leaves an optional property out of the result entirely, and that fits', () => {
    const result = previewResult(FIELDS, with_(3, { given: false }), null)
    expect(Object.hasOwn(result.data, 'nickname')).toBe(false)
    expect(result.left).toEqual(['nickname'])
    expect(result.issues).toEqual([])
  })

  it('refuses a required property left out, in Orbit’s words', () => {
    const result = previewResult(FIELDS, with_(0, { given: false }), null)
    expect(Object.hasOwn(result.data, 'email')).toBe(false)
    expect(result.issues).toEqual(['email is missing, and it’s required.'])
    expect(result.byProperty.email).toBe('email is missing, and it’s required.')
  })

  it('keeps empty text, zero and No as values, not absence', () => {
    let entries = with_(0, { value: '' })
    entries = { ...entries, 1: { ...entries[1]!, value: '0', edited: true }, 2: { ...entries[2]!, value: false, edited: true } }
    const result = previewResult(FIELDS, entries, null)
    expect(result.data).toMatchObject({ email: '', age: 0, subscribed: false })
    expect(result.issues).toEqual([])
    expect([shown(''), shown(0), shown(false)]).toEqual(['“”', '0', 'No'])
  })
})

describe('Advanced testing', () => {
  it('sends a value exactly as typed text, to see a wrong kind refused', () => {
    const entries: ExampleEntries = { ...resetEntries(FIELDS), 1: { given: true, value: '36', edited: true, type: 'number', raw: true }, 2: { given: true, value: 'true', edited: true, type: 'boolean', raw: true } }
    const result = previewResult(FIELDS, entries, null)
    expect(result.data).toMatchObject({ age: '36', subscribed: 'true' })
    expect(result.issues).toEqual(['age should be a number, not text.', 'subscribed should be yes or no, not text.'])
  })

  it('adds information the Definition doesn’t define, and Orbit refuses it', () => {
    const result = previewResult(FIELDS, resetEntries(FIELDS), { name: 'favourite colour', text: 'blue' })
    expect(result.data).toMatchObject({ 'favourite colour': 'blue' })
    expect(result.issues).toEqual(['favourite colour isn’t one of its properties, so it isn’t accepted.'])
  })
})

describe('The Preview in the editor', () => {
  const root = join(import.meta.dirname, '..')
  const preview = readFileSync(join(root, 'app/dev/definitions/LivePreview.vue'), 'utf8')
  const example = readFileSync(join(root, 'app/dev/definitions/example.ts'), 'utf8')
  const editor = readFileSync(join(root, 'app/dev/definitions/DefinitionEditor.vue'), 'utf8')

  it('judges with Orbit’s own validation, not a second one', () => {
    expect(example).toMatch(/const issues = checkExample\(shape, data\)/)
    expect(example).not.toMatch(/typeof [^\n]*=== 'number'[^\n]*issues|missing:/)
    expect(preview).toContain('previewResult(props.fields, props.entries, props.extra)')
  })

  it('keeps the example in the editor, so switching segments keeps what was typed', () => {
    expect(editor).toContain('const example = ref<ExampleEntries>({})')
    expect(editor).toMatch(/watch\(\(\) => draft\.value\?\.fields, \(now\) => \(example\.value = reconcile\(example\.value, now \?\? \[\]\)\)/)
    expect(editor).toMatch(/<LivePreview[\s\S]*v-model:entries="example"/)
  })

  it('shows the Definition’s own appearance and a live verdict, with reset and advanced testing kept discreet', () => {
    expect(preview).toMatch(/<DefinitionTile :appearance="appearance"/)
    expect(preview).toMatch(/role="status" data-verdict/)
    expect(preview).toMatch(/aria-label="Reset the example"/)
    expect(preview).toMatch(/:aria-pressed="advanced"/)
    expect(preview).toMatch(/<div v-if="advanced"[^>]*data-advanced-panel/)
    expect(preview).toMatch(/<label v-if="advanced && f\.type !== 'string'"/)
  })
})
