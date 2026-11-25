<script setup lang="ts">
// A number or true/false property: a field of the input of the same type, or a fixed value. Not
// the text-parts metaphor, and never a conversion: a text field can't fill a number (the
// Mapping's type check would refuse it, so the choice isn't offered). Anything else already in
// the Mapping is shown by the parts editor, with its problems, or in the advanced view.
import type { DefinitionVersion } from '#shared/features/definitions'
import type { MappingIssue, Path } from '#shared/features/mappings'
import { definitionLabel } from '../features/experiment'
import PieceEditor from './PieceEditor.vue'
import ShownText from './ShownText.vue'
import { type Piece, fromPiece } from './parts'
import { type Example, previewSource } from './preview'

const props = defineProps<{
  /** null while nothing makes this property yet. */
  piece: Piece | null
  type: 'number' | 'boolean'
  path: Path
  issues: readonly MappingIssue[]
  input: DefinitionVersion
  example: Example
  label: string
}>()
const emit = defineEmits<{ 'update:piece': [Piece] }>()

const compatible = computed(() => props.input.fields.filter((f) => f.type === props.type))
const mode = computed(() => (props.piece === null ? null : props.piece.kind === 'field' ? 'field' : props.piece.kind === 'literal' ? 'fixed' : 'other'))
const fixed = () => emit('update:piece', { kind: 'literal', value: props.type === 'number' ? 0 : true })
const fromField = (name: string) => emit('update:piece', { kind: 'field', name, trim: false })
const result = computed(() => (props.piece ? previewSource(fromPiece(props.piece), props.input, props.example) : null))
const words = computed(() => (props.type === 'number' ? 'number' : 'true-or-false'))
const tab = 'rounded-lg px-3 py-1.5 text-sm font-medium ring-1 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 disabled:opacity-40'
const control = 'rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-900 shadow-xs outline-none transition focus:border-accent-500 focus:ring-2 focus:ring-accent-100'
</script>

<template>
  <div>
    <PieceEditor v-if="mode === 'other'" top :piece="piece!" :path="path" :issues="issues" :input="input" :example="example" :label="label" @update:piece="emit('update:piece', $event)" />
    <template v-else>
      <div class="flex flex-wrap gap-2" role="group" :aria-label="`${label}: where its value comes from`">
        <button type="button" :class="[tab, mode === 'field' ? 'bg-accent-50 text-accent-800 ring-accent-300' : 'text-slate-700 ring-slate-200 hover:bg-slate-50']" :aria-pressed="mode === 'field'" :disabled="!compatible.length" @click="fromField(compatible[0]!.name)">From the input</button>
        <button type="button" :class="[tab, mode === 'fixed' ? 'bg-accent-50 text-accent-800 ring-accent-300' : 'text-slate-700 ring-slate-200 hover:bg-slate-50']" :aria-pressed="mode === 'fixed'" @click="mode !== 'fixed' && fixed()">A fixed value</button>
      </div>
      <p v-if="!compatible.length" class="mt-2 text-xs text-slate-500">{{ definitionLabel(input) }} has no {{ words }} fields, and Orbit never turns text into a {{ words }} value, so this needs a fixed value.</p>

      <div v-if="mode === 'field' && piece?.kind === 'field'" class="mt-3">
        <select :value="piece.name" :aria-label="`${label}: field`" :class="control" @change="fromField(($event.target as HTMLSelectElement).value)">
          <option v-for="f in compatible" :key="f.name" :value="f.name">{{ f.name }}</option>
        </select>
      </div>
      <div v-else-if="mode === 'fixed' && piece?.kind === 'literal'" class="mt-3 flex flex-wrap items-center gap-3">
        <input
          v-if="type === 'number'"
          :value="piece.value"
          type="number"
          :aria-label="`${label}: number`"
          :class="[control, 'w-32 font-mono']"
          @input="emit('update:piece', { kind: 'literal', value: ($event.target as HTMLInputElement).valueAsNumber })"
        >
        <div v-else class="flex gap-2" role="radiogroup" :aria-label="`${label}: yes or no`">
          <label v-for="v in [true, false]" :key="String(v)" class="flex items-center gap-1.5 text-sm text-slate-800">
            <input type="radio" class="accent-accent-600" :name="`${label}-bool`" :checked="piece.value === v" @change="emit('update:piece', { kind: 'literal', value: v })">
            {{ v ? 'Yes' : 'No' }}
          </label>
        </div>
        <span class="text-xs text-slate-500">The same for every input.</span>
      </div>
      <p v-if="result && 'value' in result && mode === 'field'" class="mt-2 flex items-center gap-1.5 text-xs text-slate-500">Example <ShownText :value="result.value" /></p>
      <p v-if="result && 'absent' in result" class="mt-2 text-xs text-slate-500">No value in the example: it has no {{ result.absent.join(', ') }}, so this is left out.</p>
      <ul v-if="result && 'problems' in result" class="mt-2 flex flex-col gap-0.5 text-sm text-red-700">
        <li v-for="p in result.problems" :key="p">{{ p }}</li>
      </ul>
    </template>
  </div>
</template>
