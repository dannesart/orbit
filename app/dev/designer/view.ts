// What the Transform's editing surfaces show, and what their Apply does, derived in one place. The
// Designer page renders the inspector, the focused editor and Mapping Studio from exactly this, and
// wires every Apply button to applyDraft, so tests can derive the same state and render the same
// surfaces. Pure: nothing here holds state, and nothing runs a Feature.
import { A1 } from '../features/experiment'
import { type ApplyAssessment, type ApplyContext, type Configuration, type TransformDraft, applyConfiguration, assessApply, findMapping, labelOf, scopeOf, structureProblems } from './config'
import { fromDraft } from './parts'
import { type Example, type OutputPreview, exampleFrom, previewOutput } from './preview'
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
export function transformView(config: Configuration, draft: TransformDraft, step: ApplyContext, recordText: string): TransformView {
  const { resolve } = scopeOf(config, step.workspaceId)
  const assessment = assessApply(config, draft, step)
  const { target, input, review, plan } = assessment
  const reading = transformSupport(input, target.definition, step.feature, resolve).reading!
  const example = exampleFrom(recordText, input, resolve)
  return {
    assessment, target, input, review, plan, reading, example,
    structure: structureProblems(draft),
    output: previewOutput(fromDraft(draft.properties), input, target.definition, example, reading),
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
export function appliedPreview(config: Configuration, step: ApplyContext, recordText: string): AppliedPreview {
  const { resolve } = scopeOf(config, step.workspaceId)
  const mapping = findMapping(config, config.mapping)!
  const from = resolve(mapping.from) ?? A1
  const to = resolve(mapping.to)!
  const example = exampleFrom(recordText, from, resolve)
  const preview = previewOutput(mapping.properties, from, to, example, readingOf(step.feature, resolve))
  return { version: mapping.version, label: labelOf(config, mapping.to), properties: mapping.properties, input: from, target: to, example, preview }
}
