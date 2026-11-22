// Quick mappings (Experiment #5): what the inspector can edit in one line, without the focused
// editor. Simple means one field of the input, as it is, or one fixed value. Anything else (spaces
// removed, combined parts, groups, advanced expressions) is "composed": the inspector describes it
// and offers the focused editor, but never replaces it from a dropdown, so a composition can't be
// lost by accident. Like parts.ts, only a view: quick edits produce ordinary Pieces.
import type { FieldType, Scalar } from '#shared/features/definitions'
import type { Piece } from './parts'

export type Quick =
  | { readonly kind: 'none' }
  | { readonly kind: 'field'; readonly name: string }
  | { readonly kind: 'fixed'; readonly value: Scalar }
  | { readonly kind: 'composed' }

/** How the inspector shows a property's value (null: nothing makes it yet). */
export function quickOf(piece: Piece | null): Quick {
  if (!piece) return { kind: 'none' }
  if (piece.kind === 'field' && !piece.trim) return { kind: 'field', name: piece.name }
  if (piece.kind === 'text' && !piece.trim) return { kind: 'fixed', value: piece.value }
  if (piece.kind === 'literal') return { kind: 'fixed', value: piece.value }
  return { kind: 'composed' }
}

/** The Piece a quick choice stands for: exactly what the parts editor would make for it. */
export function pieceOf(quick: Extract<Quick, { kind: 'field' | 'fixed' }>): Piece {
  if (quick.kind === 'field') return { kind: 'field', name: quick.name, trim: false }
  return typeof quick.value === 'string' ? { kind: 'text', value: quick.value, trim: false } : { kind: 'literal', value: quick.value }
}

/** A fixed value to start from, of the property's own type (never converted later). */
export const startingValue = (type: FieldType): Scalar => (type === 'string' ? '' : type === 'number' ? 0 : true)
