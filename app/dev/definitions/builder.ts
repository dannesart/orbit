// What the model builder shares with every level of its tree (PropertyTree.vue): the draft, which
// row is open, which objects are folded, where new properties go, and dragging. One builder owns it
// (ModelBuilder.vue); each level only reads it and asks it to act.
import type { InjectionKey, Ref } from 'vue'
import type { PropertyPath } from '#shared/features/definitions'
import type { StudioCatalogue } from './catalogue'
import type { Draft } from './model'

/** Where a drop would land: among `parent`'s properties (null: the top level), before `index`. */
export interface DropPlace {
  readonly parent: number | null
  readonly index: number
}

export interface Builder {
  readonly draft: Ref<Draft>
  readonly idPrefix: string
  readonly catalogue: Ref<StudioCatalogue>
  /** The row whose editor is open (one at a time). */
  readonly open: Ref<number | null>
  /** Local objects folded away (they start unfolded). */
  readonly folded: Ref<ReadonlySet<number>>
  /** References unfolded to show what they contain (they start folded). */
  readonly unfolded: Ref<ReadonlySet<number>>
  /** The object new properties go into (null: the top level). */
  readonly target: Ref<number | null>
  readonly dragging: Ref<'block' | 'row' | null>
  readonly dropAt: Ref<DropPlace | null>
  update: (draft: Draft) => void
  toggle: (key: number) => void
  fold: (key: number) => void
  unfold: (key: number) => void
  setTarget: (key: number | null) => void
  remove: (key: number) => void
  move: (key: number, by: number, refocus?: 'handle' | 'button') => void
  moveInto: (key: number, parent: number | null) => void
  startRow: (event: DragEvent, key: number) => void
  over: (event: DragEvent, parent: number | null) => void
  leave: (event: DragEvent) => void
  drop: (event: DragEvent, parent: number | null) => void
  end: () => void
  handleKey: (event: KeyboardEvent, key: number) => void
  /** How a path reads for people ("contact › email"; the top level: "the top level"). */
  where: (path: PropertyPath) => string
}

export const BUILDER: InjectionKey<Builder> = Symbol('definition-model-builder')
