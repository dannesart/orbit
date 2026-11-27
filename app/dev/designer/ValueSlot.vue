<script setup lang="ts">
// One value's editor: the parts editor for text, field-or-fixed-value for numbers and true/false.
// PropertyEditor's own, used for a top-level property and for each value inside a built object
// alike, so both read the same.
import type { DefinitionVersion, FieldType } from '#shared/features/definitions'
import type { Path } from '#shared/features/mappings'
import { definitionLabel } from '../features/experiment'
import PieceEditor from './PieceEditor.vue'
import ScalarEditor from './ScalarEditor.vue'
import ValuePicker from './ValuePicker.vue'
import { type Piece, combineWith } from './parts'
import type { Example } from './preview'
import type { ReviewIssue } from './reading'

const props = defineProps<{ piece: Piece | null; type: FieldType; path: Path; issues: readonly ReviewIssue[]; input: DefinitionVersion; example: Example; label: string }>()
const emit = defineEmits<{ set: [Piece] }>()

const choosing = ref(false)
const adding = ref(false)
watch(() => props.label, () => { choosing.value = false; adding.value = false })
function set(next: Piece) {
  choosing.value = false
  emit('set', next)
}
function addPart(next: Piece) {
  adding.value = false
  emit('set', combineWith(props.piece!, next))
}
const single = computed(() => props.piece?.kind === 'field' || props.piece?.kind === 'nested' || props.piece?.kind === 'text')
</script>

<template>
  <ScalarEditor v-if="type !== 'string'" :piece="piece" :type="type" :path="path" :issues="issues" :input="input" :example="example" :label="label" @update:piece="set" />
  <div v-else-if="!piece">
    <ValuePicker v-if="choosing" :fields="input.fields" :input="input" :example="example" :input-label="definitionLabel(input)" need="string" :heading="`Choose a value for ${label}`" @pick="set" @cancel="choosing = false" />
    <button v-else type="button" class="btn-primary w-auto rounded-full px-4 py-1.5 text-sm" @click="choosing = true">Choose a value</button>
  </div>
  <div v-else>
    <PieceEditor top :piece="piece" :path="path" :issues="issues" :input="input" :example="example" :label="label" need="string" @update:piece="set" />
    <template v-if="single">
      <ValuePicker v-if="adding" class="mt-3" :fields="input.fields" :input="input" :example="example" :input-label="definitionLabel(input)" need="string" heading="Add another part" @pick="addPart" @cancel="adding = false" />
      <button v-else type="button" class="link mt-2 text-sm" @click="adding = true">Add another part</button>
    </template>
  </div>
</template>
