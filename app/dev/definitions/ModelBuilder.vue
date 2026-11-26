<script setup lang="ts">
// Building a Definition's model: the properties themselves, as a tree, with the toolbox of building
// blocks (PropertyToolbox) to their right. A block is added by clicking it (into the chosen place:
// the top level, or an object picked with its "Add here") or by dragging it to exactly where it
// should go, at any level; a new property is required, and its name field then has focus.
//
// Each property is a compact row (type, name, required or optional) that opens its own small editor,
// one at a time (PropertyTree.vue). A local object holds its own rows, folded or not; everything
// works the same inside it. Rows move with their handle (drag, or arrow keys within their level),
// with Move up/down, or into another object with "Move into". Dragging is never needed.
//
// The draft is the Studio's only model (model.ts): what Orbit accepts is decided by Orbit's own
// check of the resulting contract (draftProblems), never here.
import type { DefinitionRef, PropertyPath, PropertyType } from '#shared/features/definitions'
import { propertyPathWords } from '#shared/features/definitions'
import { type Builder, BUILDER, type DropPlace } from './builder'
import type { StudioCatalogue } from './catalogue'
import { type Draft, addField, childrenOf, findField, isWithin, moveField, removeField } from './model'
import PropertyToolbox from './PropertyToolbox.vue'
import PropertyTree from './PropertyTree.vue'

const props = defineProps<{ draft: Draft; idPrefix: string; catalogue: StudioCatalogue }>()
const emit = defineEmits<{ 'update:draft': [Draft] }>()

/** A building block: a basic type, or a reference to one exact version (with a suggested name). */
interface Block {
  readonly type: PropertyType
  readonly definition?: DefinitionRef
  readonly name?: string
}
const BLOCK_MIME = 'application/x-orbit-building-block'
const ROW_MIME = 'application/x-orbit-property-row'

const draft = computed(() => props.draft)
const catalogue = computed(() => props.catalogue)
const open = ref<number | null>(null)
const folded = ref<ReadonlySet<number>>(new Set())
const unfolded = ref<ReadonlySet<number>>(new Set())
const target = ref<number | null>(null)
const dragging = ref<'block' | 'row' | null>(null)
const dropAt = ref<DropPlace | null>(null)
const dragged = ref<number | null>(null)
const update = (next: Draft) => emit('update:draft', next)
const nameInput = (key: number) => document.getElementById(`${props.idPrefix}-name-${key}`) as HTMLInputElement | null
const flip = (set: ReadonlySet<number>, key: number) => {
  const next = new Set(set)
  if (!next.delete(key)) next.add(key)
  return next
}
const show = (parent: number | null) => {
  if (parent !== null && folded.value.has(parent)) folded.value = flip(folded.value, parent)
}

// The place new properties go stops being one when it's gone.
watch(draft, (now) => {
  if (target.value !== null && !findField(now, target.value)) target.value = null
})
const targetPath = computed(() => (target.value === null ? null : findField(draft.value, target.value)?.path ?? null))
const where = (path: PropertyPath) => (path.length ? propertyPathWords(path.map((n) => n.trim() || 'unnamed')) : 'the top level')

/** Adds a block at a place (the chosen one by default), opens it and focuses its name. */
function add(block: Block, place?: DropPlace) {
  const parent = place ? place.parent : target.value
  const added = addField(draft.value, block.type, { parent, index: place?.index, definition: block.definition, name: block.name })
  const key = added.nextKey - 1
  update(added)
  show(parent)
  open.value = key
  nextTick(() => nameInput(key)?.select())
}
function remove(key: number) {
  const at = findField(draft.value, key)
  update(removeField(draft.value, key))
  open.value = null
  // Focus stays in the model: on the row that took its place, its object, or the first block to add.
  nextTick(() => {
    const siblings = at ? childrenOf(draft.value, at.parent) : []
    const next = siblings[Math.min(at?.index ?? 0, siblings.length - 1)]?.key ?? at?.parent ?? null
    const row = next !== null ? document.querySelector<HTMLElement>(`[data-row="${next}"] [data-row-toggle]`) : null
    ;(row ?? document.querySelector<HTMLElement>('[data-add-type="string"]'))?.focus()
  })
}
function move(key: number, by: number, refocus: 'handle' | 'button' = 'button') {
  const at = findField(draft.value, key)
  if (!at) return
  const to = at.index + by
  if (to < 0 || to >= childrenOf(draft.value, at.parent).length) return
  update(moveField(draft.value, key, to))
  nextTick(() => document.querySelector<HTMLElement>(refocus === 'handle' ? `[data-row="${key}"] [data-handle]` : `[data-row="${key}"] [data-move="${by < 0 ? 'up' : 'down'}"]`)?.focus())
}
function moveInto(key: number, parent: number | null) {
  update(moveField(draft.value, key, childrenOf(draft.value, parent).length, parent))
  show(parent)
  nextTick(() => document.querySelector<HTMLElement>(`[data-row="${key}"] [data-row-toggle]`)?.scrollIntoView({ block: 'nearest' }))
}

