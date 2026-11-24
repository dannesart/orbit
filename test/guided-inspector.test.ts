// Guided flow and compact inspector (Related to #41): Structure offers "Continue to Mapping" only
// when there is mapping work, both tabs stay free, the inspector shows the latest run in one row
// with its evidence a click away, the editor opens from a pencil by the title, and the current
// preview is never mistaken for a run.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { type Data, deepFreeze } from '../shared/features/definitions'
import { orbitConsole } from '../shared/features/features'
import { A1, B1, INITIAL_DATA, INITIAL_MAPPING, RECORD_ID, WORKSPACE, runExperiment } from '../app/dev/features/experiment'
import { mappingWork, reviewDraft } from '../app/dev/designer/preview'
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
    expect(source('SpatialDesigner.vue')).toMatch(/function closeFocus\(\) \{\s*focus\.value = null\s*nextTick\(\(\) => inspector\.value\?\.querySelector<HTMLElement>\('\[data-open-editor\]'\)\?\.focus\(\)\)/)
  })

  it('keeps property rows: a composed row opens Mapping at it, a simple one keeps its inline controls and a chevron', () => {
    const rows = source('QuickMappings.vue')
    expect(rows).toMatch(/v-if="f\.name && quickOf\(pieceAt\(f\.index\)\)\.kind === 'composed'"\s*type="button"\s*data-compose-row[\s\S]*?:aria-label="`\$\{f\.name\}, \$\{typeWords\[f\.expected\]\}, \$\{status\[f\.state\]\.label\}: \$\{describeSource\(fromPiece\(pieceAt\(f\.index\)!\)\)\}\. Edit in Mapping`"\s*@click="emit\('edit', f\.name\)"/)
    expect(rows).toMatch(/:aria-label="`Compose \$\{f\.name\} in Mapping`"[\s\S]*?@click="emit\('edit', f\.name\)"\s*>\s*<DesignerIcon name="chevron"/)
    expect(rows).toMatch(/:aria-label="`\$\{f\.name\}: where its value comes from`"/)
    expect(rows).not.toMatch(/>\s*Compose\s*</)
    expect(inspector).toMatch(/<QuickMappings [^>]*@update:draft="emit\('update:draft', \$event\)" @edit="emit\('focus', 'mapping', \$event\)" \/>/)
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
