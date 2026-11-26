<script setup lang="ts">
// Choosing a value, value first: a field of the input (with its example value), a space, some
// text, or a group of parts. An inline list of buttons rather than a floating menu, so it works
// the same with a mouse, a keyboard, a screen reader and a thumb.
//
// When the Transform version reads nested sources (Transform v3), the values inside the input's
// local objects and referenced Definitions are offered too, each by its path as breadcrumbs
// (contact › email), with what may make it absent: an optional property on the way, the value
// itself or any parent. All from the resolved contract (reading.ts), never from example data.
import { type DefinitionVersion, type Field, type FieldType, type PropertyPath, type PropertyType, type Scalar, isScalarField, propertyPathWords } from '#shared/features/definitions'
import ShownText from './ShownText.vue'
import type { Piece } from './parts'
import type { Example } from './preview'
import { FLAT, READING, exampleAt, readables } from './reading'

const props = defineProps<{ fields: readonly Field[]; example: Example; inputLabel: string; need?: FieldType; heading?: string; input?: DefinitionVersion }>()
const emit = defineEmits<{ pick: [Piece]; cancel: [] }>()
const reading = inject(READING, ref(FLAT))

const root = ref<HTMLElement>()
onMounted(() => root.value?.querySelector<HTMLButtonElement>('button:not([disabled])')?.focus())

const typeWords: Record<PropertyType, string> = { string: 'text', number: 'number', boolean: 'yes or no', object: 'object', reference: 'Definition' }
/** An input value to show beside its property: only a value, never a whole local object (sources can't read one). */
const exampleOf = (path: PropertyPath): Scalar | undefined => ('data' in props.example ? exampleAt(props.example.data, path) : undefined)
const unusable = (f: Field) => !isScalarField(f) || (!!props.need && f.type !== props.need)
// Nested reading: every value at any depth, from the resolved contract.
const nested = computed(() => (reading.value.nested && props.input ? readables(reading.value, props.input) : null))
const pickPath = (path: PropertyPath): Piece => (path.length === 1 ? { kind: 'field', name: path[0]!, trim: false } : { kind: 'nested', path, trim: false })
const absentWords = (optional: readonly PropertyPath[]) => `${optional.map(propertyPathWords).join(', ')} ${optional.length === 1 ? 'is' : 'are'} optional`
const option = 'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm ring-1 ring-slate-200 transition hover:bg-accent-50 hover:ring-accent-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent'
</script>

<template>
  <div ref="root" class="rounded-xl bg-white p-3 ring-1 ring-accent-200 shadow-sm" role="group" :aria-label="heading ?? 'Choose a value'" @keydown.escape.stop="emit('cancel')">
    <p class="text-xs font-medium text-slate-500">From the input · {{ inputLabel }}</p>
    <ul v-if="nested" class="mt-1.5 flex flex-col gap-1.5" data-nested-values>
      <li v-for="r in nested" :key="JSON.stringify(r.path)">
        <button
          type="button"
          :class="option"
          :disabled="!!need && r.type !== need"
          :data-value-path="JSON.stringify(r.path)"
          :aria-label="`${propertyPathWords(r.path)}, ${typeWords[r.type]}${r.optional.length ? `, may be absent: ${absentWords(r.optional)}` : ''}`"
          @click="emit('pick', pickPath(r.path))"
        >
          <span class="min-w-0">
            <span class="flex flex-wrap items-baseline gap-x-1 font-mono font-medium text-slate-900">
              <template v-for="(name, i) in r.path" :key="i"><span v-if="i" aria-hidden="true" class="text-slate-400">›</span><span>{{ name }}</span></template>
            </span>
            <span class="block text-xs text-slate-500">
              {{ typeWords[r.type] }}<template v-if="need && r.type !== need">, can’t be used here</template>
              <span v-if="r.optional.length" class="text-amber-700"> · may be absent: {{ absentWords(r.optional) }}</span>
            </span>
          </span>
          <ShownText v-if="exampleOf(r.path) !== undefined" class="ml-auto" :value="exampleOf(r.path)!" />
        </button>
      </li>
    </ul>
    <ul v-else class="mt-1.5 flex flex-col gap-1.5">
      <li v-for="f in fields" :key="f.name">
        <button type="button" :class="option" :disabled="unusable(f)" @click="emit('pick', { kind: 'field', name: f.name, trim: false })">
          <span class="font-mono font-medium text-slate-900">{{ f.name }}</span>
          <span class="text-xs text-slate-500">{{ typeWords[f.type] }}<template v-if="unusable(f)">, can’t be used here</template></span>
          <ShownText v-if="exampleOf([f.name]) !== undefined" class="ml-auto" :value="exampleOf([f.name])!" />
        </button>
      </li>
    </ul>
    <p class="mt-3 text-xs font-medium text-slate-500">Or</p>
    <div class="mt-1.5 grid grid-cols-3 gap-1.5">
      <button type="button" :class="[option, 'justify-center']" @click="emit('pick', { kind: 'text', value: ' ', trim: false })">A space</button>
      <button type="button" :class="[option, 'justify-center']" @click="emit('pick', { kind: 'text', value: '', trim: false })">Text…</button>
      <button type="button" :class="[option, 'justify-center']" @click="emit('pick', { kind: 'combine', parts: [], separator: '', trim: false })">A group</button>
    </div>
    <p v-if="need === 'string'" class="mt-2 text-xs text-slate-500">Whole fields only: Orbit can’t take part of a field (such as its first letter) yet.</p>
    <button type="button" class="link mt-2 text-sm" @click="emit('cancel')">Cancel</button>
  </div>
</template>
