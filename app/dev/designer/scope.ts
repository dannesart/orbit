// Mapping Studio's inspector edits exactly the selected place, at any depth, without changing what a
// Mapping means. A nested property is never a root expression of its own: it's a place inside the
// top-level property's construction. Its editor is given that place (scopeAt): its piece, its field
// as the contract has it, and the presence guarantees of every object built around it (each one
// built only when its source object is present, so inside it that source is known to be there,
// exactly as ConstructionEditor provides them when it's rendered whole). What it sets goes back
// through the same enclosing constructions (setAt), changing nothing else.
//
// Only built objects have places inside them: inside a copied value, or one that isn't made, there's
// nothing to edit on its own, and scopeAt says which enclosing object stands in the way.
import type { Field, PropertyPath, Resolve } from '#shared/features/definitions'
import type { DraftProperty, Piece } from './parts'

type Construct = Extract<Piece, { kind: 'construct' }>

/** A field's own properties: a local object's, or the referenced Definition version's (null when it can't be found). */
export function fieldsOf(field: Field, resolve: Resolve): readonly Field[] | null {
  if (field.type === 'object') return field.fields
  if (field.type === 'reference') return resolve(field.definition)?.fields ?? null
  return null
}

export type Scope =
  | {
    readonly ok: true
    /** What makes the place now (null: nothing yet). */
    readonly piece: Piece | null
    /** The place as its contract has it. */
    readonly field: Field
    /** Source objects known to be present here: the conditions of the objects built around it, outermost first. */
    readonly guaranteed: readonly PropertyPath[]
  }
  | {
    readonly ok: false
    /** The enclosing object that has to be built before anything inside it can be made, by its full path. */
    readonly at: PropertyPath
    readonly why: 'not_built' | 'copied' | 'not_in_contract'
  }

/**
 * The place at `below` inside a top-level property (made by `top`, as `field`), with the guarantees
 * of the objects built around it. `below` is the path under the top-level property ([] is the property itself).
 */
export function scopeAt(top: Piece | null, field: Field, below: readonly string[], resolve: Resolve): Scope {
  let piece = top
  let here = field
  const guaranteed: PropertyPath[] = []
  const at: string[] = [field.name]
  for (const name of below) {
    if (piece?.kind !== 'construct') return { ok: false, at: [...at], why: piece?.kind === 'copy' ? 'copied' : 'not_built' }
    if (piece.presence.when === 'present') guaranteed.push(piece.presence.source)
    const next = fieldsOf(here, resolve)?.find((f) => f.name === name)
    if (!next) return { ok: false, at: [...at], why: 'not_in_contract' }
    piece = piece.properties.find((p) => p.name === name)?.piece ?? null
    here = next
    at.push(name)
  }
  return { ok: true, piece, field: here, guaranteed }
}

/**
 * The top-level property's piece with the place at `below` made by `next` (null: nothing makes it),
 * through the same enclosing constructions, everything else as it was. A new property goes last,
 * exactly as editing the object whole adds it.
 */
export function setAt(top: Piece | null, below: readonly string[], next: Piece | null): Piece | null {
  if (!below.length) return next
  if (top?.kind !== 'construct') return top // nothing inside to set (scopeAt says why)
  const [name, ...rest] = below as [string, ...string[]]
  const at = top.properties.findIndex((p) => p.name === name)
  const child = setAt(at < 0 ? null : top.properties[at]!.piece, rest, next)
  if (rest.length && child === (at < 0 ? null : top.properties[at]!.piece)) return top
  const properties: DraftProperty[] = child === null
    ? top.properties.filter((p) => p.name !== name)
    : at < 0 ? [...top.properties, { name, piece: child }] : top.properties.map((p, i) => (i === at ? { name, piece: child } : p))
  return { ...top, properties } satisfies Construct
}
