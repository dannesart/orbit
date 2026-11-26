<script setup lang="ts">
// Building a Definition's model: the properties themselves, with the toolbox of building blocks
// (PropertyToolbox) to their right. A block is added by clicking it or by dragging it into the model
// (same result, and a new property is required); its name field then has focus. Each property is a
// compact row (type, name, required or optional); the row opens its own small editor (name, type,
// required or optional, move, remove), one at a time. Order is presentation only (model.ts,
// versionLike): rows move with their handle (drag, or arrow keys on it) or with Move up/down.
// Dragging is never needed: everything works by click, tap and keyboard.
import type { FieldType } from '#shared/features/definitions'
import { type Draft, addField, moveField, removeField, typeWords, updateField } from './model'
import DefinitionsIcon from './DefinitionsIcon.vue'
import PropertyToolbox from './PropertyToolbox.vue'

const props = defineProps<{ draft: Draft; idPrefix: string }>()
const emit = defineEmits<{ 'update:draft': [Draft] }>()

const TYPES: FieldType[] = ['string', 'number', 'boolean']
const TYPE_MIME = 'application/x-orbit-property-type'
const ROW_MIME = 'application/x-orbit-property-row'

const open = ref<number | null>(null)
const list = ref<HTMLElement>()
const nameInput = (key: number) => document.getElementById(`${props.idPrefix}-name-${key}`) as HTMLInputElement | null

/** Adds a property of this type at `index` (the end by default), opens it and focuses its name. */
function add(type: FieldType, index = props.draft.fields.length) {
  const added = addField(props.draft, type)
  const key = added.nextKey - 1
  emit('update:draft', index < props.draft.fields.length ? moveField(added, key, index) : added)
  open.value = key
  nextTick(() => nameInput(key)?.focus())
}
function remove(key: number) {
  const index = props.draft.fields.findIndex((f) => f.key === key)
  emit('update:draft', removeField(props.draft, key))
  open.value = null
  // Focus stays in the model: on the row that took its place, or on the first type to add.
  nextTick(() => {
    const rows = list.value?.querySelectorAll<HTMLElement>('[data-row-toggle]')
    ;(rows?.[Math.min(index, (rows?.length ?? 1) - 1)] ?? document.querySelector<HTMLElement>(`[data-add-type="string"]`))?.focus()
  })
}
function move(key: number, by: number, refocus: 'handle' | 'button' = 'button') {
  const index = props.draft.fields.findIndex((f) => f.key === key)
  const to = index + by
  if (index < 0 || to < 0 || to >= props.draft.fields.length) return
  emit('update:draft', moveField(props.draft, key, to))
  nextTick(() => list.value?.querySelector<HTMLElement>(refocus === 'handle' ? `[data-row="${key}"] [data-handle]` : `[data-row="${key}"] [data-move="${by < 0 ? 'up' : 'down'}"]`)?.focus())
}
const toggle = (key: number) => (open.value = open.value === key ? null : key)

// --- Dragging: a type from the palette, or a row by its handle ---
const dragging = ref<'type' | 'row' | null>(null)
const dropAt = ref<number | null>(null)
function startType(event: DragEvent, type: FieldType) {
  event.dataTransfer?.setData(TYPE_MIME, type)
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy'
  dragging.value = 'type'
}
function startRow(event: DragEvent, key: number) {
  event.dataTransfer?.setData(ROW_MIME, String(key))
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
  const row = (event.target as HTMLElement).closest('[data-row]')
  if (row && event.dataTransfer) event.dataTransfer.setDragImage(row, 24, 20)
  dragging.value = 'row'
}
const ours = (event: DragEvent) => !!event.dataTransfer && [TYPE_MIME, ROW_MIME].some((t) => event.dataTransfer!.types.includes(t))
/** Where a drop would land: before the first row whose middle is below the pointer. */
function indexAt(event: DragEvent) {
  const rows = [...(list.value?.querySelectorAll<HTMLElement>('[data-row]') ?? [])]
  const i = rows.findIndex((r) => {
    const box = r.getBoundingClientRect()
    return event.clientY < box.top + Math.min(box.height, 52) / 2
  })
  return i < 0 ? rows.length : i
}
function over(event: DragEvent) {
  if (!ours(event)) return
  event.preventDefault()
  if (event.dataTransfer) event.dataTransfer.dropEffect = dragging.value === 'row' ? 'move' : 'copy'
  dropAt.value = indexAt(event)
}
function leave(event: DragEvent) {
  if (!(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node | null)) dropAt.value = null
}
function drop(event: DragEvent) {
  if (!ours(event)) return
  event.preventDefault()
  const index = indexAt(event)
  const type = event.dataTransfer?.getData(TYPE_MIME) as FieldType | ''
  const row = event.dataTransfer?.getData(ROW_MIME)
  if (type && TYPES.includes(type)) add(type, index)
  else if (row) {
    const key = Number(row)
    const from = props.draft.fields.findIndex((f) => f.key === key)
    if (from >= 0) emit('update:draft', moveField(props.draft, key, index > from ? index - 1 : index))
  }
  end()
}
function end() {
  dragging.value = null
  dropAt.value = null
}
function handleKey(event: KeyboardEvent, key: number) {
  if (event.key === 'ArrowUp') { event.preventDefault(); move(key, -1, 'handle') }
  if (event.key === 'ArrowDown') { event.preventDefault(); move(key, 1, 'handle') }
}

