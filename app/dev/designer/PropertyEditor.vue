<script setup lang="ts">
// How one output property's value is made, with room to compose it: the parts editor for text,
// field-or-fixed-value for numbers and true/false, the advanced editor for anything else. Used by
// the focused editor. Mapping only: the property's name and type belong to Structure.
import type { DefinitionVersion } from '#shared/features/definitions'
import { definitionLabel } from '../features/experiment'
import PieceEditor from './PieceEditor.vue'
import ScalarEditor from './ScalarEditor.vue'
import ValuePicker from './ValuePicker.vue'
import type { TransformDraft } from './config'
import { type Piece, combineWith, fromPiece, removeAt, replaceAt } from './parts'
import type { DraftReview, Example, FieldReview } from './preview'

const props = defineProps<{ draft: TransformDraft; field: FieldReview; review: DraftReview; input: DefinitionVersion; example: Example }>()
const emit = defineEmits<{ 'update:draft': [TransformDraft] }>()

const properties = computed(() => props.draft.properties)
const piece = computed(() => (props.field.index >= 0 ? properties.value[props.field.index]!.piece : null))
const setProperties = (next: TransformDraft['properties']) => emit('update:draft', { ...props.draft, properties: next })
const choosing = ref(false)
const adding = ref(false)
watch(() => props.field.name, () => { choosing.value = false; adding.value = false })
function map(next: Piece) {
  choosing.value = false
  const i = props.field.index
  setProperties(i < 0 ? [...properties.value, { name: props.field.name, piece: next }] : replaceAt(properties.value, i, { ...properties.value[i]!, piece: next }))
}
function addPart(next: Piece) {
  adding.value = false
  map(combineWith(piece.value!, next))
}
const single = computed(() => piece.value?.kind === 'field' || piece.value?.kind === 'text')
</script>

<template>
  <div>
    <div class="mb-3 flex items-center gap-3">
      <p class="mr-auto text-xs font-medium text-slate-500">Where its value comes from</p>
      <template v-if="piece">
        <button v-if="piece.kind !== 'advanced'" type="button" class="link text-xs text-slate-500" :aria-label="`Edit ${field.name} as an expression`" @click="map({ kind: 'advanced', expression: fromPiece(piece) })">Advanced</button>
        <button type="button" class="link text-xs text-slate-500" :aria-label="`Clear ${field.name}’s value`" @click="setProperties(removeAt(properties, field.index))">Clear</button>
      </template>
    </div>

    <!-- A local object or a reference: no nested Mapping editor yet, so nothing to edit (its problem says why, below). -->
    <template v-if="field.expected === 'object' || field.expected === 'reference'" />
    <ScalarEditor
      v-else-if="field.expected !== 'string'"
      :piece="piece"
      :type="field.expected"
      :path="[field.name]"
      :issues="field.index >= 0 ? review.issues[field.index]! : []"
      :input="input"
      :example="example"
      :label="field.name"
      @update:piece="map"
    />
    <template v-else-if="!piece">
      <ValuePicker v-if="choosing" :fields="input.fields" :example="example" :input-label="definitionLabel(input)" need="string" :heading="`Choose a value for ${field.name}`" @pick="map" @cancel="choosing = false" />
      <button v-else type="button" class="btn-primary w-auto rounded-full px-4 py-1.5 text-sm" @click="choosing = true">Choose a value</button>
    </template>
    <template v-else>
      <PieceEditor top :piece="piece" :path="[field.name]" :issues="review.issues[field.index]!" :input="input" :example="example" :label="field.name" need="string" @update:piece="map" />
      <template v-if="single">
        <ValuePicker v-if="adding" class="mt-3" :fields="input.fields" :example="example" :input-label="definitionLabel(input)" need="string" heading="Add another part" @pick="addPart" @cancel="adding = false" />
        <button v-else type="button" class="link mt-2 text-sm" @click="adding = true">Add another part</button>
      </template>
    </template>
    <ul v-if="field.problems.length" class="mt-2 flex flex-col gap-0.5 text-sm text-red-700">
      <li v-for="p in field.problems" :key="p">{{ p }}</li>
    </ul>
  </div>
</template>
