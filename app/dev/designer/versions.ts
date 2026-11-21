// Applying a draft (Experiment #3): the only way a new Mapping version is made on this page.
// Running never makes one; it uses the last applied version.
import { sameData } from '#shared/features/definitions'
import { type Mapping, type MappingProperty, reviseMapping } from '#shared/features/mappings'

/** The versions after applying `properties`: one more, frozen, when they differ from the latest; otherwise the same list. */
export function applyDraft(versions: readonly Mapping[], properties: readonly MappingProperty[]): readonly Mapping[] {
  const latest = versions.at(-1)!
  if (sameData(properties, latest.properties)) return versions
  return [...versions, reviseMapping(latest, JSON.parse(JSON.stringify(properties)))]
}

/** Whether a draft differs from what's applied. */
export const unapplied = (properties: readonly MappingProperty[], latest: Mapping) => !sameData(properties, latest.properties)
