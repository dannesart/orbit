// The output's properties as the inspector lists them: every property the same way, whatever makes
// its value (a field, a fixed value, a composition, nothing yet, or something wrong). Each row says
// what it shows and where activating it goes; nothing is edited in the inspector.
import type { PropertyType } from '#shared/features/definitions'
import type { TransformDraft } from './config'
import { fromPiece } from './parts'
import { type DraftReview, friendlyIssue } from './preview'
import type { StudioOpening } from './studio'
import { describeSource } from './summary'

export type RowState = DraftReview['fields'][number]['state']
export interface PropertyRow {
  /** The property's name, or '' while it has none. */
  readonly name: string
  readonly type: string
  readonly state: RowState
  /** What makes the value, in words; "Not mapped" when nothing does yet, "Left out" for an optional one. */
  readonly summary: string
  /** The first actual error, in words; '' when there is none. */
  readonly problem: string
  /** Everything the row shows, in the order it shows it, then what activating it does. */
  readonly label: string
  /** Where the row opens Mapping Studio: Mapping at this property, or General while it has no name. */
  readonly opens: StudioOpening
}

export const typeWords: Record<PropertyType, string> = { string: 'text', number: 'number', boolean: 'yes or no', object: 'object', reference: 'Definition' }
export const stateWords: Record<RowState, string> = { not_set: 'Not mapped', left_out: 'Left out (optional)', problem: 'Needs attention', set: 'Mapped', unsupported: 'Not supported by this Transform version' }

export function propertyRows(draft: TransformDraft, review: DraftReview): PropertyRow[] {
  return review.fields.map((f) => {
    const piece = f.index >= 0 ? draft.properties[f.index]!.piece : null
    // What this Transform version can't make says so, whatever was mapped to it.
    const summary = piece && f.state !== 'unsupported' ? describeSource(fromPiece(piece)) : stateWords[f.state]
    const inside = f.index >= 0 ? review.issues[f.index]?.[0] : undefined
    const problem = f.state === 'problem' ? (f.problems[0] ?? (inside ? friendlyIssue(inside) : '')) : ''
    const type = typeWords[f.expected]
    const shown = `${f.name || '(no name)'}, ${type}, ${stateWords[f.state]}${piece && f.state !== 'unsupported' ? `: ${summary}` : ''}.${problem ? ` ${problem}` : ''}`
    return {
      name: f.name,
      type,
      state: f.state,
      summary,
      problem,
      label: `${shown} ${f.name ? 'Edit in Mapping Studio' : 'Name it in Mapping Studio'}`,
      opens: f.name ? { segment: 'mapping', property: f.name } : { segment: 'general' },
    }
  })
}
