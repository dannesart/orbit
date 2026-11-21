// The parts editor's view of a Mapping (Experiment #3). Only a way of looking at the closed
// expression tree in shared/features/mappings.ts, never a second language: every Piece is made
// from an Expression (toPiece) and turned straight back into one (fromPiece), and the two are
// exact inverses. A tree the parts view can't show exactly becomes an 'advanced' Piece that holds
// the original Expression untouched, for the recursive SourceEditor. Nothing here simplifies,
// normalizes or rewrites a tree: only an explicit edit by the person changes it.
import type { Expression, MappingIssue, MappingProperty, Path } from '#shared/features/mappings'

/**
 * One value, as the parts editor shows it.
 *   field     a property of the incoming value
 *   text      literal text (a space is text too)
 *   combine   values joined in order, with an optional separator between them (join)
 *   advanced  any other tree, kept exactly as it is
 * `trim` is "Remove spaces from both ends" (the trim function) applied to the value.
 */
export type Piece =
  | { readonly kind: 'field'; readonly name: string; readonly trim: boolean }
  | { readonly kind: 'text'; readonly value: string; readonly trim: boolean }
  | { readonly kind: 'combine'; readonly parts: readonly Piece[]; readonly separator: string; readonly trim: boolean }
  | { readonly kind: 'advanced'; readonly expression: Expression }

/** A Mapping property while it is being edited: its name and its value as a Piece. */
export interface DraftProperty {
  readonly name: string
  readonly piece: Piece
}

/** Exactly these keys and no others, so nothing in a tree can be dropped on the way through. */
const hasKeys = (value: object, keys: string[]) => {
  const own = Object.keys(value)
  return own.length === keys.length && keys.every((k) => Object.hasOwn(value, k))
}
const advanced = (expression: Expression): Piece => ({ kind: 'advanced', expression })

/** An Expression as a Piece. Anything the parts view can't represent exactly stays as it is. */
export function toPiece(e: Expression): Piece {
  if (e?.kind === 'property' && hasKeys(e, ['kind', 'name']) && typeof e.name === 'string') {
    return { kind: 'field', name: e.name, trim: false }
  }
  if (e?.kind === 'literal' && hasKeys(e, ['kind', 'value']) && typeof e.value === 'string') {
    return { kind: 'text', value: e.value, trim: false }
  }
  if (e?.kind === 'call' && hasKeys(e, ['kind', 'fn', 'args']) && Array.isArray(e.args)) {
    if (e.fn === 'trim' && e.args.length === 1 && e.args[0]!.kind !== 'list') {
      const inner = toPiece(e.args[0] as Expression)
      // trim(trim(x)) has no single checkbox to show it, so it is left to the advanced editor.
      if (inner.kind !== 'advanced' && !inner.trim) return { ...inner, trim: true }
      return advanced(e)
    }
    if (e.fn === 'join' && e.args.length === 2) {
      const [list, separator] = e.args
      if (
        list!.kind === 'list' && hasKeys(list!, ['kind', 'items']) && Array.isArray(list.items)
        && separator!.kind === 'literal' && hasKeys(separator!, ['kind', 'value']) && typeof separator.value === 'string'
      ) {
        return { kind: 'combine', parts: list.items.map(toPiece), separator: separator.value, trim: false }
      }
    }
  }
  return advanced(e)
}

/** A Piece as the Expression it stands for. */
export function fromPiece(piece: Piece): Expression {
  let e: Expression
  switch (piece.kind) {
    case 'advanced': return piece.expression
    case 'field': e = { kind: 'property', name: piece.name }; break
    case 'text': e = { kind: 'literal', value: piece.value }; break
    case 'combine':
      e = { kind: 'call', fn: 'join', args: [{ kind: 'list', items: piece.parts.map(fromPiece) }, { kind: 'literal', value: piece.separator }] }
      break
  }
  return piece.trim ? { kind: 'call', fn: 'trim', args: [e] } : e
}

export const toDraft = (properties: readonly MappingProperty[]): DraftProperty[] =>
  properties.map((p) => ({ name: p.name, piece: toPiece(p.source) }))

export const fromDraft = (draft: readonly DraftProperty[]): MappingProperty[] =>
  draft.map((p) => ({ name: p.name, source: fromPiece(p.piece) }))

/** Whether "Show as parts" can show this tree (the advanced editor's way back). */
export const representable = (e: Expression) => toPiece(e).kind !== 'advanced'

// --- Edits: each returns a new list or Piece, and changes only what was asked ---

export const insertAt = <T>(list: readonly T[], i: number, item: T): T[] => [...list.slice(0, i), item, ...list.slice(i)]
export const replaceAt = <T>(list: readonly T[], i: number, item: T): T[] => list.map((x, j) => (j === i ? item : x))
export const removeAt = <T>(list: readonly T[], i: number): T[] => list.filter((_, j) => j !== i)
export function move<T>(list: readonly T[], i: number, delta: -1 | 1): T[] {
  const j = i + delta
  if (j < 0 || j >= list.length) return [...list]
  const next = [...list]
  ;[next[i], next[j]] = [next[j]!, next[i]!]
  return next
}

/** "Add another part" on a single value: it becomes the first of two parts, joined with nothing between. */
export const combineWith = (first: Piece, second: Piece): Piece => ({ kind: 'combine', parts: [first, second], separator: '', trim: false })

/** Choosing a different value for a part keeps its "Remove spaces" setting. */
export function replaceValue(previous: Piece, next: Piece): Piece {
  const trim = previous.kind !== 'advanced' && previous.trim
  return next.kind === 'advanced' ? next : { ...next, trim }
}

// --- Where problems belong ---

const startsWith = (path: Path, prefix: Path) => prefix.length <= path.length && prefix.every((s, i) => path[i] === s)

/** The paths (as checkMapping reports them) of a combine's parts. */
export function partPaths(piece: Piece, path: Path): Path[] {
  if (piece.kind !== 'combine') return []
  const base: Path = piece.trim ? [...path, 'trim', 0] : path
  return piece.parts.map((_, i) => [...base, 'join', 0, i])
}

/** The issues that are about this Piece itself, not about one of its parts. */
export function ownIssues(piece: Piece, path: Path, issues: readonly MappingIssue[]): MappingIssue[] {
  const parts = partPaths(piece, path)
  return issues.filter((i) => startsWith(i.path, path) && !parts.some((p) => startsWith(i.path, p)))
}

/** Values that would add nothing: empty text and empty groups. Not errors, but rarely meant. */
export function emptyBits(piece: Piece, where = 'This value'): string[] {
  if (piece.kind === 'text' && piece.value === '') return [`${where} is empty text, so it adds nothing.`]
  if (piece.kind !== 'combine') return []
  if (piece.parts.length === 0) return [`${where} has no parts yet, so it makes empty text.`]
  return piece.parts.flatMap((p, i) => emptyBits(p, `${where === 'This value' ? 'Part' : `${where}, part`} ${i + 1}`))
}
