<script setup lang="ts">
// What a Console actually observed, as a tree rather than raw text: one level of it. The data
// is shown exactly as it arrived; its Definition (resolved exactly, as the boundary resolved it)
// only says what each place is: a local object, a reference to which Definition version, and an
// optional property that is absent. Nothing is reconstructed or filled in: absent says absent, an
// empty object says empty. Nested objects start folded, with a summary; each opens on its own.
// Where the Definition can't be resolved here, the data alone is shown.
//
// Every name and value is shown whole: a short name and value share a row, a long one wraps onto
// the next line (never cut to "tr…"). `query` narrows it to the places whose name contains it, with
// the objects that lead to them opened: a search through what's shown, never a change to it.
import type { DefinitionRef, Field, Resolve, Scalar } from '#shared/features/definitions'
import DefinitionsIcon from '../definitions/DefinitionsIcon.vue'
import DesignerIcon from './DesignerIcon.vue'
import ObservedTree from './ObservedTree.vue'
import ShownText from './ShownText.vue'

const props = defineProps<{
  data: Readonly<Record<string, unknown>>
  /** The Definition's properties at this level, or null when they can't be resolved here. */
  fields: readonly Field[] | null
  resolve: Resolve
  label: (ref: DefinitionRef) => string
  /** Only the places whose name contains this (ignoring case), and what leads to them. */
  query?: string
}>()

interface Row {
  readonly name: string
  readonly present: boolean
  readonly value: unknown
  readonly field: Field | null
}
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
// The Definition's order, then anything the data holds that it doesn't name (never after
// validation, but shown rather than hidden if it ever is).
const rows = computed<Row[]>(() => {
  const named = (props.fields ?? []).map((f) => ({ name: f.name, present: Object.hasOwn(props.data, f.name), value: props.data[f.name], field: f }))
  const other = Object.keys(props.data).filter((k) => !props.fields?.some((f) => f.name === k)).map((k) => ({ name: k, present: true, value: props.data[k], field: null }))
  const all = [...named, ...other]
  return q.value ? all.filter((r) => hit(r.name) || (isObject(r.value) && within(r.value))) : all
})
// Searching: a name that contains the query, here or anywhere inside a value.
const q = computed(() => (props.query ?? '').trim().toLowerCase())
const hit = (name: string) => name.toLowerCase().includes(q.value)
const within = (v: Record<string, unknown>): boolean => Object.entries(v).some(([k, x]) => hit(k) || (isObject(x) && within(x)))
/** Open: by choice, or because what was searched for is inside it. */
const isOpen = (r: Row) => open.value.has(r.name) || (!!q.value && isObject(r.value) && within(r.value))
/** What a nested level is searched for: nothing more once this level's name matched. */
const passOn = (r: Row) => (q.value && !hit(r.name) ? props.query : '')
const inside = (r: Row): readonly Field[] | null => {
  if (r.field?.type === 'object') return r.field.fields
  if (r.field?.type === 'reference') return props.resolve(r.field.definition)?.fields ?? null
  return null
}
const count = (v: Record<string, unknown>) => Object.keys(v).length
const open = ref(new Set<string>())
const flip = (name: string) => {
  const next = new Set(open.value)
  if (!next.delete(name)) next.add(name)
  open.value = next
}
const scalar = (v: unknown): v is Scalar => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'
</script>

<template>
  <ul class="divide-y divide-slate-100">
    <li v-for="r in rows" :key="r.name" class="py-1.5" :data-observed="r.name">
      <!-- An object (local or referenced): its own fold, with what it is and how much it holds -->
      <template v-if="r.present && isObject(r.value)">
        <button
          type="button"
          class="flex w-full min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 rounded-lg text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 disabled:cursor-default"
          :aria-expanded="count(r.value) ? isOpen(r) : undefined"
          :disabled="!count(r.value)"
          @click="flip(r.name)"
        >
          <DesignerIcon v-if="count(r.value)" name="chevron" class="size-3.5 shrink-0 text-slate-400 transition-transform" :class="{ 'rotate-90': isOpen(r) }" />
          <span v-else class="w-3.5 shrink-0" aria-hidden="true" />
          <DefinitionsIcon :name="r.field?.type === 'reference' ? 'reference' : 'object'" class="size-3.5 shrink-0 text-accent-500" />
          <span class="max-w-[calc(100%-3rem)] shrink-0 font-mono [overflow-wrap:anywhere] text-slate-700">{{ r.name }}</span>
          <span v-if="r.field?.type === 'reference'" class="shrink-0 text-xs text-slate-500">{{ label(r.field.definition) }}</span>
          <span class="ml-auto shrink-0 text-xs text-slate-400">{{ count(r.value) ? (count(r.value) === 1 ? '1 property' : `${count(r.value)} properties`) : 'empty' }}</span>
        </button>
        <div v-if="isOpen(r)" class="mt-1 ml-1.5 border-l-2 pl-3" :class="r.field?.type === 'reference' ? 'border-dashed border-slate-200' : 'border-slate-100'">
          <ObservedTree :data="r.value" :fields="inside(r)" :resolve="resolve" :label="label" :query="passOn(r)" />
        </div>
      </template>
      <!-- A value, or a place the Definition has that this data leaves out -->
      <!-- Name and value share a row when they fit; otherwise the value wraps onto its own line, right-aligned -->
      <div v-else class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <span class="w-3.5 shrink-0" aria-hidden="true" />
        <span class="max-w-[calc(100%-1.5rem)] shrink-0 font-mono [overflow-wrap:anywhere]" :class="r.present ? 'text-slate-700' : 'text-slate-400'">{{ r.name }}</span>
        <span class="ml-auto max-w-full min-w-0 text-right">
          <ShownText v-if="r.present && scalar(r.value)" :value="r.value" wrap />
          <span v-else-if="r.present" class="font-mono text-xs text-slate-700">{{ JSON.stringify(r.value) }}</span>
          <span v-else class="text-xs text-slate-400">absent</span>
        </span>
      </div>
    </li>
    <li v-if="!rows.length" class="py-1.5 text-xs text-slate-400">{{ q ? 'Nothing by that name' : 'Nothing' }}</li>
  </ul>
</template>
