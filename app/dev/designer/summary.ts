// Plain words for what a Transform does, so a node on the canvas can say it without opening its
// editor: "fullName ← firstName (trimmed) + a space + lastName". Generated from the same closed
// expression tree the Transform runs, so the summary can't drift from what actually happens.
// Literals are configuration, not Record data, so quoting them is fine.
import type { Argument, Expression, MappingProperty } from '#shared/features/mappings'
import { type Step, outcomeLabel } from '../features/experiment'

/** A literal's words: whitespace is invisible, so it is named rather than quoted. */
function literalWords(value: string | number | boolean): string {
  if (typeof value === 'boolean') return value ? 'yes' : 'no'
  if (typeof value !== 'string') return String(value)
  if (value === '') return 'nothing'
  if (value === ' ') return 'a space'
  if (!value.trim()) return `${value.length} spaces`
  return `“${value}”`
}

const isAtom = (e: Expression) => e.kind !== 'call'
/** An item of a joined list: bracketed when it is itself a join, so the grouping stays readable. */
const part = (item: Expression) => (isAtom(item) || (item.kind === 'call' && item.fn === 'trim') ? describeSource(item) : `(${describeSource(item)})`)

/** One source in words. */
export function describeSource(source: Expression | Argument): string {
  switch (source.kind) {
    case 'property': return source.name || 'an unnamed property'
    case 'path': return source.path.join(' › ')
    case 'construct': return source.presence.when === 'present' ? `built when ${source.presence.source.join(' › ')} is present` : 'built'
    case 'literal': return literalWords(source.value)
    case 'list': return source.items.map(part).join(' + ')
    case 'call': {
      const [first, second] = source.args
      if (source.fn === 'trim' && first && first.kind !== 'list') {
        return isAtom(first) ? `${describeSource(first)} (trimmed)` : `(${describeSource(first)}) trimmed`
      }
      if (source.fn === 'join' && first?.kind === 'list') {
        const parts = first.items.map(part)
        if (parts.length === 0) return 'nothing'
        const separator = second?.kind === 'literal' ? second.value : ''
        return separator === '' ? parts.join(' + ') : `${parts.join(', ')} joined with ${literalWords(separator)}`
      }
      return `${source.fn}(…)`
    }
  }
}

/** A property in words: "fullName ← firstName (trimmed) + a space + lastName". */
export const describeProperty = (property: MappingProperty) => `${property.name || 'unnamed'} ← ${describeSource(property.source)}`

/** At most `limit` lines for a node, and how many more there are. */
export function summarize(properties: readonly MappingProperty[], limit = 3): { lines: string[]; more: number } {
  return { lines: properties.slice(0, limit).map(describeProperty), more: Math.max(0, properties.length - limit) }
}

/**
 * The latest run's state for the inspector's status button: every outcome the evidence can hold,
 * and "Not invoked" when the run stopped before this step. Taken from the evidence only, never the
 * draft. Icon names are DesignerIcon's; the tone is semantic (and never the only signal).
 */
export function runState(step: Step): { icon: 'check' | 'error' | 'clock' | 'minus'; tone: string; label: string } {
  const outcome = step?.evidence.outcome
  if (!outcome) return { icon: 'minus', tone: 'border-slate-200 bg-slate-50 text-slate-500', label: 'Not invoked' }
  const label = outcomeLabel(outcome)
  if (outcome.kind === 'succeeded') return { icon: 'check', tone: 'border-emerald-200 bg-emerald-50 text-emerald-700', label }
  if (outcome.kind === 'failed') return { icon: 'error', tone: 'border-red-200 bg-red-50 text-red-700', label }
  return { icon: 'clock', tone: 'border-slate-200 bg-slate-50 text-slate-600', label }
}
