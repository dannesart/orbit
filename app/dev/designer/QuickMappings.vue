<script setup lang="ts">
// The output's properties in the inspector, one line each: "fullName ← firstName". A simple value
// (one field as it is, or one fixed value) is chosen right here; a composed value is described and
// opens the focused editor, so a dropdown can never replace a composition by accident.
import type { DefinitionVersion, FieldType } from '#shared/features/definitions'
import ShownText from './ShownText.vue'
import type { TransformDraft } from './config'
import { fromPiece, replaceAt } from './parts'
import { type DraftReview, type Example, friendlyIssue, previewSource } from './preview'
import { pieceOf, quickOf, startingValue } from './quick'
import { describeSource } from './summary'

const props = defineProps<{ draft: TransformDraft; review: DraftReview; input: DefinitionVersion; example: Example }>()
const emit = defineEmits<{ 'update:draft': [TransformDraft]; edit: [name: string] }>()

const properties = computed(() => props.draft.properties)
const pieceAt = (index: number) => (index >= 0 ? properties.value[index]!.piece : null)
function set(name: string, index: number, piece: ReturnType<typeof pieceOf>) {
  emit('update:draft', { ...props.draft, properties: index < 0 ? [...properties.value, { name, piece }] : replaceAt(properties.value, index, { ...properties.value[index]!, piece }) })
}
function choose(name: string, index: number, type: FieldType, value: string) {
  if (value === 'fixed') set(name, index, pieceOf({ kind: 'fixed', value: startingValue(type) }))
  else if (value.startsWith('field:')) set(name, index, pieceOf({ kind: 'field', name: value.slice(6) }))
}
const compatible = (type: FieldType) => props.input.fields.filter((f) => f.type === type)
const selectValue = (index: number) => {
  const q = quickOf(pieceAt(index))
  return q.kind === 'field' ? `field:${q.name}` : q.kind === 'fixed' ? 'fixed' : ''
}
const example = (index: number) => {
  const piece = pieceAt(index)
  if (!piece) return null
  const p = previewSource(fromPiece(piece), props.input, props.example)
  return 'value' in p ? p.value : null
}
/** The first thing wrong with a property, in words: its own problem, or one inside its value. */
const problemOf = (index: number, own: readonly string[]) => own[0] ?? (index >= 0 && props.review.issues[index]?.[0] ? friendlyIssue(props.review.issues[index]![0]!) : '')
const typeWords: Record<FieldType, string> = { string: 'text', number: 'number', boolean: 'yes or no' }
const status = {
  not_set: { icon: '○', label: 'Not mapped', tone: 'text-amber-600' },
  problem: { icon: '!', label: 'Needs attention', tone: 'text-red-600' },
  set: { icon: '✓', label: 'Mapped', tone: 'text-accent-600' },
}
const control = 'min-w-0 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-900 shadow-xs outline-none transition focus:border-accent-500 focus:ring-2 focus:ring-accent-100'
</script>

<template>
  <ul class="flex flex-col divide-y divide-slate-100 rounded-2xl bg-white ring-1 ring-slate-200/80">
    <li v-for="f in review.fields" :key="f.name" class="px-3.5 py-3">
      <div class="flex items-center gap-2">
        <span aria-hidden="true" class="w-3 text-center text-xs font-semibold" :class="status[f.state].tone">{{ status[f.state].icon }}</span>
        <span class="truncate font-mono text-sm font-semibold text-slate-900">{{ f.name || '(no name)' }}</span>
        <span class="text-xs text-slate-400">{{ typeWords[f.expected] }}</span>
        <span class="sr-only">{{ status[f.state].label }}</span>
        <button
          v-if="f.name"
          type="button"
          class="ml-auto rounded-full px-2.5 py-1 text-xs font-medium text-slate-500 transition hover:bg-accent-50 hover:text-accent-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
          :aria-label="`Compose ${f.name} in the editor`"
          @click="emit('edit', f.name)"
        >
          Compose
        </button>
      </div>

      <div v-if="f.name" class="mt-1.5 flex flex-wrap items-center gap-2 pl-5">
        <span aria-hidden="true" class="text-slate-400">←</span>
        <template v-if="quickOf(pieceAt(f.index)).kind === 'composed'">
          <button type="button" class="min-w-0 truncate text-left text-sm text-slate-700 hover:text-accent-700" :aria-label="`${f.name} is composed: ${describeSource(fromPiece(pieceAt(f.index)!))}. Open it in the editor`" @click="emit('edit', f.name)">
            {{ describeSource(fromPiece(pieceAt(f.index)!)) }}
          </button>
        </template>
        <template v-else>
          <select :value="selectValue(f.index)" :aria-label="`${f.name}: where its value comes from`" :class="control" @change="choose(f.name, f.index, f.expected, ($event.target as HTMLSelectElement).value)">
            <option value="" disabled>Choose…</option>
            <option v-for="x in compatible(f.expected)" :key="x.name" :value="`field:${x.name}`">{{ x.name }}</option>
            <option v-if="quickOf(pieceAt(f.index)).kind === 'field' && !compatible(f.expected).some((x) => `field:${x.name}` === selectValue(f.index))" :value="selectValue(f.index)">{{ selectValue(f.index).slice(6) }} (not in the input)</option>
            <option value="fixed">{{ f.expected === 'string' ? 'Fixed text' : 'Fixed value' }}</option>
          </select>
          <template v-if="quickOf(pieceAt(f.index)).kind === 'fixed'">
            <input
              v-if="f.expected === 'string' && pieceAt(f.index)?.kind === 'text'"
              :value="(pieceAt(f.index) as { value: string }).value"
              type="text"
              autocomplete="off"
              spellcheck="false"
              placeholder="Type the text"
              :aria-label="`${f.name}: fixed text`"
              :class="[control, 'w-36 font-mono']"
              @input="set(f.name, f.index, pieceOf({ kind: 'fixed', value: ($event.target as HTMLInputElement).value }))"
            >
            <input
              v-else-if="f.expected === 'number' && pieceAt(f.index)?.kind === 'literal'"
              :value="(pieceAt(f.index) as { value: number }).value"
              type="number"
              :aria-label="`${f.name}: fixed number`"
              :class="[control, 'w-24 font-mono']"
              @input="set(f.name, f.index, pieceOf({ kind: 'fixed', value: ($event.target as HTMLInputElement).valueAsNumber }))"
            >
            <select
              v-else-if="f.expected === 'boolean' && pieceAt(f.index)?.kind === 'literal'"
              :value="String((pieceAt(f.index) as { value: boolean }).value)"
              :aria-label="`${f.name}: yes or no`"
              :class="control"
              @change="set(f.name, f.index, pieceOf({ kind: 'fixed', value: ($event.target as HTMLSelectElement).value === 'true' }))"
            >
              <option value="true">Yes</option>
              <option value="false">No</option>
            </select>
          </template>
          <ShownText v-if="example(f.index) !== null && quickOf(pieceAt(f.index)).kind === 'field'" class="ml-auto" :value="example(f.index)!" />
        </template>
      </div>
      <p v-else class="mt-1 pl-5 text-xs text-slate-500">Name this property in Structure first.</p>
      <p v-if="f.state === 'problem'" class="mt-1 pl-5 text-xs text-red-700">{{ problemOf(f.index, f.problems) }}</p>
    </li>
    <li v-if="!review.fields.length" class="px-4 py-3 text-sm text-slate-500">No properties yet. Add some in Structure.</li>
  </ul>
</template>
