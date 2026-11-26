<script setup lang="ts">
// One value in the parts editor: a field, some text, a group of parts in order, or (for trees the
// parts view can't show exactly) the recursive SourceEditor. Every change emits a new Piece; the
// page turns Pieces back into the exact expression tree (parts.ts). Example values come from the
// preview (preview.ts), which never runs anything.
import type { DefinitionVersion, FieldType } from '#shared/features/definitions'
import { type Path, formatSource } from '#shared/features/mappings'
import { definitionLabel } from '../features/experiment'
import SourceEditor from '../features/SourceEditor.vue'
import ShownText from './ShownText.vue'
import ValuePicker from './ValuePicker.vue'
import { type Piece, fromPiece, insertAt, move, ownIssues, partPaths, removeAt, replaceAt, replaceValue, representable, toPiece } from './parts'
import { type Example, friendlyIssue, previewSource, visibleSegments, whitespaceNote } from './preview'
import { FLAT, READING, type ReviewIssue } from './reading'
import { describeSource } from './summary'

const props = defineProps<{
  piece: Piece
  /** Where this value is, as checkMapping reports paths, so its problems can be shown here. */
  path: Path
  /** All of the property's problems; this value shows only its own. */
  issues: readonly ReviewIssue[]
  input: DefinitionVersion
  example: Example
  /** For screen readers: "fullName, part 2". */
  label: string
  /** The property's value itself, rather than a part of a group. */
  top?: boolean
  need?: FieldType
}>()
const emit = defineEmits<{ 'update:piece': [Piece] }>()
const update = (piece: Piece) => emit('update:piece', piece)

const root = ref<HTMLElement>()
const focus = (selector: string) => nextTick(() => root.value?.querySelector<HTMLElement>(selector)?.focus())

// What this value makes from the example, and, when spaces are removed, what it was before.
// Read as the Transform version the step invokes reads (flat, or nested too).
const reading = inject(READING, ref(FLAT))
const result = computed(() => previewSource(fromPiece(props.piece), props.input, props.example, reading.value))
const before = computed(() => ('trim' in props.piece && props.piece.trim ? previewSource(fromPiece({ ...props.piece, trim: false }), props.input, props.example, reading.value) : null))
const own = computed(() => ownIssues(props.piece, props.path, props.issues).map(friendlyIssue))
const inputLabel = computed(() => definitionLabel(props.input))

// Changing which value this is (keeps "Remove spaces").
const changing = ref(false)
function change(next: Piece) {
  changing.value = false
  update(replaceValue(props.piece, next))
  focus(':scope > div > [data-main]')
}
const setTrim = (trim: boolean) => 'trim' in props.piece && update({ ...props.piece, trim })

// Text: whitespace is invisible in a text box, so a space is shown as a token until edited.
const editingText = ref(false)
const showToken = computed(() => props.piece.kind === 'text' && props.piece.value !== '' && !props.piece.value.trim() && !editingText.value)
function editText() {
  editingText.value = true
  focus(':scope > div > input[data-main]')
}

// A group's parts.
const parts = computed(() => (props.piece.kind === 'combine' ? props.piece.parts : []))
const paths = computed(() => partPaths(props.piece, props.path))
const picking = ref<number | null>(null)
const showSeparator = ref(false)
const setParts = (next: Piece[]) => props.piece.kind === 'combine' && update({ ...props.piece, parts: next })
function insert(i: number, part: Piece) {
  picking.value = null
  setParts(insertAt(parts.value, i, part))
  focus(`:scope > ol > [data-part="${i}"] [data-main]`)
}
function shift(i: number, delta: -1 | 1) {
  setParts(move(parts.value, i, delta))
  const j = i + delta
  const edge = j === 0 || j === parts.value.length - 1
  focus(`:scope > ol > [data-part="${j}"] [data-action="${edge ? (delta < 0 ? 'down' : 'up') : delta < 0 ? 'up' : 'down'}"]`)
}
function remove(i: number) {
  setParts(removeAt(parts.value, i))
  focus(parts.value.length > 1 ? `:scope > ol > [data-part="${Math.min(i, parts.value.length - 2)}"] [data-action="remove"]` : ':scope > div > [data-action="add"]')
}
const setSeparator = (separator: string) => props.piece.kind === 'combine' && update({ ...props.piece, separator })
const stacked = (part: Piece) => part.kind === 'combine' || part.kind === 'advanced'

