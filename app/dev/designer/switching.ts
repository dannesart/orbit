// Switching the Transform's output Definition (Related to #38, #41). Choosing another Definition
// is an ordinary design decision, so the draft is reconciled against it at that moment:
//
//   A mapping stays active only where the new Definition has a property with exactly the same
//   name (identity) and the value it makes has that property's type, or can't be typed yet
//   because it has a problem of its own (still shown as a problem). Never by a similar label.
//   Everything else is set aside: kept unchanged in the draft, never previewed, validated or
//   applied, and brought back when a Definition it fits is chosen again in this session.
//   A property nothing fits stays unmapped: no value is ever made up.
//
// Only the draft's lists change. Mappings, Definition versions and run evidence are untouched;
// Apply still makes versions only from the active properties.
import { type DefinitionVersion, type Field, type FieldType, isScalarField } from '#shared/features/definitions'
import type { TransformDraft } from './config'
import { type DraftProperty, fromPiece } from './parts'
import { FLAT, type Reading, typeWith } from './reading'

/** The type a draft property's value makes from the input (as the chosen version reads it), or null when it has a problem. */
function typeOf(property: DraftProperty, input: DefinitionVersion, reading: Reading): FieldType | 'string[]' | 'invalid' | null {
  return typeWith(reading, fromPiece(property.piece), input)
}

/** Whether this property's mapping can fill the target's property of the same name. */
function fits(property: DraftProperty, field: Field, input: DefinitionVersion, reading: Reading): boolean {
  // An object property is built (a construction), never made from a value.
  if (property.name !== field.name) return false
  if (!isScalarField(field)) return property.piece.kind === 'construct' || property.piece.kind === 'copy'
  const type = typeOf(property, input, reading)
  return type === null || type === field.type
}

/**
 * The draft with its mappings sorted for `target`: at most one active mapping per property (the
 * current one first, then one set aside earlier), and the rest set aside, all kept exactly.
 */
export function reconcile(draft: TransformDraft, input: DefinitionVersion, target: DefinitionVersion, reading: Reading = FLAT): TransformDraft {
  const active = draft.properties
  const aside = draft.aside ?? []
  const chosen = new Set<DraftProperty>()
  for (const field of target.fields) {
    const match = active.find((p) => !chosen.has(p) && fits(p, field, input, reading)) ?? aside.find((p) => !chosen.has(p) && fits(p, field, input, reading))
    if (match) chosen.add(match)
  }
  // Kept mappings stay in their order; recovered ones follow, in the target's order.
  const properties = [...active.filter((p) => chosen.has(p)), ...target.fields.flatMap((f) => aside.filter((p) => chosen.has(p) && p.name === f.name))]
  const setAside = [...active.filter((p) => !chosen.has(p)), ...aside.filter((p) => !chosen.has(p))]
  return { ...draft, properties, aside: setAside }
}

/** Why a set-aside mapping isn't part of the draft for `target`, in words. */
export function asideReason(property: DraftProperty, input: DefinitionVersion, target: DefinitionVersion, targetLabel: string, reading: Reading = FLAT): string {
  if (!property.name) return 'It has no name.'
  const field = target.fields.find((f) => f.name === property.name)
  if (!field) return `${targetLabel} has no ${property.name}.`
  const type = typeOf(property, input, reading)
  if (type && type !== field.type) return `It makes ${words[type]}, and ${property.name} here is ${words[field.type]}.`
  return `${property.name} already has a value.`
}

const words: Record<string, string> = { string: 'text', number: 'a number', boolean: 'yes or no', 'string[]': 'a list', invalid: 'something invalid' }
