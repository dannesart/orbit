<script setup lang="ts">
// The Transform's setup, driven by the target Definition: one row for each field it needs, by its
// real name, saying whether something makes it yet. Nobody types a property name. Properties the
// Definition doesn't have are kept as they are and listed, for the person to remove or not.
import type { DefinitionVersion, FieldType } from '#shared/features/definitions'
import { definitionLabel } from '../features/experiment'
import PieceEditor from './PieceEditor.vue'
import ValuePicker from './ValuePicker.vue'
import { type DraftProperty, type Piece, combineWith, fromPiece, removeAt, replaceAt } from './parts'
import type { DraftReview, Example } from './preview'
import { describeSource } from './summary'

const props = defineProps<{ draft: readonly DraftProperty[]; review: DraftReview; input: DefinitionVersion; target: DefinitionVersion; example: Example }>()
const emit = defineEmits<{ 'update:draft': [DraftProperty[]] }>()

const setPiece = (index: number, piece: Piece) => emit('update:draft', replaceAt(props.draft, index, { ...props.draft[index]!, piece }))
const choosing = ref<string | null>(null)
const adding = ref<string | null>(null)
function choose(name: string, piece: Piece) {
  choosing.value = null
  emit('update:draft', [...props.draft, { name, piece }])
}
function addPart(index: number, piece: Piece) {
  adding.value = null
  setPiece(index, combineWith(props.draft[index]!.piece, piece))
}
const single = (piece: Piece) => piece.kind === 'field' || piece.kind === 'text'

const typeWords: Record<FieldType, string> = { string: 'text', number: 'number', boolean: 'true or false' }
const states = {
  not_set: { label: 'Not set', tone: 'bg-amber-50 text-amber-800 ring-amber-200', card: 'border-amber-200 border-dashed' },
  problem: { label: 'Needs attention', tone: 'bg-red-50 text-red-700 ring-red-200', card: 'border-red-200' },
  set: { label: 'Set', tone: 'bg-slate-100 text-slate-700 ring-slate-200', card: 'border-slate-200' },
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <section
      v-for="f in review.fields"
      :key="f.name"
      :aria-label="`${f.name}: ${states[f.state].label}`"
      class="rounded-2xl border bg-white p-4"
      :class="states[f.state].card"
    >
      <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
        <h4 class="font-mono text-sm font-semibold text-slate-900">{{ f.name }}</h4>
        <span class="text-xs text-slate-500">{{ typeWords[f.expected] }}</span>
        <span class="rounded-full px-2 py-0.5 text-xs font-medium ring-1" :class="states[f.state].tone">{{ states[f.state].label }}</span>
        <span v-if="f.index >= 0" class="ml-auto flex items-center gap-3">
          <button v-if="draft[f.index]!.piece.kind !== 'advanced'" type="button" class="link text-xs text-slate-500" :aria-label="`Edit ${f.name} as an expression`" @click="setPiece(f.index, { kind: 'advanced', expression: fromPiece(draft[f.index]!.piece) })">Advanced</button>
          <button type="button" class="link text-xs text-slate-500" :aria-label="`Clear ${f.name}`" @click="emit('update:draft', removeAt(draft, f.index))">Clear</button>
        </span>
      </div>

      <template v-if="f.index < 0">
        <p class="mt-2 text-sm text-slate-600">Nothing makes this field yet. Where should its value come from?</p>
        <ValuePicker v-if="choosing === f.name" class="mt-3" :fields="input.fields" :example="example" :input-label="definitionLabel(input)" :need="f.expected" :heading="`Choose a value for ${f.name}`" @pick="choose(f.name, $event)" @cancel="choosing = null" />
        <button v-else type="button" class="btn-primary mt-3 w-auto px-4 py-1.5 text-sm" @click="choosing = f.name">Choose a value</button>
      </template>

      <template v-else>
        <PieceEditor
          class="mt-3"
          top
          :piece="draft[f.index]!.piece"
          :path="[f.name]"
          :issues="review.issues[f.index]!"
          :input="input"
          :example="example"
          :label="f.name"
          :need="f.expected"
          @update:piece="setPiece(f.index, $event)"
        />
        <template v-if="single(draft[f.index]!.piece)">
          <ValuePicker v-if="adding === f.name" class="mt-3" :fields="input.fields" :example="example" :input-label="definitionLabel(input)" need="string" heading="Add another part" @pick="addPart(f.index, $event)" @cancel="adding = null" />
          <button v-else type="button" class="link mt-2 text-sm" @click="adding = f.name">Add another part</button>
        </template>
      </template>

      <ul v-if="f.problems.length" class="mt-2 flex flex-col gap-0.5 text-sm text-red-700">
        <li v-for="p in f.problems" :key="p">{{ p }}</li>
      </ul>
    </section>

    <section v-if="review.extras.length" aria-labelledby="extras-heading" class="rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
      <h4 id="extras-heading" class="text-sm font-semibold text-slate-900">Also in this Mapping</h4>
      <p class="mt-0.5 text-xs text-slate-600">Kept exactly as they are. {{ definitionLabel(target) }} doesn’t ask for them.</p>
      <ul class="mt-3 flex flex-col gap-3">
        <li v-for="x in review.extras" :key="x.index" class="flex items-start gap-3">
          <div class="min-w-0 flex-1">
            <p class="text-sm text-slate-800"><span class="font-mono font-semibold">{{ draft[x.index]!.name || 'Unnamed' }}</span> ← {{ describeSource(fromPiece(draft[x.index]!.piece)) }}</p>
            <p class="text-xs text-amber-800">{{ x.reason }}</p>
          </div>
          <button type="button" class="link shrink-0 text-sm" :aria-label="`Remove ${draft[x.index]!.name || 'the unnamed value'}`" @click="emit('update:draft', removeAt(draft, x.index))">Remove</button>
        </li>
      </ul>
    </section>
  </div>
</template>