// --- Dragging: a block from the toolbox, or a row by its handle, to exactly one level ---
function startBlock(event: DragEvent, block: Block) {
  event.dataTransfer?.setData(BLOCK_MIME, JSON.stringify(block))
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy'
  dragging.value = 'block'
}
function startRow(event: DragEvent, key: number) {
  event.dataTransfer?.setData(ROW_MIME, String(key))
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
  const card = (event.target as HTMLElement).closest('[data-row]')?.querySelector('[data-row-card]')
  if (card && event.dataTransfer) event.dataTransfer.setDragImage(card, 24, 20)
  dragging.value = 'row'
  dragged.value = key
  open.value = null
}
const ours = (event: DragEvent) => !!event.dataTransfer && [BLOCK_MIME, ROW_MIME].some((t) => event.dataTransfer!.types.includes(t))
/** Where in one level a drop would land: before the first of its own rows whose middle is below the pointer. */
function indexAt(event: DragEvent) {
  const level = event.currentTarget as HTMLElement
  const rows = [...level.querySelectorAll<HTMLElement>(':scope > ul > li[data-row] > [data-row-card]')]
  const i = rows.findIndex((r) => {
    const box = r.getBoundingClientRect()
    return event.clientY < box.top + Math.min(box.height, 52) / 2
  })
  return i < 0 ? rows.length : i
}
/** A row can't go into itself or anything inside it. */
const refused = (parent: number | null) => dragging.value === 'row' && dragged.value !== null && parent !== null && isWithin(draft.value, parent, dragged.value)
function over(event: DragEvent, parent: number | null) {
  if (!ours(event) || refused(parent)) return
  event.preventDefault()
  event.stopPropagation()
  if (event.dataTransfer) event.dataTransfer.dropEffect = dragging.value === 'row' ? 'move' : 'copy'
  dropAt.value = { parent, index: indexAt(event) }
}
function leave(event: DragEvent) {
  if (!(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node | null)) dropAt.value = null
}
function drop(event: DragEvent, parent: number | null) {
  if (!ours(event) || refused(parent)) return
  event.preventDefault()
  event.stopPropagation()
  const index = indexAt(event)
  const block = event.dataTransfer?.getData(BLOCK_MIME)
  const row = event.dataTransfer?.getData(ROW_MIME)
  if (block) add(JSON.parse(block) as Block, { parent, index })
  else if (row) {
    const key = Number(row)
    const from = findField(draft.value, key)
    if (from) update(moveField(draft.value, key, from.parent === parent && index > from.index ? index - 1 : index, parent))
    show(parent)
  }
  end()
}
function end() {
  dragging.value = null
  dropAt.value = null
  dragged.value = null
}
function handleKey(event: KeyboardEvent, key: number) {
  if (event.key === 'ArrowUp') { event.preventDefault(); move(key, -1, 'handle') }
  if (event.key === 'ArrowDown') { event.preventDefault(); move(key, 1, 'handle') }
}

const builder: Builder = {
  draft, idPrefix: props.idPrefix, catalogue, open, folded, unfolded, target, dragging, dropAt, update, where,
  toggle: (key) => (open.value = open.value === key ? null : key),
  fold: (key) => (folded.value = flip(folded.value, key)),
  unfold: (key) => (unfolded.value = flip(unfolded.value, key)),
  setTarget: (key) => {
    target.value = key
    show(key)
    nextTick(() => document.querySelector<HTMLElement>('[data-toolbox] [data-add-type]')?.focus())
  },
  remove, move, moveInto, startRow, over, leave, drop, end, handleKey,
}
provide(BUILDER, builder)
</script>

<template>
  <div class="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_17rem] lg:gap-8">
    <!-- The toolbox: right of the model on wide screens (in view while it scrolls), a strip above it otherwise -->
    <PropertyToolbox
      class="min-w-0 self-start lg:sticky lg:top-6 lg:order-last"
      :target="targetPath ? where(targetPath) : null"
      :catalogue="catalogue"
      @add="add($event)"
      @drag="startBlock"
      @dragend="end"
      @clear-target="target = null"
    />

    <!-- The model -->
    <section aria-labelledby="model-heading" class="min-w-0">
      <div class="flex items-baseline gap-2">
        <h2 id="model-heading" class="text-xs font-medium text-slate-500">Properties</h2>
        <span class="text-xs text-slate-400">{{ draft.fields.length }}</span>
      </div>
      <PropertyTree class="mt-2" data-model-drop :fields="draft.fields" :parent="null" :path="[]" />
    </section>
  </div>
</template>
