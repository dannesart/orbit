// The building blocks one workspace's Studio may use: its own Definitions (every version) and those
// Orbit provides. Never another workspace's: they aren't on this shelf, so they can't be offered,
// shown or resolved here. Pure, so it can be tested; the store builds it from the workspace's shelf.
//
// It resolves references exactly as Orbit does (shared/features/definitions.ts, Resolve): by exact
// identity and version, never "the latest". Whether a reference is allowed, acyclic and within the
// depth limit is still Orbit's own check (checkFields), never decided here.
import { type DefinitionRef, type DefinitionVersion, type Resolve, sameDefinition } from '#shared/features/definitions'
import type { Appearance } from './appearance'
import { type MadeDefinition, ORBIT_PROVIDED } from './model'

/** One Definition offered as a building block, with every version that can be referenced. */
export interface BuildingBlock {
  readonly id: string
  /** Its name now (a made Definition's current name; each version keeps the one it was made with). */
  readonly name: string
  /** Its icon and colour; Orbit's have none (shown as the plain Definition icon). */
  readonly appearance: Appearance | null
  readonly provided: boolean
  /** Oldest first. The last is the latest, offered first, but a reference always names one exactly. */
  readonly versions: readonly DefinitionVersion[]
}

export interface StudioCatalogue {
  /** The workspace's own first, then Orbit's. */
  readonly blocks: readonly BuildingBlock[]
  readonly resolve: Resolve
  /** The block a version belongs to, if this workspace may see it. */
  readonly find: (id: string) => BuildingBlock | null
  /**
   * "Candidate · v1": how a referenced version is named for people, by the name that exact version
   * was published with (a later rename is catalogue metadata, never the contract's). One that can't
   * be resolved here is named by its identity only: never by another version's name.
   */
  readonly label: (ref: DefinitionRef) => string
}

export function studioCatalogue(workspaceId: string, made: readonly MadeDefinition[]): StudioCatalogue {
  const own: BuildingBlock[] = made
    .filter((d) => d.workspaceId === workspaceId)
    .map((d) => ({ id: d.id, name: d.name, appearance: d.appearance, provided: false, versions: d.versions }))
  const orbit: BuildingBlock[] = [...new Set(ORBIT_PROVIDED.map((d) => d.id))].map((id) => {
    const versions = ORBIT_PROVIDED.filter((d) => d.id === id)
    return { id, name: versions.at(-1)!.name, appearance: null, provided: true, versions }
  })
  const blocks = [...own, ...orbit]
  const find = (id: string) => blocks.find((b) => b.id === id) ?? null
  const resolve: Resolve = (ref) => find(ref.id)?.versions.find((v) => sameDefinition(v, ref)) ?? null
  return {
    blocks,
    find,
    resolve,
    label: (ref) => `${resolve(ref)?.name ?? ref.id} · v${ref.version}`,
  }
}
