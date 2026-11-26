<script setup lang="ts">
// How one output property's value is made, with room to compose it: the parts editor for text,
// field-or-fixed-value for numbers and true/false (ValueSlot), the advanced editor for anything
// else, and for a local object or a referenced Definition, building it property by property
// (ConstructionEditor, Transform v3). Used by the focused editor. Mapping only: the property's name
// and type belong to Structure.
import type { DefinitionVersion } from '#shared/features/definitions'
import ConstructionEditor from './ConstructionEditor.vue'
import ValueSlot from './ValueSlot.vue'
import type { TransformDraft } from './config'
import { type Piece, fromPiece, removeAt, replaceAt } from './parts'
import type { DraftReview, Example, FieldReview } from './preview'

const props = defineProps<{ draft: TransformDraft; field: FieldReview; review: DraftReview; input: DefinitionVersion; example: Example; output: DefinitionVersion }>()
const emit = defineEmits<{ 'update:draft': [TransformDraft] }>()

const properties = computed(() => props.draft.properties)
const piece = computed(() => (props.field.index >= 0 ? properties.value[props.field.index]!.piece : null))
const setProperties = (next: TransformDraft['properties']) => emit('update:draft', { ...props.draft, properties: next })
function map(next: Piece) {
  const i = props.field.index
  setProperties(i < 0 ? [...properties.value, { name: props.field.name, piece: next }] : replaceAt(properties.value, i, { ...properties.value[i]!, piece: next }))
}
const clear = () => props.field.index >= 0 && setProperties(removeAt(properties.value, props.field.index))
/** The property as the output's contract has it. */
const target = computed(() => props.output.fields.find((f) => f.name === props.field.name) ?? null)
const issues = computed(() => (props.field.index >= 0 ? props.review.issues[props.field.index]! : []))
const isObject = computed(() => props.field.expected === 'object' || props.field.expected === 'reference')
</script>

<template>
  <div>
    <div class="mb-3 flex items-center gap-3">
      <p class="mr-auto text-xs font-medium text-slate-500">{{ isObject ? 'How it’s built' : 'Where its value comes from' }}</p>
      <template v-if="piece">
        <button v-if="piece.kind !== 'advanced' && piece.kind !== 'construct'" type="button" class="link text-xs text-slate-500" :aria-label="`Edit ${field.name} as an expression`" @click="map({ kind: 'advanced', expression: fromPiece(piece) })">Advanced</button>
        <button type="button" class="link text-xs text-slate-500" :aria-label="`Clear ${field.name}’s value`" @click="clear">Clear</button>
      </template>
    </div>

    <!-- A local object or a reference: built property by property, with its presence. -->
    <ConstructionEditor
      v-if="isObject && target"
      :piece="piece?.kind === 'construct' ? piece : null"
      :target="target"
      :path="[field.name]"
      :issues="issues"
      :input="input"
      :example="example"
      @set="$event ? map($event) : clear()"
    />
    <ValueSlot v-else-if="field.expected !== 'object' && field.expected !== 'reference'" :piece="piece" :type="field.expected" :path="[field.name]" :issues="issues" :input="input" :example="example" :label="field.name" @set="map" />
    <ul v-if="field.problems.length" class="mt-2 flex flex-col gap-0.5 text-sm text-red-700">
      <li v-for="p in field.problems" :key="p">{{ p }}</li>
    </ul>
  </div>
</template>
