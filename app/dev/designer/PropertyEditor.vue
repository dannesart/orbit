<script setup lang="ts">
// How the selected output place is made, with room to compose it: the parts editor for text,
// field-or-fixed-value for numbers and true/false (ValueSlot), the advanced editor for anything
// else, and for a local object or a referenced Definition, how it's made and its own properties as
// rows (ConstructionEditor, Transform v3). Used by Mapping Studio's inspector. Mapping only: the
// property's name and type belong to General.
//
// The place is exactly the selected one, at any depth (`path`), and is always edited as part of its
// top-level property: a nested place's editor is given its piece, its field and the guarantees of
// the objects built around it (scopeAt), and what it sets goes back through them (setAt). Moving
// between places changes nothing.
import type { DefinitionVersion, PropertyPath } from '#shared/features/definitions'
import ConstructionEditor from './ConstructionEditor.vue'
import ValueSlot from './ValueSlot.vue'
import type { TransformDraft } from './config'
import { type Piece, fromPiece, removeAt, replaceAt } from './parts'
import { type DraftReview, type Example, type FieldReview, friendlyIssue } from './preview'
import { FLAT, GUARANTEED, READING } from './reading'
import { scopeAt, setAt } from './scope'
import type { OutputNode } from './studio'

const props = defineProps<{
  draft: TransformDraft
  /** The top-level property the place is in, as the review has it. */
  field: FieldReview
  review: DraftReview
  input: DefinitionVersion
  example: Example
  output: DefinitionVersion
  /** The selected place, outermost first ([field.name] is the top-level property itself). */
  path: PropertyPath
  /** The selected place as the output tree has it (its own properties' rows). */
  node: OutputNode | null
}>()
const emit = defineEmits<{ 'update:draft': [TransformDraft]; select: [path: PropertyPath] }>()

const reading = inject(READING, ref(FLAT))
const properties = computed(() => props.draft.properties)
const top = computed(() => (props.field.index >= 0 ? properties.value[props.field.index]!.piece : null))
const setProperties = (next: TransformDraft['properties']) => emit('update:draft', { ...props.draft, properties: next })
/** The top-level property made by `next` (null: nothing makes it). */
function setTop(next: Piece | null) {
  const i = props.field.index
  if (next === null) return i >= 0 && setProperties(removeAt(properties.value, i))
  setProperties(i < 0 ? [...properties.value, { name: props.field.name, piece: next }] : replaceAt(properties.value, i, { ...properties.value[i]!, piece: next }))
}
/** The property as the output's contract has it. */
const target = computed(() => props.output.fields.find((f) => f.name === props.field.name) ?? null)
const below = computed(() => props.path.slice(1))
/** The selected place inside its top-level property: its piece, its field and what's known to be present around it. */
const scope = computed(() => (target.value ? scopeAt(top.value, target.value, below.value, reading.value.resolve) : null))
const place = computed(() => (scope.value?.ok ? scope.value : null))
const blocked = computed(() => (scope.value && !scope.value.ok ? scope.value : null))
const piece = computed(() => place.value?.piece ?? null)
/** The selected place made by `next`, through the objects built around it. */
const set = (next: Piece | null) => setTop(setAt(top.value, below.value, next))
// Inside objects built when a source object is present, those sources are known to be there.
provide(GUARANTEED, computed(() => place.value?.guaranteed ?? []))

const issues = computed(() => (props.field.index >= 0 ? props.review.issues[props.field.index]! : []))
const isObject = computed(() => place.value?.field.type === 'object' || place.value?.field.type === 'reference')
const scalarType = computed(() => (place.value && !isObject.value ? (place.value.field.type as 'string' | 'number' | 'boolean') : 'string'))
const nested = computed(() => props.path.length > 1)
const name = computed(() => props.path.join(' › '))
const samePath = (a: readonly unknown[], b: readonly unknown[]) => a.length === b.length && a.every((x, i) => x === b[i])
/** A nested value nothing makes yet: what the check says about exactly this place. */
const waiting = computed(() => (nested.value && !isObject.value && !piece.value ? issues.value.filter((i) => samePath(i.path, props.path)).map(friendlyIssue) : []))
</script>

<template>
  <div class="min-w-0" :data-property-editor="name">
    <!-- Inside an object that isn't built: nothing here is made on its own; how the enclosing object is made comes first -->
    <div v-if="blocked" class="text-sm text-slate-600" data-scope-blocked>
      <p v-if="blocked.why === 'copied'">{{ blocked.at.join(' › ') }} is copied whole, so what’s inside it comes with the copy.</p>
      <p v-else-if="blocked.why === 'not_built'">{{ blocked.at.join(' › ') }} isn’t built, so nothing inside it is made.</p>
      <p v-else>This isn’t part of {{ blocked.at.join(' › ') }}.</p>
      <button type="button" class="link mt-2 text-sm" @click="emit('select', blocked.at)">Go to {{ blocked.at[blocked.at.length - 1] }}</button>
    </div>
    <template v-else-if="place">
      <div class="mb-3 flex items-center gap-3">
        <p class="mr-auto text-xs font-medium text-slate-500">{{ isObject ? 'How it’s made' : 'Where its value comes from' }}</p>
        <template v-if="piece">
          <button v-if="!nested && piece.kind !== 'advanced' && piece.kind !== 'construct' && piece.kind !== 'copy'" type="button" class="link text-xs text-slate-500" :aria-label="`Edit ${field.name} as an expression`" @click="set({ kind: 'advanced', expression: fromPiece(piece) })">Advanced</button>
          <button v-if="!isObject || !nested" type="button" class="link text-xs text-slate-500" :aria-label="`Clear ${name}’s value`" @click="set(null)">Clear</button>
        </template>
      </div>

      <!-- A local object or a reference: how it's made, then its own properties as rows. -->
      <ConstructionEditor
        v-if="isObject"
        :piece="piece?.kind === 'construct' || piece?.kind === 'copy' ? piece : null"
        :target="place.field"
        :path="path"
        :issues="issues"
        :input="input"
        :example="example"
        :rows="node?.children"
        @set="set"
        @select="emit('select', $event)"
      />
      <ValueSlot v-else :piece="piece" :type="scalarType" :path="path" :issues="issues" :input="input" :example="example" :label="name" @set="set" />
      <ul v-if="!nested && field.problems.length" class="mt-2 flex flex-col gap-0.5 text-sm text-red-700">
        <li v-for="p in field.problems" :key="p">{{ p }}</li>
      </ul>
      <ul v-else-if="waiting.length" class="mt-2 flex flex-col gap-0.5 text-sm" :class="place.field.optional === true ? 'text-slate-500' : 'text-amber-700'" data-place-waiting>
        <li v-for="p in waiting" :key="p">{{ p }}</li>
      </ul>
    </template>
  </div>
</template>
