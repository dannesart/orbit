<script setup lang="ts">
// The output, property by property: every property the output Definition requires, whether
// something makes it yet, and (for the selected one only) how. With the Transform's own output,
// properties can be added, renamed, retyped and removed here; an existing Definition can't be
// changed. Mappings that no longer match a property are kept and listed, never dropped.
import type { DefinitionVersion, FieldType } from '#shared/features/definitions'
import { definitionLabel } from '../features/experiment'
import PieceEditor from './PieceEditor.vue'
import ScalarEditor from './ScalarEditor.vue'
import ValuePicker from './ValuePicker.vue'
import type { TransformDraft } from './config'
import { type Piece, combineWith, fromPiece, removeAt, replaceAt } from './parts'
import type { DraftReview, Example } from './preview'
import { describeSource } from './summary'

const props = defineProps<{ draft: TransformDraft; target: DefinitionVersion; targetLabel: string; review: DraftReview; input: DefinitionVersion; example: Example }>()
const emit = defineEmits<{ 'update:draft': [TransformDraft] }>()

const editable = computed(() => props.draft.use === 'local')
const fields = computed(() => props.target.fields)
const selected = ref<number | null>(props.target.fields.length ? 0 : null)
watch(() => fields.value.length, (n) => { if (selected.value !== null && selected.value >= n) selected.value = n ? n - 1 : null })
// A different output: open the first property that still needs a value (or the first one).
watch(() => `${props.target.id}@${props.target.version}:${props.draft.use}`, () => {
  const open = props.review.fields.findIndex((f) => f.state !== 'set')
  selected.value = props.review.fields.length ? Math.max(open, 0) : null
})
const root = ref<HTMLElement>()

// --- Mappings ---
const properties = computed(() => props.draft.properties)
const setProperties = (next: TransformDraft['properties']) => emit('update:draft', { ...props.draft, properties: next })
const setPiece = (index: number, piece: Piece) => setProperties(replaceAt(properties.value, index, { ...properties.value[index]!, piece }))
const choosing = ref(false)
const adding = ref(false)
function choose(name: string, piece: Piece) {
  choosing.value = false
  setProperties([...properties.value, { name, piece }])
}
function map(name: string, index: number, piece: Piece) {
  if (index < 0) choose(name, piece)
  else setPiece(index, piece)
}
function addPart(index: number, piece: Piece) {
  adding.value = false
  setPiece(index, combineWith(properties.value[index]!.piece, piece))
}
const single = (piece: Piece) => piece.kind === 'field' || piece.kind === 'text'

// --- The structure (only for the Transform's own output) ---
const setFields = (next: DefinitionVersion['fields'], nextProperties = properties.value) =>
  emit('update:draft', { ...props.draft, local: { ...props.draft.local, fields: next }, properties: nextProperties })
function rename(i: number, name: string) {
  const old = fields.value[i]!.name
  const index = old ? properties.value.findIndex((p) => p.name === old) : -1
  setFields(replaceAt(fields.value, i, { ...fields.value[i]!, name }), index >= 0 ? replaceAt(properties.value, index, { ...properties.value[index]!, name }) : properties.value)
}
const retype = (i: number, type: FieldType) => setFields(replaceAt(fields.value, i, { ...fields.value[i]!, type }))
function removeField(i: number) {
  const name = fields.value[i]!.name
  const shared = fields.value.some((f, j) => j !== i && f.name === name)
  const index = name && !shared ? properties.value.findIndex((p) => p.name === name) : -1
  setFields(removeAt(fields.value, i), index >= 0 ? removeAt(properties.value, index) : properties.value)
}
function addField() {
  const taken = new Set(fields.value.map((f) => f.name))
  let name = 'newProperty'
  for (let n = 2; taken.has(name); n++) name = `newProperty${n}`
  setFields([...fields.value, { name, type: 'string' }])
  selected.value = fields.value.length
  nextTick(() => {
    const input = root.value?.querySelector<HTMLInputElement>(`[data-row="${selected.value}"] input[data-name]`)
    input?.focus()
    input?.select()
  })
}

