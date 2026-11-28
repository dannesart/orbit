// Guided flow and the minimal inspector (Related to #41): mapping work is known only when the
// structure is sound, the latest run sits behind one status button, every output property is one
// row that opens Mapping Studio at it (nothing is edited in the inspector), and the current preview
// is never mistaken for a run. The inspector's header and actions are rendered in
// inspector-simplified.test.ts.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { type Data, deepFreeze, defineVersion } from '../shared/features/definitions'
import { orbitConsole } from '../shared/features/features'
import type { Expression } from '../shared/features/mappings'
import { A1, B1, INITIAL_DATA, INITIAL_MAPPING, RECORD_ID, WORKSPACE, runExperiment } from '../app/dev/features/experiment'
import { type TransformDraft, draftFrom, initialConfiguration } from '../app/dev/designer/config'
import { fromDraft, toPiece } from '../app/dev/designer/parts'
import { mappingWork, reviewDraft } from '../app/dev/designer/preview'
import { propertyRows } from '../app/dev/designer/rows'
import { runState } from '../app/dev/designer/summary'

const designer = join(import.meta.dirname, '../app/dev/designer')
const source = (file: string) => readFileSync(join(designer, file), 'utf8')
const run = (mappings = [INITIAL_MAPPING], data: Data = INITIAL_DATA) =>
  runExperiment({ definitions: [A1, B1], records: [{ id: RECORD_ID, workspaceId: WORKSPACE, definition: A1, data }], mappings }, { console: orbitConsole, mapping: { id: INITIAL_MAPPING.id, version: 1 } })

describe('Structure → Mapping', () => {
  it('offers Mapping only when the structure is sound and properties still need a value or have a problem', () => {
    expect(mappingWork(reviewDraft(INITIAL_MAPPING.properties, A1, B1), [])).toEqual([])
    expect(mappingWork(reviewDraft([], A1, B1), [])).toEqual(['fullName'])
    expect(mappingWork(reviewDraft([{ name: 'fullName', source: { kind: 'property', name: 'middleName' } }], A1, B1), [])).toEqual(['fullName'])
    // A structure that isn't a valid Definition yet comes first: nothing to continue to.
    expect(mappingWork(reviewDraft([], A1, B1), ['Give the output a name.'])).toEqual([])
  })

})

