<script setup lang="ts">
// The properties of a version being drafted: named in plain words, each text, a number or yes/no
// (all Orbit's Definitions support). Rows can be added, renamed, retyped and removed; nothing here
// makes a version.
import type { FieldType } from '#shared/features/definitions'
import { type Draft, addField, removeField, typeWords, updateField } from './model'

const props = defineProps<{ draft: Draft; idPrefix: string }>()
const emit = defineEmits<{ 'update:draft': [Draft] }>()
const root = ref<HTMLElement>()
const TYPES: FieldType[] = ['string', 'number', 'boolean']

function add() {
  const next = addField(props.draft)
  emit('update:draft', next)
  nextTick(() => root.value?.querySelector<HTMLInputElement>(`[data-row="${next.nextKey - 1}"] input[type="text"]`)?.focus())
}
function remove(key: number) {
  const index = props.draft.fields.findIndex((f) => f.key === key)
  emit('update:draft', removeField(props.draft, key))
  // Focus stays in the list: on the row that took its place, or on "Add a property".
  nextTick(() => {
    const rows = root.value?.querySelectorAll<HTMLInputElement>('input[type="text"]')
    ;(rows?.[Math.min(index, (rows?.length ?? 1) - 1)] ?? root.value?.querySelector<HTMLElement>('[data-add]'))?.focus()
  })
}
</script>

<template>
  <div ref="root">
    <ul class="flex flex-col gap-2" aria-label="Properties">
      <li v-for="(f, i) in draft.fields" :key="f.key" :data-row="f.key" class="flex flex-wrap items-center gap-2 rounded-2xl bg-white p-2.5 ring-1 ring-slate-200 sm:flex-nowrap">
        <label class="sr-only" :for="`${idPrefix}-name-${f.key}`">Name of property {{ i + 1 }}</label>
        <input
          :id="`${idPrefix}-name-${f.key}`"
          :value="f.name"
          type="text"
          autocomplete="off"
          placeholder="e.g. First name"
          class="min-w-0 flex-1 basis-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-accent-500 focus:ring-2 focus:ring-accent-100 sm:basis-auto"
          @input="emit('update:draft', updateField(draft, f.key, { name: ($event.target as HTMLInputElement).value }))"
        >
        <div role="radiogroup" :aria-label="`What ${f.name.trim() || `property ${i + 1}`} holds`" class="flex shrink-0 rounded-full bg-slate-100 p-0.5">
          <label
            v-for="t in TYPES"
            :key="t"
            class="cursor-pointer rounded-full px-3 py-1.5 text-xs font-medium transition has-focus-visible:ring-2 has-focus-visible:ring-accent-500"
            :class="f.type === t ? 'bg-white text-accent-700 shadow-sm ring-1 ring-accent-200' : 'text-slate-600 hover:text-slate-900'"
          >
            <input type="radio" class="sr-only" :name="`${idPrefix}-type-${f.key}`" :checked="f.type === t" @change="emit('update:draft', updateField(draft, f.key, { type: t }))">
            {{ typeWords[t] }}
          </label>
        </div>
        <button
          type="button"
          class="ml-auto grid size-9 shrink-0 place-items-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
          :aria-label="`Remove ${f.name.trim() || `property ${i + 1}`}`"
          @click="remove(f.key)"
        >
          ✕
        </button>
      </li>
    </ul>
    <button
      type="button"
      data-add
      class="mt-2 flex w-full items-center justify-center gap-1.5 rounded-2xl border border-dashed border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:border-accent-300 hover:bg-accent-50 hover:text-accent-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
      @click="add"
    >
      <span aria-hidden="true">+</span> Add a property
    </button>
  </div>
</template>
