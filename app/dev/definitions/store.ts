// Experiment #7's shared state: what the Definitions place and the Designer both see, kept in this
// browser tab's memory and nowhere else. It outlives moving between Orbit's pages (they're one
// app), and ends with a reload or with closing the tab. Nothing is fetched, saved or logged.
//
// Each workspace has its own shelf: what's made in one is never seen from another. Only the
// browser writes here (the server renders an empty, throwaway shelf), so nothing can be shared
// between people through the server's memory.
import { reactive } from 'vue'
import { type Appearance, DEFAULT_APPEARANCE } from './appearance'
import { DEFINITIONS } from '../features/experiment'
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
