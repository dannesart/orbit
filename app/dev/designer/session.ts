// What leaving the designer would discard. The designer keeps everything in memory only, applied
// versions included (Apply makes immutable versions for this session's runs, not saved ones), so
// leaving loses whatever differs from how the playground started. Running, moving nodes and
// opening panels aren't work: an untouched playground can be left without a question.
import { sameData, sameDefinition, sameFields } from '#shared/features/definitions'
import type { MappingProperty } from '#shared/features/mappings'
import { type Configuration, type TransformDraft, draftFrom, initialConfiguration, labelOf } from './config'
import { type DraftProperty, fromPiece } from './parts'

const sameProperty = (a: DraftProperty, b: DraftProperty) => a.name === b.name && sameData(fromPiece(a.piece), fromPiece(b.piece))
const count = (n: number, one: string, many: string) => (n === 1 ? `1 ${one}` : `${n} ${many}`)

/**
 * What resetting the draft to `to` (Discard, Start over) would lose that someone wrote: mappings
 * not in `to`, mappings set aside when switching Definitions, and changes to the Transform's own
 * output. Which Definition is selected isn't work. Empty when nothing would be lost. A mapping set
 * aside exactly as an applied Mapping version has it isn't lost either: that version keeps it.
 */
export function draftLoses(draft: TransformDraft, to: TransformDraft, applied: readonly { readonly properties: readonly MappingProperty[] }[] = []): string[] {
  const kept = (p: DraftProperty) => to.properties.some((q) => sameProperty(p, q))
  const versioned = (p: DraftProperty) => applied.some((m) => m.properties.some((q) => q.name === p.name && sameData(fromPiece(p.piece), q.source)))
  const written = draft.properties.filter((p) => !kept(p)).length
  const aside = (draft.aside ?? []).filter((p) => !kept(p) && !versioned(p)).length
  const at: string[] = []
  if (written) at.push(`${count(written, 'mapping', 'mappings')} you haven’t applied`)
  if (aside) at.push(`${count(aside, 'mapping', 'mappings')} set aside when you switched Definitions`)
  if (draft.local.name !== to.local.name || !sameFields(draft.local.fields, to.local.fields)) at.push('Changes to the Transform’s own output')
  return at
}

/**
 * The draft once Apply has turned `before` into `after`: the applied Mapping's properties, and the
 * Transform's own output as written. An untouched own output (still the copy it was started from)
 * follows the newly applied output instead, so it never reads as someone's work afterwards (Discard
 * and Cancel compare against that copy).
 */
export function draftAfterApply(draft: TransformDraft, before: Configuration, after: Configuration): TransformDraft {
  const fresh = draftFrom(after)
  const seed = draftFrom(before).local
  const untouched = draft.local.name === seed.name && sameFields(draft.local.fields, seed.fields)
  return { ...draft, properties: fresh.properties, ...(untouched ? { local: fresh.local } : {}) }
}

export interface Setup {
  readonly pinKey: string
  readonly recordText: string
  /** The Feature version each step invokes, by key (featureKey). */
  readonly features: Readonly<Record<string, string>>
}

export interface Session extends Setup {
  readonly config: Configuration
  /** Whether the Transform's draft differs from what's applied (planApply(...).changes). */
  readonly unapplied: boolean
}

/**
 * What leaving would discard, in words, most valuable first; empty when there is nothing. `initial`:
 * how the Transform started (a workflow's own Mapping, workflows.ts); the playground's by default.
 * Record edits are compared as the caller gives them (pinKey and recordText, for every Record).
 */
export function workAtRisk(session: Session, start: Setup, initial: Configuration = initialConfiguration()): string[] {
  const at: string[] = []
  const { config } = session
  const versions = [
    ...config.locals.map((d) => `${d.name} v${d.version}`),
    ...config.mappings.filter((m) => !initial.mappings.includes(m)).map((m) => `Mapping v${m.version} for ${labelOf(config, m.to)}`),
  ]
  if (versions.length) at.push(`Applied versions, which exist only in this session: ${versions.join(', ')}`)
  else if (!sameDefinition(config.output, initial.output) || config.mapping.id !== initial.mapping.id || config.mapping.version !== initial.mapping.version) {
    at.push('The Transform’s applied configuration')
  }
  if (session.unapplied) at.push('Changes to the Transform you haven’t applied')
  if (session.recordText !== start.recordText || session.pinKey !== start.pinKey) at.push('Your edits to the Records')
  if (Object.keys(start.features).some((step) => session.features[step] !== start.features[step])) at.push('The Feature versions you chose for its steps')
  return at
}
