// How the Designer meets Experiment #7's Definitions. Pure, so the rules can be tested.
//
// Orbit resolves a Definition only within the invoking workspace (or one Orbit provides), so a
// Definition made in a workspace can only be used by a run in that workspace. The Designer has
// always run in the playground's own sample workspace. Opened from a workspace you're in, it now
// runs there instead: its sample scaffolding (Record A, the sample Definitions and Mappings, and
// the Transform's own output) is placed in that workspace for this run, in memory, and is never
// listed among the Definitions made there. Opened any other way, nothing changes.
import type { InjectionKey } from 'vue'
import type { DefinitionRef } from '#shared/features/definitions'
import type { Catalog } from '#shared/features/features'
import { WORKSPACE } from '../features/experiment'
import type { Offered } from '../designer/config'
import { type MadeDefinition, ORBIT_PROVIDED } from './model'
import type { WorkspaceContext } from './store'

/** The workspace the Designer works in, for the parts of it that need to say so. */
export const DESIGNER_WORKSPACE: InjectionKey<WorkspaceContext | null> = Symbol('designer-workspace')

/** Where a workspace's Definitions live. */
export function definitionsPath(workspaceId: string, definition?: string, version?: number): string {
  const base = `/w/${workspaceId}/definitions`
  if (!definition) return base
  return `${base}?d=${encodeURIComponent(definition)}${version ? `&v=${version}` : ''}`
}

/**
 * The workspace the Designer works in: the one a workspace page last established in this tab,
 * and only when the Designer's way back leads to that same workspace. Anything else (opened
 * directly, or a way back that names some other workspace): none, and the samples run as before.
 */
export function designerWorkspace(back: string | null, context: WorkspaceContext | null): WorkspaceContext | null {
  const named = back?.match(/^\/w\/([^/?#]+)(?:[/?#]|$)/)?.[1]
  return context && named && decodeURIComponent(named) === context.id ? context : null
}

/**
 * What the Transform may use besides its samples: every version made in its workspace (under the
 * name it has now), and what Orbit provides. Without a workspace, only what Orbit provides.
 */
export function offeredIn(workspace: WorkspaceContext | null, made: readonly MadeDefinition[]): Offered[] {
  const own: Offered[] = workspace
    ? made.filter((d) => d.workspaceId === workspace.id).flatMap((d) => d.versions.map((definition) => ({ definition, name: d.name, source: 'workspace' as const })))
    : []
  return [...own, ...ORBIT_PROVIDED.map((definition) => ({ definition, name: definition.name, source: 'orbit' as const }))]
}

/** An exact version asked for by "Use in the Designer" (`id@version`), if this session is offered it. */
export function requestedOutput(param: unknown, offered: readonly Offered[]): DefinitionRef | null {
  if (typeof param !== 'string') return null
  const at = param.lastIndexOf('@')
  const id = param.slice(0, at)
  const version = Number(param.slice(at + 1))
  const found = offered.find((o) => o.definition.id === id && o.definition.version === version)
  return found ? { id, version } : null
}

/**
 * The run's catalogue, with the playground's sample scaffolding placed in `workspaceId`. Another
 * workspace's samples stay where they are (still not found), and so does everything else.
 */
export function placeIn(catalog: Catalog, workspaceId: string): Catalog {
  if (workspaceId === WORKSPACE) return catalog
  const move = <T extends { workspaceId: string | null }>(item: T) => placed(item, workspaceId)
  return {
    definitions: catalog.definitions.map(move),
    records: catalog.records.map(move),
    mappings: catalog.mappings.map(move),
  }
}

/** One piece of sample scaffolding placed in `workspaceId` (placeIn's rule); anything else as it is. */
export function placed<T extends { workspaceId: string | null }>(item: T, workspaceId: string): T {
  return item.workspaceId === WORKSPACE && workspaceId !== WORKSPACE ? { ...item, workspaceId } : item
}