const toggle = (i: number) => {
  selected.value = selected.value === i ? null : i
  choosing.value = false
  adding.value = false
}
const typeWords: Record<FieldType, string> = { string: 'text', number: 'number', boolean: 'true or false' }
const status = {
  not_set: { icon: '○', label: 'Not mapped', tone: 'text-amber-700' },
  problem: { icon: '!', label: 'Needs attention', tone: 'text-red-700' },
  set: { icon: '✓', label: 'Mapped', tone: 'text-accent-700' },
}
const control = 'rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-900 shadow-xs outline-none transition focus:border-accent-500 focus:ring-2 focus:ring-accent-100'
</script>

<template>
  <div ref="root">
    <ul class="flex flex-col divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white" :aria-label="`${targetLabel}: its properties`">
      <li v-for="(f, i) in review.fields" :key="i" :data-row="i" :class="selected === i ? 'bg-accent-50/40' : ''">
        <button
          type="button"
          class="flex w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-500"
          :aria-expanded="selected === i"
          @click="toggle(i)"
        >
          <span class="min-w-0 flex-1">
            <span class="block truncate font-mono text-sm font-semibold text-slate-900">{{ f.name || '(no name)' }}</span>
            <span class="block text-xs text-slate-500 sm:hidden">{{ typeWords[f.expected] }}</span>
          </span>
          <span class="hidden w-24 shrink-0 text-xs text-slate-500 sm:block">{{ typeWords[f.expected] }}</span>
          <span class="flex shrink-0 items-center gap-1.5 text-xs font-medium sm:w-32" :class="status[f.state].tone">
            <span aria-hidden="true" class="w-3 text-center">{{ status[f.state].icon }}</span>{{ status[f.state].label }}
          </span>
          <span aria-hidden="true" class="text-xs text-slate-400">{{ selected === i ? '▴' : '▾' }}</span>
        </button>

        <div v-if="selected === i" class="border-t border-slate-100 px-4 pt-3 pb-4">
          <!-- The property itself (the Transform's own output only) -->
          <div v-if="editable" class="mb-3 flex flex-wrap items-end gap-2 rounded-xl bg-slate-50 p-2.5 ring-1 ring-slate-200">
            <label class="flex flex-col gap-1 text-xs font-medium text-slate-600">
              Property name
              <input data-name :value="fields[i]!.name" type="text" autocomplete="off" spellcheck="false" placeholder="propertyName" :class="[control, 'w-40 font-mono']" @input="rename(i, ($event.target as HTMLInputElement).value)">
            </label>
            <label class="flex flex-col gap-1 text-xs font-medium text-slate-600">
              Type
              <select :value="fields[i]!.type" :class="control" @change="retype(i, ($event.target as HTMLSelectElement).value as FieldType)">
                <option value="string">text</option>
                <option value="number">number</option>
                <option value="boolean">true or false</option>
              </select>
            </label>
            <button type="button" class="link ml-auto pb-1.5 text-xs" :aria-label="`Remove the property ${f.name || '(no name)'} and its mapping`" @click="removeField(i)">Remove property</button>
          </div>

          <!-- How its value is made -->
          <p v-if="!f.name" class="text-sm text-slate-500">Name this property first.</p>
          <template v-else>
            <div class="mb-2 flex items-center gap-3">
              <p class="mr-auto text-xs font-medium text-slate-500">Its value</p>
              <template v-if="f.index >= 0">
                <button v-if="properties[f.index]!.piece.kind !== 'advanced'" type="button" class="link text-xs text-slate-500" :aria-label="`Edit ${f.name} as an expression`" @click="setPiece(f.index, { kind: 'advanced', expression: fromPiece(properties[f.index]!.piece) })">Advanced</button>
                <button type="button" class="link text-xs text-slate-500" :aria-label="`Clear ${f.name}’s value`" @click="setProperties(removeAt(properties, f.index))">Clear</button>
              </template>
            </div>

            <ScalarEditor
              v-if="f.expected !== 'string'"
              :piece="f.index >= 0 ? properties[f.index]!.piece : null"
              :type="f.expected"
              :path="[f.name]"
              :issues="f.index >= 0 ? review.issues[f.index]! : []"
              :input="input"
              :example="example"
              :label="f.name"
              @update:piece="map(f.name, f.index, $event)"
            />
            <template v-else-if="f.index < 0">
              <ValuePicker v-if="choosing" :fields="input.fields" :example="example" :input-label="definitionLabel(input)" need="string" :heading="`Choose a value for ${f.name}`" @pick="choose(f.name, $event)" @cancel="choosing = false" />
              <button v-else type="button" class="btn-primary w-auto rounded-lg px-4 py-1.5 text-sm" @click="choosing = true">Choose a value</button>
            </template>
            <template v-else>
              <PieceEditor top :piece="properties[f.index]!.piece" :path="[f.name]" :issues="review.issues[f.index]!" :input="input" :example="example" :label="f.name" need="string" @update:piece="setPiece(f.index, $event)" />
              <template v-if="single(properties[f.index]!.piece)">
                <ValuePicker v-if="adding" class="mt-3" :fields="input.fields" :example="example" :input-label="definitionLabel(input)" need="string" heading="Add another part" @pick="addPart(f.index, $event)" @cancel="adding = false" />
                <button v-else type="button" class="link mt-2 text-sm" @click="adding = true">Add another part</button>
              </template>
            </template>
          </template>
          <ul v-if="f.problems.length" class="mt-2 flex flex-col gap-0.5 text-sm text-red-700">
            <li v-for="p in f.problems" :key="p">{{ p }}</li>
          </ul>
        </div>
      </li>
      <li v-if="!review.fields.length" class="px-4 py-3 text-sm text-slate-500">No properties yet.</li>
    </ul>

    <button
      v-if="editable"
      type="button"
      class="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-accent-300 hover:bg-accent-50 hover:text-accent-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
      @click="addField"
    >
      <span aria-hidden="true">+</span> Add output property
    </button>
    <p v-else class="mt-2 text-xs text-slate-500">These are {{ targetLabel }}’s properties, and they can’t be changed here. To shape the output yourself, choose “Its own output”.</p>

    <section v-if="review.extras.length" aria-labelledby="extras-heading" class="mt-4 rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
      <div class="flex items-baseline gap-3">
        <h4 id="extras-heading" class="mr-auto text-sm font-semibold text-slate-900">Mappings with no property to fill</h4>
        <button v-if="review.extras.length > 1" type="button" class="link text-sm" @click="setProperties(properties.filter((_, i) => !review.extras.some((x) => x.index === i)))">Remove all {{ review.extras.length }}</button>
      </div>
      <p class="mt-0.5 text-xs text-slate-600">Kept exactly as they are, in case you want them back. {{ targetLabel }} has no place for them.</p>
      <ul class="mt-3 flex flex-col gap-3">
        <li v-for="x in review.extras" :key="x.index" class="flex items-start gap-3">
          <div class="min-w-0 flex-1">
            <p class="text-sm text-slate-800"><span class="font-mono font-semibold">{{ properties[x.index]!.name || 'Unnamed' }}</span> ← {{ describeSource(fromPiece(properties[x.index]!.piece)) }}</p>
            <p class="text-xs text-amber-800">{{ x.reason }}</p>
          </div>
          <button type="button" class="link shrink-0 text-sm" :aria-label="`Remove the mapping for ${properties[x.index]!.name || 'the unnamed value'}`" @click="setProperties(removeAt(properties, x.index))">Remove</button>
        </li>
      </ul>
    </section>
  </div>
</template>
