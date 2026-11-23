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

describe('The inspector: orientation, not a second editor', () => {
  it('opens the same editor from a compact pencil by the title, named Edit Transform', () => {
    const page = source('SpatialDesigner.vue')
    expect(page).toMatch(/v-if="selectedId === 'transform'"\s*type="button"\s*data-open-editor\s*aria-label="Edit Transform"\s*title="Edit Transform"[\s\S]*?@click="openFocus\('mapping', null\)"/)
    expect(source('TransformInspector.vue')).not.toMatch(/Open the editor|data-open-editor/)
  })

  it('shows the latest run in one row, every outcome, with its evidence a click away', () => {
    const inspector = source('TransformInspector.vue')
    expect(inspector).toMatch(/<h3 id="latest-run-heading"[^>]*>Latest run<\/h3>/)
    expect(inspector).toMatch(/aria-controls="transform-evidence" @click="details = !details">\{\{ details \? 'Back' : 'Evidence' \}\}/)
    expect(inspector).toMatch(/<RunHistory v-if="details" id="transform-evidence"/)

    expect(runState(null)).toMatchObject({ label: 'Not invoked', icon: '○' })
    const [, ok] = run()
    expect(runState(ok)).toMatchObject({ label: 'Succeeded', icon: '✓' })
    const [, refused] = run([deepFreeze({ ...INITIAL_MAPPING, properties: [{ name: 'fullName', source: { kind: 'property', name: 'middleName' } }] })])
    expect(runState(refused)).toMatchObject({ label: 'Not attempted', icon: '!' })
    const [, failed] = run([deepFreeze({ ...INITIAL_MAPPING, properties: [{ name: 'fullName', source: { kind: 'literal', value: 7 } }] })])
    expect(runState(failed)).toMatchObject({ label: 'Failed', icon: '✕' })
    // The evidence still names the exact versions; the row only summarizes it.
    expect(ok!.evidence.mapping).toEqual({ id: INITIAL_MAPPING.id, version: 1 })
    expect(ok!.evidence.output).toEqual({ definition: { id: B1.id, version: 1 } })
  })

  it('never presents the current preview as a run', () => {
    expect(source('PreviewObject.vue')).toMatch(/>Current preview · not executed</)
    expect(source('TransformInspector.vue')).not.toMatch(/Preview ·/)
  })
})