describe('The minimal inspector: a tool, not a report', () => {
  const inspector = source('TransformInspector.vue')


  it('puts the latest run behind one square status button: every outcome, with an accessible name and a popover', () => {
    const status = source('RunStatus.vue')
    expect(status).toMatch(/class="grid size-9 shrink-0 place-items-center rounded-xl border/)
    expect(status).toMatch(/:aria-label="`Latest run: \$\{state\.label\}, run \$\{runNumber\}`"/)
    expect(status).toMatch(/aria-haspopup="dialog"\s*:aria-expanded="open"/)
    expect(status).toMatch(/@keydown\.escape\.stop="close\(true\)"/)
    // The popover: what executed, the exact versions, what changed since, and the evidence.
    expect(status).toMatch(/role="dialog" aria-label="Latest run"/)
    expect(status).toMatch(/\{\{ state\.label \}\} · Run \{\{ runNumber \}\}/)
    expect(status).toMatch(/run\.feature && `Feature v\$\{run\.feature\.version\}`, run\.mapping && `Mapping v\$\{run\.mapping\.version\}`/)
    expect(status).toMatch(/>Made \{\{ label\(run\.output\) \}\}</)
    expect(status).toMatch(/v-if="stale"[^>]*>Things changed since this run\./)
    expect(status).toMatch(/v-else-if="unapplied"[^>]*>Your draft isn’t applied\. Runs use the applied versions\./)
    expect(status).toMatch(/@click="evidence">Evidence</)
    expect(inspector).toMatch(/<RunStatus [^>]*:unapplied="plan\.changes"[^>]*@evidence="showEvidence" \/>/)
    expect(inspector).toMatch(/<RunHistory id="transform-evidence"/)
    expect(inspector).not.toMatch(/Latest run<\/h3>/)

    expect(runState(null)).toMatchObject({ label: 'Not invoked', icon: 'minus' })
    const [, ok] = run()
    expect(runState(ok)).toMatchObject({ label: 'Succeeded', icon: 'check' })
    expect(runState(ok).tone).toMatch(/emerald/)
    const [, refused] = run([deepFreeze({ ...INITIAL_MAPPING, properties: [{ name: 'fullName', source: { kind: 'property', name: 'middleName' } }] })])
    expect(runState(refused)).toMatchObject({ label: 'Not attempted', icon: 'clock' })
    const [, failed] = run([deepFreeze({ ...INITIAL_MAPPING, properties: [{ name: 'fullName', source: { kind: 'literal', value: 7 } }] })])
    expect(runState(failed)).toMatchObject({ label: 'Failed', icon: 'error' })
    expect(runState(failed).tone).toMatch(/red/)
    // The evidence still names the exact versions; the button only summarizes it.
    expect(ok!.evidence.mapping).toEqual({ id: INITIAL_MAPPING.id, version: 1 })
    expect(ok!.evidence.output).toEqual({ definition: { id: B1.id, version: 1 } })
  })

  it('shows input → output with exact versions, without “Reads” and “makes”', () => {
    expect(inspector).toMatch(/<span>\{\{ assessment\.from\.label \}\}<\/span>\s*<span aria-hidden="true"[^>]*>→<\/span>\s*<span class="sr-only">makes<\/span>\s*<span[^>]*>\{\{ target\.label \}\}<\/span>/)
    expect(inspector).not.toMatch(/>Reads</)
    expect(inspector.replace('<span class="sr-only">makes</span>', '')).not.toMatch(/>makes</)
  })


  it('lists every property the same way: one row opening Mapping Studio, with nothing to edit inline', () => {
    const rows = source('PropertyRows.vue')
    // One kind of row whatever makes the value, with its example value beside it: no inline controls.
    // Besides the rows, only the two toggles (where the values come from, and the JSON view).
    expect(rows.match(/<button/g)).toHaveLength(3)
    expect(rows).toMatch(/<button\s*type="button"\s*:data-property-row="r\.name"[\s\S]*?:aria-label="r\.label"\s*@click="emit\('open', r\.opens\)"\s*>/)
    expect(rows).toMatch(/\{\{ r\.name \|\| '\(no name\)' \}\}<\/span>\s*<span[^>]*>\{\{ r\.type \}\}<\/span>[\s\S]*?data-row-example[\s\S]*?\{\{ r\.summary \}\}[\s\S]*?\{\{ r\.problem \}\}[\s\S]*?<DesignerIcon name="chevron"/)
    expect(rows).not.toMatch(/<select|<input|update:draft/)
    expect(inspector).toMatch(/<PropertyRows class="mt-5" :draft="draft" :review="review" :output="output" :example="example" :target="target" :problems="problems\.length" @open="emit\('studio', \$event\)" \/>/)
    expect(inspector).not.toMatch(/'update:draft'/)
    expect(source('SpatialDesigner.vue').match(/<TransformInspector[\s\S]*?\/>/)![0]).not.toMatch(/@update:draft/)
  })

  it('describes a field, fixed values, a composition, a missing value and errors truthfully; each opens its own property', () => {
    const target = defineVersion({ id: 'def-card', version: 1, name: 'Card', workspaceId: WORKSPACE, fields: [
      { name: 'first', type: 'string' }, { name: 'code', type: 'string' }, { name: 'active', type: 'boolean' }, { name: 'count', type: 'number' },
      { name: 'fullName', type: 'string' }, { name: 'email', type: 'string' }, { name: 'middle', type: 'string' }, { name: 'size', type: 'number' },
    ] })
    const field = (name: string): Expression => ({ kind: 'property', name })
    const fullName: Expression = { kind: 'call', fn: 'join', args: [{ kind: 'list', items: [field('firstName'), { kind: 'literal', value: ' ' }, field('lastName')] }, { kind: 'literal', value: '' }] }
    const sources: [string, Expression][] = [
      ['first', field('firstName')],
      ['code', { kind: 'literal', value: 'AL' }],
      ['active', { kind: 'literal', value: true }],
      ['count', { kind: 'literal', value: 3 }],
      ['fullName', fullName],
      ['middle', field('middleName')],
      ['size', field('firstName')],
    ]
    const draft: TransformDraft = { ...draftFrom(initialConfiguration()), properties: sources.map(([name, e]) => ({ name, piece: toPiece(e) })) }
    const rows = propertyRows(draft, reviewDraft(fromDraft(draft.properties), A1, target, 'Card'))
    const by = (name: string) => rows.find((r) => r.name === name)!

    expect(rows.map((r) => [r.name, r.type, r.state, r.summary])).toEqual([
      ['first', 'text', 'set', 'firstName'],
      ['code', 'text', 'set', '“AL”'],
      ['active', 'yes or no', 'set', 'yes'],
      ['count', 'number', 'set', '3'],
      ['fullName', 'text', 'set', 'firstName + a space + lastName'],
      ['email', 'text', 'not_set', 'Not mapped'],
      ['middle', 'text', 'problem', 'middleName'],
      ['size', 'number', 'problem', 'firstName'],
    ])
    // Every kind opens Mapping Studio's Mapping at exactly its own property.
    for (const r of rows) expect(r.opens).toEqual({ segment: 'mapping', property: r.name })
    // A missing value and an actual error stay identifiable: in view, and in the row's name.
    expect(by('email')).toMatchObject({ problem: '', label: 'email, text, Not mapped. Edit in Mapping Studio' })
    expect(by('middle').problem).toMatch(/middleName/)
    expect(by('size').problem).toBe('Card needs a number here, but this makes text.')
    expect(by('size').label).toBe('size, number, Needs attention: firstName. Card needs a number here, but this makes text. Edit in Mapping Studio')
    expect(by('fullName').label).toBe('fullName, text, Mapped: firstName + a space + lastName. Edit in Mapping Studio')
    for (const r of rows.filter((x) => x.state !== 'problem')) expect(r.problem).toBe('')
    // A property without a name yet (an output being drafted) can only be named, in General.
    const unnamed = { ...target, fields: [{ name: '', type: 'string' as const }] }
    const [row] = propertyRows(draft, reviewDraft([], A1, unnamed, 'Unnamed'))
    expect(row!.opens).toEqual({ segment: 'general' })
    expect(row!.label).toBe('(no name), text, Not mapped. Name it in Mapping Studio')
  })

  it('returns focus to the row Mapping Studio was opened from, or else to its pencil', () => {
    const page = source('SpatialDesigner.vue')
    expect(page).toMatch(/function openStudio\(at: StudioOpening \| null = null\) \{\s*studioStart\.value = at\s*studioOrigin = at\?\.property \?\? null/)
    expect(page).toMatch(/const row = studioOrigin === null \? null : document\.querySelector<HTMLElement>\(`\[data-property-row="\$\{CSS\.escape\(studioOrigin\)\}"\]`\)\s*;\(row \?\? document\.querySelector<HTMLElement>\('\[data-edit-mapping\]'\)\)\?\.focus\(\)/)
  })

  it('keeps choosing a field and typing a fixed value in the full Mapping editor', () => {
    const editors = ['ScalarEditor.vue', 'PieceEditor.vue', 'ValuePicker.vue'].map(source).join('\n')
    expect(editors).toMatch(/<select/)
    expect(editors).toMatch(/<input/)
    expect(editors).toMatch(/role="radiogroup" :aria-label="`\$\{label\}: yes or no`"/)
  })

  it('says the example values aren’t executed, says the rest on demand, and keeps a real mismatch in view', () => {
    const output = source('PropertyRows.vue')
    expect(output).toMatch(/>Output<\/h3>[\s\S]*?:aria-expanded="about" aria-controls="preview-about" data-preview-about @click="about = !about">Not executed<\/button>/)
    expect(output).toMatch(/<p v-if="about" id="preview-about"[^>]*>\s*Example values: this draft, with Record A’s data\. Nothing has run\./)
    expect(output).toMatch(/<p v-if="fit === false" class="mt-1\.5 text-xs text-red-700">/)
    expect(output).not.toMatch(/uppercase|Latest run/)
  })

  it('keeps Undo, Cancel and Apply in Mapping Studio only; the inspector says unapplied changes and leads there', () => {
    const bar = source('StudioStatusBar.vue')
    expect(bar).toMatch(/aria-label="Undo" title="Undo" :disabled="!canUndo" @click="emit\('undo'\)"/)
    expect(bar).toMatch(/data-cancel @click="emit\('cancel'\)"/)
    expect(inspector).not.toMatch(/emit\('(apply|discard|undo)'\)|data-apply|aria-label="Undo"/)
    expect(inspector).toMatch(/<div v-if="plan\.changes"[^>]*data-unapplied[\s\S]*?data-review-changes @click="emit\('studio', null\)">Review in Mapping Studio<\/button>/)
  })
})
