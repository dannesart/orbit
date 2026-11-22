// What leaving the designer would discard. The designer keeps everything in memory only, applied
// versions included (Apply makes immutable versions for this session's runs, not saved ones), so
// leaving loses whatever differs from how the playground started. Running, moving nodes and
// opening panels aren't work: an untouched playground can be left without a question.
import { sameDefinition } from '#shared/features/definitions'
import { INITIAL_MAPPING } from '../features/experiment'
import { type Configuration, initialConfiguration, labelOf } from './config'

export interface Setup {
  readonly pinKey: string
  readonly recordText: string
  readonly consoleId: string
}

export interface Session extends Setup {
  readonly config: Configuration
  /** Whether the Transform's draft differs from what's applied (planApply(...).changes). */
  readonly unapplied: boolean
}

/** What leaving would discard, in words, most valuable first; empty when there is nothing. */
export function workAtRisk(session: Session, start: Setup): string[] {
  const at: string[] = []
  const { config } = session
  const versions = [
    ...config.locals.map((d) => `${d.name} v${d.version}`),
    ...config.mappings.filter((m) => m !== INITIAL_MAPPING).map((m) => `Mapping v${m.version} for ${labelOf(config, m.to)}`),
  ]
  const initial = initialConfiguration()
  if (versions.length) at.push(`Applied versions, which exist only in this session: ${versions.join(', ')}`)
  else if (!sameDefinition(config.output, initial.output) || config.mapping.id !== initial.mapping.id || config.mapping.version !== initial.mapping.version) {
    at.push('The Transform’s applied configuration')
  }
  if (session.unapplied) at.push('Changes to the Transform you haven’t applied')
  if (session.recordText !== start.recordText || session.pinKey !== start.pinKey) at.push('Your edits to Record A')
  if (session.consoleId !== start.consoleId) at.push('The Console you chose to misbehave')
  return at
}
