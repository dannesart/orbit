// Guided flow and the minimal inspector (Related to #41): Structure offers "Continue to Mapping"
// only when there is mapping work, both tabs stay free, the latest run sits behind one status
// button, every output property is one row that opens Mapping at it (nothing is edited in the
// inspector), and the current preview is never mistaken for a run.
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

  it('opens Mapping at the first property with work, only when asked, and both tabs stay free', () => {
    const editor = source('FocusEditor.vue')
    expect(editor).toMatch(/<div v-if="work\.length"[^>]*>\s*<button[^>]*data-continue-mapping[^>]*@click="continueToMapping">Continue to Mapping/)
    expect(editor).toMatch(/function continueToMapping\(\) \{\s*emit\('update:property', work\.value\[0\]!\)\s*emit\('update:mode', 'mapping'\)/)
    // Nothing switches tabs by itself: the mode changes only from these clicks.
    expect(editor.match(/emit\('update:mode', '(mapping|structure)'\)/g)!.sort()).toEqual([
      "emit('update:mode', 'mapping')", "emit('update:mode', 'mapping')", "emit('update:mode', 'structure')", "emit('update:mode', 'structure')",
    ])
    expect(editor).not.toMatch(/watch\([^)]*mode/)
  })
})

describe('The minimal inspector: a tool, not a report', () => {
  const inspector = source('TransformInspector.vue')

  it('has a compact header: number, title, applied Mapping version, run status and Close, and nothing else', () => {
    const header = inspector.slice(inspector.indexOf('<!-- Header -->'), inspector.indexOf('<div class="min-h-0 flex-1 overflow-y-auto'))
    expect(header).toMatch(/\{\{ badge \}\}<\/span>[\s\S]*?>Transform<\/h2>\s*<p[^>]*>Mapping v\{\{ config\.mapping\.version \}\}<\/p>[\s\S]*?<RunStatus [\s\S]*?aria-label="Close the Transform inspector"/)
    expect(header).not.toMatch(/Feature|descriptions|Builds a new Value/)
    // The shared header (Feature label, description) is for the other steps only.
    expect(source('SpatialDesigner.vue')).toMatch(/<div v-if="selectedId !== 'transform'" class="flex items-start gap-3/)
    expect(source('SpatialDesigner.vue')).toMatch(/:badge="panelTitle\.badge"[\s\S]*?@close="closeInspector"/)
  })

  it('puts the latest run behind one square status button: every outcome, with an accessible name and a popover', () => {
    const status = source('RunStatus.vue')
    expect(status).toMatch(/class="grid size-9 shrink-0 place-items-center rounded-xl border/)
    expect(status).toMatch(/:aria-label="`Latest run: \$\{state\.label\}, run \$\{runNumber\}`"/)
    expect(status).toMatch(/aria-haspopup="dialog"\s*:aria-expanded="open"/)
    expect(status).toMatch(/@keydown\.escape\.stop="close\(true\)"/)
    // The popover: what executed, the exact versions, what changed since, and the evidence.
    expect(status).toMatch(/role="dialog" aria-label="Latest run"/)
    expect(status).toMatch(/\{\{ state\.label \}\} · Run \{\{ runNumber \}\}/)
    expect(status).toMatch(/\{\{ label\(run\.output\) \}\}[\s\S]*?Mapping v\{\{ run\.mapping\.version \}\}/)
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
    expect(inspector).toMatch(/<span>\{\{ definitionLabel\(input\) \}\}<\/span>\s*<span aria-hidden="true"[^>]*>→<\/span>\s*<span class="sr-only">makes<\/span>\s*<span[^>]*>\{\{ target\.label \}\}<\/span>/)
    expect(inspector).not.toMatch(/>Reads</)
    expect(inspector.replace('<span class="sr-only">makes</span>', '')).not.toMatch(/>makes</)
  })

  it('has one Output heading with its count and a square pencil, Edit output, opening Structure; focus returns to it', () => {
    const section = inspector.slice(inspector.indexOf('<section aria-labelledby="output-heading"'), inspector.indexOf('</section>', inspector.indexOf('output-heading')))
    expect(section).toMatch(/>Output<\/h3>\s*<span[^>]*>\{\{ mapped \}\}\/\{\{ review\.fields\.length \}\}<\/span>/)
    expect(section).toMatch(/<button\s*type="button"\s*data-open-editor\s*aria-label="Edit output"\s*title="Edit output"[\s\S]*?@click="emit\('focus', 'structure', null\)"\s*>\s*<DesignerIcon name="pencil"/)
    expect((source('SpatialDesigner.vue') + inspector).match(/data-open-editor(?!\])/g)).toHaveLength(1)
  })

  it('lists every property the same way: one row opening the editor, with nothing to edit inline', () => {
    const rows = source('PropertyRows.vue')
    // One kind of row whatever makes the value: no inline controls, and no per-property value
    // (the Preview shows the values).
    expect(rows.match(/<button/g)).toHaveLength(1)
    expect(rows).toMatch(/<button\s*type="button"\s*:data-property-row="r\.name"[\s\S]*?:aria-label="r\.label"\s*@click="emit\('open', r\.opens\)"\s*>/)
    expect(rows).toMatch(/\{\{ r\.name \|\| '\(no name\)' \}\}<\/span>\s*<span[^>]*>\{\{ r\.type \}\}<\/span>[\s\S]*?\{\{ r\.summary \}\}[\s\S]*?\{\{ r\.problem \}\}[\s\S]*?<DesignerIcon name="chevron"/)
    expect(rows).not.toMatch(/<select|<input|ShownText|update:draft/)
    expect(inspector).toMatch(/<PropertyRows :draft="draft" :review="review" @open="emit\('focus', \$event\.mode, \$event\.property\)" \/>/)
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
    // Every kind opens Mapping at exactly its own property.
    for (const r of rows) expect(r.opens).toEqual({ mode: 'mapping', property: r.name })
    // A missing value and an actual error stay identifiable: in view, and in the row's name.
    expect(by('email')).toMatchObject({ problem: '', label: 'email, text, Not mapped. Edit in Mapping' })
    expect(by('middle').problem).toMatch(/middleName/)
    expect(by('size').problem).toBe('Card needs a number here, but this makes text.')
    expect(by('size').label).toBe('size, number, Needs attention: firstName. Card needs a number here, but this makes text. Edit in Mapping')
    expect(by('fullName').label).toBe('fullName, text, Mapped: firstName + a space + lastName. Edit in Mapping')
    for (const r of rows.filter((x) => x.state !== 'problem')) expect(r.problem).toBe('')
    // A property without a name yet (an output being drafted) can only be named, in Structure.
    const unnamed = { ...target, fields: [{ name: '', type: 'string' as const }] }
    const [row] = propertyRows(draft, reviewDraft([], A1, unnamed, 'Unnamed'))
    expect(row!.opens).toEqual({ mode: 'structure', property: null })
    expect(row!.label).toBe('(no name), text, Not mapped. Name it in Structure')
  })

  it('returns focus to the row the editor was opened from, or else to Edit output', () => {
    const page = source('SpatialDesigner.vue')
    expect(page).toMatch(/function openFocus\(mode: 'mapping' \| 'structure', property: string \| null\) \{\s*origin = property/)
    expect(page).toMatch(/const row = origin === null \? null : inspector\.value\?\.querySelector<HTMLElement>\(`\[data-property-row="\$\{CSS\.escape\(origin\)\}"\]`\)\s*;\(row \?\? inspector\.value\?\.querySelector<HTMLElement>\('\[data-open-editor\]'\)\)\?\.focus\(\)/)
  })

  it('keeps choosing a field and typing a fixed value in the full Mapping editor', () => {
    const editors = ['ScalarEditor.vue', 'PieceEditor.vue', 'ValuePicker.vue'].map(source).join('\n')
    expect(editors).toMatch(/<select/)
    expect(editors).toMatch(/<input/)
    expect(editors).toMatch(/role="radiogroup" :aria-label="`\$\{label\}: yes or no`"/)
  })

  it('heads the preview “Preview · Not executed”, says the rest on demand, and keeps a real mismatch in view', () => {
    const preview = source('PreviewObject.vue')
    expect(preview).toMatch(/>Preview<\/h3>[\s\S]*?:aria-expanded="about" aria-controls="preview-about" @click="about = !about">Not executed<\/button>/)
    expect(preview).toMatch(/<p v-if="about" id="preview-about"[^>]*>\s*This draft, with Record A’s data\. Nothing has run\./)
    expect(preview).toMatch(/<p v-if="fit === false" class="mt-1\.5 text-xs text-red-700">/)
    expect(preview).not.toMatch(/uppercase|Latest run/)
  })

  it('keeps Undo as an icon button and says what Apply does only when there is something to apply', () => {
    const bar = source('ApplyBar.vue')
    expect(bar).toMatch(/aria-label="Undo"\s*title="Undo"\s*:disabled="!canUndo"\s*@click="emit\('undo'\)"\s*>\s*<DesignerIcon name="undo"/)
    expect(bar).toMatch(/:class="plan\.changes \? 'font-medium text-amber-800' : 'sr-only'"/)
    expect(bar).toMatch(/to fix before applying/)
  })
})
