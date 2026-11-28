// Experiment #7's shared state: what the Definitions place and the Designer both see, kept in this
// browser tab's memory and nowhere else. It outlives moving between Orbit's pages (they're one
// app), and ends with a reload or with closing the tab. Nothing is fetched, saved or logged.
//
// Each workspace has its own shelf: what's made in one is never seen from another. Only the
// browser writes here (the server renders an empty, throwaway shelf), so nothing can be shared
// between people through the server's memory.
import { reactive } from 'vue'
import { type Appearance, DEFAULT_APPEARANCE } from './appearance'
import { type DefinitionRef, type Field, deepFreeze, defineVersion } from '#shared/features/definitions'
import { DEFINITIONS } from '../features/experiment'
import { ADDRESS_V1, REALISTIC_DEFINITIONS } from '../features/realistic'
import { LOCAL_ID } from '../designer/config'
import {
  type Draft, type MadeDefinition, type NewDefinition, ORBIT_PROVIDED,
  addVersion, blankDraft, checkSequence, createDefinition, newIdentity, renamed,
} from './model'
import { type StudioCatalogue, studioCatalogue } from './catalogue'

/** The workspace you were last in, as one of its pages established it (they're authorized). */
export interface WorkspaceContext {
  readonly id: string
  readonly name: string
}

export interface Shelf {
  made: MadeDefinition[]
  /** A new Definition being written, before its first version. */
  creating: NewDefinition | null
  /** Drafts of next versions, by Definition identity. */
  evolving: Record<string, Draft>
}

const state = reactive({
  context: null as WorkspaceContext | null,
  shelves: {} as Record<string, Shelf>,
})

const emptyShelf = (): Shelf => ({ made: [], creating: null, evolving: {} })

/** One workspace's shelf. On the server, always a new, empty one that nobody keeps. */
export function shelfOf(workspaceId: string): Shelf {
  if (import.meta.server) return emptyShelf()
  return (state.shelves[workspaceId] ??= emptyShelf())
}

/** Called by a workspace page once it has loaded (so the workspace is one you belong to). */
export function enterWorkspace(context: WorkspaceContext) {
  if (import.meta.server) return
  state.context = { id: context.id, name: context.name }
}

export const lastWorkspace = (): WorkspaceContext | null => state.context

/** Every identity this tab knows of: made here or elsewhere, samples, and the Transform's own. */
function taken(id: string): boolean {
  if (id === LOCAL_ID || id.startsWith('transform')) return true
  if (DEFINITIONS.some((d) => d.id === id) || ORBIT_PROVIDED.some((d) => d.id === id)) return true
  return Object.values(state.shelves).some((s) => s.made.some((d) => d.id === id))
}

/** What this workspace may build on: its own Definitions and Orbit’s (catalogue.ts). */
export const catalogueOf = (workspaceId: string): StudioCatalogue => studioCatalogue(workspaceId, shelfOf(workspaceId).made)

export const findMade = (workspaceId: string, id: string): MadeDefinition | null =>
  shelfOf(workspaceId).made.find((d) => d.id === id) ?? null

function replace(workspaceId: string, next: MadeDefinition) {
  checkSequence(next)
  const shelf = shelfOf(workspaceId)
  shelf.made = shelf.made.map((d) => (d.id === next.id ? next : d))
}

export function startCreating(workspaceId: string): NewDefinition {
  const shelf = shelfOf(workspaceId)
  return (shelf.creating ??= { name: '', description: '', appearance: DEFAULT_APPEARANCE, draft: blankDraft() })
}

export function setCreating(workspaceId: string, next: NewDefinition | null) {
  shelfOf(workspaceId).creating = next
}

/** Makes the new Definition and its version 1. Returns its identity. */
export function createFromDraft(workspaceId: string): string {
  const shelf = shelfOf(workspaceId)
  if (!shelf.creating) throw new Error('Nothing is being created')
  const made = createDefinition({ id: newIdentity(taken), workspaceId, ...shelf.creating, resolve: catalogueOf(workspaceId).resolve })
  shelf.made = [...shelf.made, made]
  shelf.creating = null
  return made.id
}

export function setEvolving(workspaceId: string, id: string, draft: Draft | null) {
  const shelf = shelfOf(workspaceId)
  const { [id]: _, ...rest } = shelf.evolving
  shelf.evolving = draft ? { ...rest, [id]: draft } : rest
}

/** Makes the next version from the draft, leaving every earlier version as it was. */
export function versionFromDraft(workspaceId: string, id: string): number {
  const made = findMade(workspaceId, id)
  const draft = shelfOf(workspaceId).evolving[id]
  if (!made || !draft) throw new Error('Nothing to make a version from')
  const next = addVersion(made, draft, catalogueOf(workspaceId).resolve)
  replace(workspaceId, next)
  setEvolving(workspaceId, id, null)
  return next.versions.length
}

/** Its name, description or appearance: never a version (model.ts, renamed). */
export function redescribe(workspaceId: string, id: string, change: { name: string; description: string; appearance?: Appearance }) {
  const made = findMade(workspaceId, id)
  if (made) replace(workspaceId, renamed(made, change))
}

/** Whether a reload would lose anything from this workspace's shelf. */
export function shelfHasWork(workspaceId: string): boolean {
  const shelf = shelfOf(workspaceId)
  return shelf.made.length > 0 || shelf.creating !== null || Object.keys(shelf.evolving).length > 0
}

/**
 * Development only: the realistic samples (realistic.ts: Address v1 and v2, Emergency contact,
 * Employment, Candidate, Employee, Candidate contact) made in this workspace, so large Definitions
 * can be looked at in the catalogue and the Studio. Each becomes this workspace's own Definition
 * with a new identity (an identity is never reused), every version exactly as the sample has it and
 * every reference pointing at the same exact version of its new identity. Made with defineVersion,
 * like any version: nothing here is a new capability of Definitions. Once per workspace.
 */
export function addRealisticSamples(workspaceId: string): boolean {
  const shelf = shelfOf(workspaceId)
  if (shelf.made.some((d) => d.description === REALISTIC_NOTE)) return false
  const sources = [ADDRESS_V1, ...REALISTIC_DEFINITIONS]
  const ids = new Map<string, string>()
  for (const d of sources) if (!ids.has(d.id)) ids.set(d.id, newIdentity(taken))
  const remap = (fields: readonly Field[]): Field[] => fields.map((f) =>
    f.type === 'object' ? { ...f, fields: remap(f.fields) } : f.type === 'reference' ? { ...f, definition: { id: ids.get(f.definition.id)!, version: f.definition.version } } : f)
  const made: MadeDefinition[] = []
  const resolve = (ref: DefinitionRef) => made.flatMap((m) => m.versions).find((v) => v.id === ref.id && v.version === ref.version) ?? null
  for (const [old, id] of ids) {
    const versions = sources.filter((d) => d.id === old).sort((a, b) => a.version - b.version)
      .map((d) => defineVersion({ id, version: d.version, name: d.name, workspaceId, fields: remap(d.fields) }, resolve))
    made.push(deepFreeze({ id, workspaceId, name: versions.at(-1)!.name, description: REALISTIC_NOTE, appearance: DEFAULT_APPEARANCE, versions }))
  }
  for (const m of made) checkSequence(m)
  shelf.made = [...shelf.made, ...made]
  return true
}
/** How the realistic samples describe themselves (and how they're recognised, so they're added once). */
export const REALISTIC_NOTE = 'A realistic, synthetic sample for trying Orbit at size. Development only.'
