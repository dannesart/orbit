// The output's properties as the inspector lists them: every property the same way, whatever makes
// its value (a field, a fixed value, a composition, nothing yet, or something wrong), with the value
// the draft would make from the example beside it where the preview has one. Each row says what it
// shows and where activating it goes; nothing is edited in the inspector.
import type { Data, PropertyType, Scalar } from '#shared/features/definitions'
import type { TransformDraft } from './config'
import { fromPiece } from './parts'
import { type DraftReview, type Example, type OutputPreview, friendlyIssue } from './preview'
import type { StudioOpening } from './studio'
import { describeSource } from './summary'

export type RowState = DraftReview['fields'][number]['state']

/**
 * What the draft would make for a property from the example (the preview: never a run). Only what
 * the preview says: a value, a built object (its first level, the rest in the JSON view), why it
 * can't be made, or that the example leaves it out. No example, nothing mapped, or a property this
 * Transform version can't make: no example at all.
 */
export type RowExample =
  | { readonly kind: 'value'; readonly value: Scalar }
  | { readonly kind: 'object'; readonly entries: readonly { readonly name: string; readonly value: Scalar | null; readonly size: number }[]; readonly data: Data }
  | { readonly kind: 'cannot'; readonly why: string }
  | { readonly kind: 'absent'; readonly what: string }

export interface PropertyRow {
  /** The property's name, or '' while it has none. */
  readonly name: string
  readonly type: string
  readonly state: RowState
  /** What makes the value, in words; "Not mapped" when nothing does yet, "Left out" for an optional one. */
  readonly summary: string
  /** The first actual error, in words; '' when there is none. */
  readonly problem: string
  /** The value the draft would make from the example; null when the preview has none. */
  readonly example: RowExample | null
  /** Everything the row shows, in the order it shows it, then what activating it does. */
  readonly label: string
  /** Where the row opens Mapping Studio: Mapping at this property, or General while it has no name. */
  readonly opens: StudioOpening
}

export const typeWords: Record<PropertyType, string> = { string: 'text', number: 'number', boolean: 'yes or no', object: 'object', reference: 'Definition' }
export const stateWords: Record<RowState, string> = { not_set: 'Not mapped', left_out: 'Left out (optional)', problem: 'Needs attention', set: 'Mapped', unsupported: 'Not supported by this Transform version' }

const isData = (v: Scalar | Data): v is Data => typeof v === 'object' && v !== null
function exampleOf(value: OutputPreview['values'][number] | undefined): RowExample | null {
  if (!value) return null
  if ('value' in value) return { kind: 'value', value: value.value }
  if ('object' in value) return { kind: 'object', data: value.object, entries: Object.entries(value.object).map(([name, v]) => (isData(v) ? { name, value: null, size: Object.keys(v).length } : { name, value: v, size: 0 })) }
  if ('problems' in value) return { kind: 'cannot', why: value.problems[0] ?? '' }
  if ('absent' in value) return { kind: 'absent', what: value.absent.join(', ') }
  return null
}
const exampleWords = (e: RowExample) =>
  e.kind === 'value' ? `Example: ${e.value === '' ? 'empty' : String(e.value)}` : e.kind === 'object' ? 'Example: an object' : e.kind === 'cannot' ? 'Example: can’t be made' : 'Example: left out'

export function propertyRows(draft: TransformDraft, review: DraftReview, preview?: { readonly output: OutputPreview; readonly example: Example }): PropertyRow[] {
  const hasExample = !!preview && !('problem' in preview.example)
  return review.fields.map((f) => {
    const piece = f.index >= 0 ? draft.properties[f.index]!.piece : null
    // What this Transform version can't make says so, whatever was mapped to it.
    const summary = piece && f.state !== 'unsupported' ? describeSource(fromPiece(piece)) : stateWords[f.state]
    const inside = f.index >= 0 ? review.issues[f.index]?.[0] : undefined
    const problem = f.state === 'problem' ? (f.problems[0] ?? (inside ? friendlyIssue(inside) : '')) : ''
    const example = hasExample && piece && f.state !== 'unsupported' ? exampleOf(preview!.output.values[f.index]) : null
    const type = typeWords[f.expected]
    const shown = `${f.name || '(no name)'}, ${type}, ${stateWords[f.state]}${piece && f.state !== 'unsupported' ? `: ${summary}` : ''}.${problem ? ` ${problem}` : ''}${example ? ` ${exampleWords(example)}, not executed.` : ''}`
    return {
      name: f.name,
      type,
      state: f.state,
      summary,
      problem,
      example,
      label: `${shown} ${f.name ? 'Edit in Mapping Studio' : 'Name it in Mapping Studio'}`,
      opens: f.name ? { segment: 'mapping', property: f.name } : { segment: 'general' },
    }
  })
}
