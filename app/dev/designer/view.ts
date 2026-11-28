// What the Transform's editing surfaces show, and what their Apply does, derived in one place. The
// Designer page renders the inspector and Mapping Studio from exactly this, and
// wires every Apply button to applyDraft, so tests can derive the same state and render the same
// surfaces. Pure: nothing here holds state, and nothing runs a Feature.
import { type ApplyAssessment, type ApplyContext, type Configuration, type TransformDraft, applyConfiguration, assessApply, contractIn, findMapping, scopeOf, structureProblems } from './config'
import { fromDraft } from './parts'
import { type Example, type OutputPreview, exampleFrom, previewOutput, unresolvedPreview } from './preview'
import { type Reading, readingOf } from './reading'
import { draftAfterApply } from './session'
import type { AppliedPreview } from './studio'
import { transformSupport } from './support'

export interface TransformView {
  /** The authoritative assessment (config.ts): every surface's Apply availability and problems. */
  readonly assessment: ApplyAssessment
  readonly target: ApplyAssessment['target']
  readonly input: ApplyAssessment['input']
  readonly review: ApplyAssessment['review']
  readonly plan: ApplyAssessment['plan']
  readonly structure: readonly string[]
  /** How the step's Transform version reads, with the step's workspace's resolver. */
  readonly reading: Reading
  readonly example: Example
  readonly output: OutputPreview
  /** What the step's Transform version refuses of the complete draft (its pre-run check), in words. */
  readonly boundary: readonly string[]
}

/** Everything the Transform's surfaces show for this draft, for the step's Transform version and workspace. */
export function transformView(config: Configuration, draft: TransformDraft, step: ApplyContext, recordText: string, recordName?: string): TransformView {
  const { resolve } = scopeOf(config, step.workspaceId)
  const assessment = assessApply(config, draft, step)
  const { target, input, from, review, plan } = assessment
  const reading = transformSupport(input, target.definition, step.feature, resolve).reading!
  const properties = fromDraft(draft.properties)
  // Only what's resolved is shown as known: an unresolved input has no example, and an unresolved
  // contract on either side makes the preview an illustration, never checked against anything.
  const example: Example = from.kind === 'unresolved'
    ? { problem: 'The input Definition version can’t be found here, so there’s no example to preview with.', details: [] }
    : exampleFrom(recordText, input, resolve, recordName)
  const output = from.kind === 'unresolved' || target.kind === 'unresolved'
    ? unresolvedPreview(properties, from.kind === 'unresolved' ? null : input, example, reading)
    : previewOutput(properties, input, target.definition, example, reading)
  return {
    assessment, target, input, review, plan, reading, example, output,
    structure: structureProblems(draft),
    boundary: assessment.problems.filter((p) => p.kind === 'refused').map((p) => p.words),
  }
}

/**
 * What every Apply button does: the authoritative Apply (applyConfiguration), and, when it applied,
 * the draft it leaves. null when it refused: then nothing changes, neither the configuration and its
 * versions nor the draft.
 */
export function applyDraft(config: Configuration, draft: TransformDraft, step: ApplyContext): { readonly config: Configuration; readonly draft: TransformDraft } | null {
  const result = applyConfiguration(config, draft, step)
  if (!result.applied) return null
  return { config: result.config, draft: draftAfterApply(draft, config, result.config) }
}

/**
 * The applied Mapping, previewed the same way with the same Record A (Mapping Studio's Preview shows
 * it beside the draft's). A preview, never a run: runs are what made the evidence.
 */
export function appliedPreview(config: Configuration, step: ApplyContext, recordText: string, recordName?: string): AppliedPreview {
  const scope = scopeOf(config, step.workspaceId)
  const mapping = findMapping(config, config.mapping)!
  // The applied versions, as this workspace resolves them; never stand-ins for what it can't.
  const from = contractIn(mapping.from, scope)
  const to = contractIn(mapping.to, scope)
  const reading = readingOf(step.feature, scope.resolve)
  const example: Example = from.kind === 'unresolved' ? { problem: 'The input Definition version can’t be found here, so there’s no example to preview with.', details: [] } : exampleFrom(recordText, from.definition, scope.resolve, recordName)
  const preview = from.kind === 'unresolved' || to.kind === 'unresolved'
    ? unresolvedPreview(mapping.properties, from.kind === 'unresolved' ? null : from.definition, example, reading)
    : previewOutput(mapping.properties, from.definition, to.definition, example, reading)
  return { version: mapping.version, label: to.label, properties: mapping.properties, input: from.definition, target: to.definition, example, preview }
}