const icon = 'flex size-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 disabled:opacity-30 disabled:hover:bg-transparent'
const control = 'rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-900 shadow-xs outline-none transition focus:border-accent-500 focus:ring-2 focus:ring-accent-100'
</script>

<template>
  <div ref="root" class="min-w-0">
    <!-- A value inside the input, by its path (Transform v3): breadcrumbs, exact names -->
    <template v-if="piece.kind === 'nested'">
      <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
        <button
          type="button"
          data-main
          data-nested-source
          class="inline-flex items-center gap-1 rounded-lg px-1.5 py-0.5 font-mono text-sm font-semibold text-slate-900 ring-1 ring-transparent transition hover:bg-slate-100 hover:ring-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
          :aria-label="`${label}: ${piece.path.join(' › ')} from the input. Change`"
          :aria-expanded="changing"
          @click="changing = !changing"
        >
          <template v-for="(name, i) in piece.path" :key="i"><span v-if="i" aria-hidden="true" class="font-normal text-slate-400">›</span>{{ name }}</template><span aria-hidden="true" class="text-xs text-slate-400">▾</span>
        </button>
        <span class="text-xs text-slate-500">from the input</span>
      </div>
    </template>

    <!-- A field of the input -->
    <template v-else-if="piece.kind === 'field'">
      <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
        <button
          type="button"
          data-main
          class="inline-flex items-center gap-1 rounded-lg px-1.5 py-0.5 font-mono text-sm font-semibold text-slate-900 ring-1 ring-transparent transition hover:bg-slate-100 hover:ring-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
          :aria-label="`${label}: the field ${piece.name || '(no name)'} from the input. Change`"
          :aria-expanded="changing"
          @click="changing = !changing"
        >
          {{ piece.name || '?' }}<span aria-hidden="true" class="text-xs text-slate-400">▾</span>
        </button>
        <span class="text-xs text-slate-500">from the input</span>
      </div>
    </template>

    <!-- Literal text -->
    <template v-else-if="piece.kind === 'text'">
      <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
        <button
          v-if="showToken"
          type="button"
          data-main
          class="inline-flex items-center gap-1.5 rounded-lg bg-accent-50 px-2 py-0.5 text-sm font-medium text-accent-800 ring-1 ring-accent-200 transition hover:bg-accent-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
          :aria-label="`${label}: ${whitespaceNote(piece.value)}. Edit the text`"
          @click="editText"
        >
          <span aria-hidden="true" class="font-mono text-accent-500">{{ '·'.repeat(Math.min(piece.value.length, 5)) }}</span>{{ whitespaceNote(piece.value) }}
        </button>
        <input
          v-else
          data-main
          :value="piece.value"
          type="text"
          autocomplete="off"
          spellcheck="false"
          placeholder="Type some text"
          :aria-label="`${label}: text`"
          :class="[control, 'w-40 min-w-0 font-mono']"
          @input="update({ ...piece, value: ($event.target as HTMLInputElement).value })"
          @blur="editingText = false"
        >
        <ShownText v-if="!showToken && visibleSegments(piece.value).some((s) => s.mark)" :value="piece.value" />
        <button type="button" class="link text-xs" :aria-expanded="changing" @click="changing = !changing">Change</button>
      </div>
      <p v-if="piece.value === ''" class="mt-1 text-xs text-amber-700">Empty, so it adds nothing yet.</p>
      <p v-else-if="top" class="mt-1 text-xs text-slate-500">Fixed text: the same for every input.</p>
    </template>

    <!-- A fixed number, or yes or no (inside a group of text, the problem below says why it can't be) -->
    <template v-else-if="piece.kind === 'literal'">
      <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span class="text-xs text-slate-500">Fixed value</span>
        <span v-if="typeof piece.value === 'boolean'" class="text-sm text-slate-800">{{ piece.value ? 'Yes' : 'No' }}</span>
        <ShownText v-else :value="piece.value" />
        <button type="button" data-main class="link text-xs" :aria-expanded="changing" :aria-label="`${label}: the fixed value ${typeof piece.value === 'boolean' ? (piece.value ? 'yes' : 'no') : piece.value}. Change`" @click="changing = !changing">Change</button>
      </div>
    </template>

    <!-- Values in order (and a group inside a group) -->
    <template v-else-if="piece.kind === 'combine'">
      <p class="text-xs font-medium text-slate-500">{{ top ? 'Combine, in order' : 'A group, in order' }}</p>
      <ol class="mt-2 flex flex-col gap-3" :aria-label="`${label}: parts, in order`">
        <template v-for="(part, i) in parts" :key="i">
          <li v-if="picking === i">
            <ValuePicker :fields="input.fields" :input="input" :example="example" :input-label="inputLabel" need="string" :heading="`Insert a part before part ${i + 1}`" @pick="insert(i, $event)" @cancel="picking = null; focus(`:scope > ol > [data-part='${i}'] [data-action='insert']`)" />
          </li>
          <li :data-part="i" class="relative rounded-xl border border-slate-200 bg-white p-2.5">
            <button
              v-if="i > 0 && picking === null"
              type="button"
              data-action="insert"
              class="absolute -top-3.5 left-1/2 z-10 flex h-6 -translate-x-1/2 items-center rounded-full bg-white px-2 text-xs font-medium text-slate-500 ring-1 ring-slate-200 transition hover:bg-accent-50 hover:text-accent-700 hover:ring-accent-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
              :aria-label="`Insert a part between part ${i} and part ${i + 1}`"
              @click="picking = i"
            >
              + Insert
            </button>
            <div :class="stacked(part) ? 'flex flex-col gap-2' : 'flex items-start gap-2'">
              <div class="flex shrink-0 items-center gap-2" :class="stacked(part) ? 'w-full' : 'mt-0.5'">
                <span class="flex size-6 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600" aria-hidden="true">{{ i + 1 }}</span>
                <template v-if="stacked(part)">
                  <span class="mr-auto text-xs text-slate-500">{{ part.kind === 'combine' ? 'Group' : 'Advanced' }}</span>
                  <button type="button" data-action="up" :class="icon" :disabled="i === 0" :aria-label="`Move part ${i + 1} up`" title="Move up" @click="shift(i, -1)">↑</button>
                  <button type="button" data-action="down" :class="icon" :disabled="i === parts.length - 1" :aria-label="`Move part ${i + 1} down`" title="Move down" @click="shift(i, 1)">↓</button>
                  <button type="button" data-action="remove" :class="icon" :aria-label="`Remove part ${i + 1}`" title="Remove" @click="remove(i)">✕</button>
                </template>
              </div>
              <PieceEditor
                class="min-w-0 flex-1"
                :piece="part"
                :path="paths[i]!"
                :issues="issues"
                :input="input"
                :example="example"
                :label="`${label}, part ${i + 1}`"
                need="string"
                @update:piece="setParts(replaceAt(parts, i, $event))"
              />
              <div v-if="!stacked(part)" class="flex shrink-0 items-center">
                <button type="button" data-action="up" :class="icon" :disabled="i === 0" :aria-label="`Move part ${i + 1} up`" title="Move up" @click="shift(i, -1)">↑</button>
                <button type="button" data-action="down" :class="icon" :disabled="i === parts.length - 1" :aria-label="`Move part ${i + 1} down`" title="Move down" @click="shift(i, 1)">↓</button>
                <button type="button" data-action="remove" :class="icon" :aria-label="`Remove part ${i + 1}`" title="Remove" @click="remove(i)">✕</button>
              </div>
            </div>
          </li>
        </template>
        <li v-if="picking === parts.length">
          <ValuePicker :fields="input.fields" :input="input" :example="example" :input-label="inputLabel" need="string" heading="Add a part at the end" @pick="insert(parts.length, $event)" @cancel="picking = null; focus(':scope > div > [data-action=add]')" />
        </li>
      </ol>
      <p v-if="!parts.length && picking === null" class="mt-1 text-xs text-amber-700">No parts yet, so it makes empty text.</p>

      <div v-if="piece.separator !== '' || showSeparator" class="mt-3 flex flex-wrap items-center gap-2 text-xs font-medium text-slate-600">
        <label class="flex items-center gap-2">
          Between every two parts
          <input
            :value="piece.separator"
            type="text"
            autocomplete="off"
            spellcheck="false"
            placeholder="Nothing"
            :class="[control, 'w-24 font-mono']"
            @input="setSeparator(($event.target as HTMLInputElement).value)"
          >
        </label>
        <span v-if="piece.separator && !piece.separator.trim()" class="font-normal text-slate-500">{{ whitespaceNote(piece.separator) }}</span>
        <button type="button" class="link" @click="setSeparator(''); showSeparator = false">Remove</button>
      </div>

      <div class="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
        <button v-if="picking === null" type="button" data-action="add" class="link text-sm" @click="picking = parts.length">Add a part</button>
        <button v-if="piece.separator === '' && !showSeparator" type="button" class="link text-xs text-slate-500" @click="showSeparator = true">Put something between every two parts</button>
      </div>
    </template>

    <!-- Anything else: the expression itself, in the recursive editor (a built object has its own editor) -->
    <template v-else-if="piece.kind === 'advanced'">
      <div class="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
        <p class="text-xs text-slate-600">
          <span class="font-semibold">Advanced.</span>
          {{ representable(piece.expression) ? 'Edited as an expression.' : 'The parts view can’t show this exactly, so it’s edited as an expression. Nothing about it has been changed.' }}
        </p>
        <p class="mt-1 text-sm text-slate-800">{{ describeSource(piece.expression) }}</p>
        <SourceEditor class="mt-3" :model-value="piece.expression" :fields="input.fields" :label="label" @update:model-value="update({ kind: 'advanced', expression: $event })" />
        <p class="mt-2 overflow-x-auto font-mono text-xs whitespace-nowrap text-slate-500">{{ formatSource(piece.expression) }}</p>
        <button v-if="representable(piece.expression)" type="button" class="link mt-2 text-sm" @click="update(toPiece(piece.expression))">Show as parts</button>
      </div>
    </template>

    <!-- What it makes from the example -->
    <div v-if="'value' in result && piece.kind !== 'text' && piece.kind !== 'literal'" class="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
      <span>{{ piece.kind === 'combine' ? (top ? 'Makes' : 'This group makes') : 'Example' }}</span>
      <template v-if="before && 'value' in before && before.value !== result.value">
        <ShownText :value="before.value" struck />
        <span aria-hidden="true">→</span>
        <span class="sr-only">becomes</span>
      </template>
      <ShownText :value="result.value" />
    </div>

    <label v-if="'trim' in piece && (piece.kind !== 'text' || piece.trim)" class="mt-1.5 flex w-fit items-center gap-2 text-sm text-slate-700">
      <input type="checkbox" class="size-4 rounded border-slate-300 accent-accent-600" :checked="piece.trim" @change="setTrim(($event.target as HTMLInputElement).checked)">
      Remove spaces from both ends{{ piece.kind === 'combine' ? (top ? ' of the result' : ' of this group') : '' }}
    </label>

    <ul v-if="own.length" class="mt-1.5 flex flex-col gap-0.5 text-sm text-red-700">
      <li v-for="p in own" :key="p">{{ p }}</li>
    </ul>

    <ValuePicker
      v-if="changing"
      class="mt-2"
      :fields="input.fields"
      :input="input"
      :example="example"
      :input-label="inputLabel"
      :need="need"
      :heading="`Change ${label}`"
      @pick="change"
      @cancel="changing = false; focus(':scope > div > [data-main]')"
    />
  </div>
</template>