const label = (name: string, i: number) => name.trim() || `Property ${i + 1}`
const segment = 'flex-1 whitespace-nowrap rounded-full px-2 py-1.5 text-xs font-medium transition sm:px-3 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent-500'
const small = 'grid size-8 place-items-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 disabled:opacity-30 disabled:hover:bg-transparent'
</script>

<template>
  <div class="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_17rem] lg:gap-8">
    <!-- The toolbox: right of the model on wide screens (in view while it scrolls), a strip above it otherwise -->
    <PropertyToolbox class="min-w-0 self-start lg:sticky lg:top-6 lg:order-last" :target="null" @add="add($event)" @drag="startType" @dragend="end" />

    <!-- The model -->
    <section aria-labelledby="model-heading" class="min-w-0">
      <div class="flex items-baseline gap-2">
        <h2 id="model-heading" class="text-xs font-medium text-slate-500">Properties</h2>
        <span class="text-xs text-slate-400">{{ draft.fields.length }}</span>
      </div>
      <div
        ref="list"
        data-model-drop
        class="relative mt-2 rounded-2xl transition"
        :class="dragging ? 'bg-accent-50/50 ring-2 ring-accent-200 ring-offset-4 ring-offset-white' : ''"
        @dragover="over"
        @dragleave="leave"
        @drop="drop"
      >
        <ul v-if="draft.fields.length" class="flex flex-col gap-1.5">
          <li v-for="(f, i) in draft.fields" :key="f.key" :data-row="f.key" class="relative">
            <div v-if="dropAt === i" class="absolute inset-x-2 -top-1 h-0.5 rounded-full bg-accent-500" aria-hidden="true" />
            <div class="rounded-xl border bg-white transition" :class="open === f.key ? 'border-accent-200 shadow-sm' : 'border-slate-200/80 hover:border-slate-300'">
              <div class="flex items-center gap-1 pr-2">
                <button
                  type="button"
                  data-handle
                  draggable="true"
                  :aria-label="`Move ${label(f.name, i)}: arrow keys`"
                  class="grid h-11 w-7 shrink-0 cursor-grab place-items-center rounded-l-xl text-slate-300 transition hover:text-slate-500 focus-visible:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 active:cursor-grabbing"
                  @dragstart="startRow($event, f.key)"
                  @dragend="end"
                  @keydown="handleKey($event, f.key)"
                >
                  <DefinitionsIcon name="grip" class="size-4" />
                </button>
                <button
                  type="button"
                  data-row-toggle
                  :aria-expanded="open === f.key"
                  :aria-controls="`${idPrefix}-row-${f.key}`"
                  class="flex min-w-0 flex-1 items-center gap-3 rounded-lg py-2 pr-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
                  @click="toggle(f.key)"
                >
                  <span class="grid size-7 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600">
                    <DefinitionsIcon :name="f.type" class="size-4" />
                  </span>
                  <span class="min-w-0 flex-1 truncate font-mono text-sm" :class="f.name.trim() ? 'text-slate-900' : 'text-slate-400 italic'">{{ f.name.trim() || 'unnamed' }}</span>
                  <span class="hidden shrink-0 text-xs text-slate-500 sm:inline">{{ typeWords[f.type] }}</span>
                  <span class="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium" :class="f.optional ? 'bg-slate-100 text-slate-500' : 'bg-accent-50 text-accent-700'">{{ f.optional ? 'Optional' : 'Required' }}</span>
                  <DefinitionsIcon name="chevron" class="size-4 shrink-0 text-slate-400 transition-transform" :class="{ 'rotate-90': open === f.key }" />
                </button>
              </div>

              <!-- The row's own editor -->
              <div v-if="open === f.key" :id="`${idPrefix}-row-${f.key}`" class="flex flex-col gap-3 border-t border-slate-100 px-4 pt-3 pb-4" @keydown.escape.stop="open = null">
                <div>
                  <label :for="`${idPrefix}-name-${f.key}`" class="text-xs font-medium text-slate-600">Name</label>
                  <input
                    :id="`${idPrefix}-name-${f.key}`"
                    :value="f.name"
                    type="text"
                    maxlength="64"
                    autocomplete="off"
                    placeholder="e.g. First name"
                    class="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-accent-500 focus:ring-2 focus:ring-accent-100"
                    @input="emit('update:draft', updateField(draft, f.key, { name: ($event.target as HTMLInputElement).value }))"
                    @keydown.enter.prevent="open = null"
                  >
                </div>
                <div class="flex flex-wrap gap-3">
                  <div role="radiogroup" :aria-label="`What ${label(f.name, i)} holds`" class="flex min-w-56 flex-1 rounded-full bg-slate-100 p-0.5">
                    <label v-for="t in TYPES" :key="t" :class="[segment, 'flex cursor-pointer items-center justify-center gap-1.5', f.type === t ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800']">
                      <input type="radio" class="sr-only" :name="`${idPrefix}-type-${f.key}`" :checked="f.type === t" @change="emit('update:draft', updateField(draft, f.key, { type: t }))">
                      <DefinitionsIcon :name="t" class="size-3.5" />{{ typeWords[t] }}
                    </label>
                  </div>
                  <div role="radiogroup" :aria-label="`Whether ${label(f.name, i)} is required`" class="flex min-w-44 flex-1 rounded-full bg-slate-100 p-0.5">
                    <label v-for="o in [false, true]" :key="String(o)" :class="[segment, 'flex cursor-pointer items-center justify-center', f.optional === o ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800']">
                      <input type="radio" class="sr-only" :name="`${idPrefix}-optional-${f.key}`" :checked="f.optional === o" @change="emit('update:draft', updateField(draft, f.key, { optional: o }))">
                      {{ o ? 'Optional' : 'Required' }}
                    </label>
                  </div>
                </div>
                <div class="flex items-center gap-1">
                  <button type="button" data-move="up" :class="small" :disabled="i === 0" :aria-label="`Move ${label(f.name, i)} up`" title="Move up" @click="move(f.key, -1)">
                    <DefinitionsIcon name="up" class="size-4" />
                  </button>
                  <button type="button" data-move="down" :class="small" :disabled="i === draft.fields.length - 1" :aria-label="`Move ${label(f.name, i)} down`" title="Move down" @click="move(f.key, 1)">
                    <DefinitionsIcon name="down" class="size-4" />
                  </button>
                  <button type="button" class="ml-auto rounded-full px-3 py-1.5 text-xs font-medium text-red-700 transition hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500" @click="remove(f.key)">
                    Remove {{ label(f.name, i) }}
                  </button>
                </div>
              </div>
            </div>
          </li>
        </ul>
        <div v-if="dropAt === draft.fields.length && draft.fields.length" class="mt-1 h-0.5 rounded-full bg-accent-500" aria-hidden="true" />

        <!-- Where new properties go: always there, and plainly a target while dragging. -->
        <p
          class="flex items-center justify-center gap-2 rounded-xl border border-dashed px-4 text-sm transition"
          :class="[draft.fields.length ? 'mt-2 py-3' : 'py-10', dragging === 'type' ? 'border-accent-400 text-accent-700' : 'border-slate-300 text-slate-500']"
        >
          <DefinitionsIcon name="plus" class="size-4" />
          <span v-if="dragging === 'type'">Drop to add it here</span>
          <template v-else>
            <!-- Phones can't drag here: they're told what works. -->
            <span class="lg:hidden">{{ draft.fields.length ? 'Choose a type above to add another' : 'Choose a type above to add the first property' }}</span>
            <span class="hidden lg:inline">{{ draft.fields.length ? 'Drag a type here, or choose one to add another property' : 'Drag a type here, or choose one, to add the first property' }}</span>
          </template>
        </p>
      </div>
    </section>
  </div>
</template>
