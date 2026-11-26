<script setup lang="ts">
// The live Preview: an example of the Definition being built, and what Orbit makes of it.
//
//   Example  neutral, illustrative values for every property, at every level (never a Record,
//            never guessed from a name), each given or left out: an optional one may be left out;
//            a required one can be, to see Orbit refuse it. An object or a reference left out hides
//            what's inside it, and keeps it. Reset brings the generated values back. Advanced
//            testing (discreet) sends values exactly as typed, and adds information it doesn't define.
//   Result   the information as Orbit receives it, as a nested structure under the Definition's own
//            icon, colour and name, and Orbit's verdict: its own resolution and validation
//            (example.ts), never a second one. A contract that can't be resolved here is said so,
//            apart from anything wrong with the information.
//
// Optional: nothing here is needed to create anything, and nothing typed here is kept.
import type { Appearance } from './appearance'
import type { StudioCatalogue } from './catalogue'
import { type ExampleContext, type ExampleEntries, type ExampleEntry, exampleTree, locateUnnamed, previewResult } from './example'
import type { DraftField } from './model'
import DefinitionTile from './DefinitionTile.vue'
import DefinitionsIcon from './DefinitionsIcon.vue'
import ExampleInputs from './ExampleInputs.vue'
import ResultTree from './ResultTree.vue'

const props = defineProps<{
  fields: readonly DraftField[]
  entries: ExampleEntries
  extra: { name: string; text: string } | null
  advanced: boolean
  name: string
  appearance: Appearance
  idPrefix: string
  catalogue: StudioCatalogue
  context: ExampleContext
}>()
const emit = defineEmits<{
  'update:entries': [ExampleEntries]
  'update:extra': [{ name: string; text: string } | null]
  'update:advanced': [boolean]
  reset: []
}>()

const nodes = computed(() => exampleTree(props.fields, props.catalogue.resolve))
const unnamed = computed(() => locateUnnamed(props.fields))
const result = computed(() => previewResult(props.fields, props.entries, props.extra, props.context))
const fits = computed(() => !result.value.unavailable.length && !result.value.issues.length)
const anything = computed(() => nodes.value.some((n) => props.entries[n.id]?.given))

function set(id: string, change: Partial<ExampleEntry>, edited = true) {
  const entry = props.entries[id]
  if (!entry) return
  emit('update:entries', { ...props.entries, [id]: { ...entry, ...change, ...(edited ? { edited: true } : {}) } })
}
const control = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-accent-500 focus:ring-2 focus:ring-accent-100'
const iconButton = 'grid size-8 place-items-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500'
</script>

<template>
  <div class="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
    <!-- Example -->
    <section aria-labelledby="example-heading" class="min-w-0">
      <div class="flex items-center gap-2">
        <h2 id="example-heading" class="text-xs font-medium text-slate-500">Example</h2>
        <span class="text-xs text-slate-400">Illustrative, not a Record</span>
        <button type="button" :class="[iconButton, 'ml-auto']" aria-label="Reset the example" title="Reset the example" data-reset-example @click="emit('reset')">
          <DefinitionsIcon name="reset" class="size-4" />
        </button>
        <button
          type="button"
          class="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
          :class="advanced ? 'bg-accent-50 text-accent-700' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'"
          :aria-pressed="advanced"
          data-advanced
          @click="emit('update:advanced', !advanced)"
        >
          <DefinitionsIcon name="flask" class="size-3.5" />
          Advanced testing
        </button>
      </div>

      <p v-if="!nodes.length" class="mt-3 rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">
        Name a property in Model to try it here.
      </p>
      <ExampleInputs v-else class="mt-2" :nodes="nodes" :entries="entries" :advanced="advanced" :id-prefix="idPrefix" :catalogue="catalogue" :set="set" />
      <p v-if="unnamed" class="mt-2 text-xs text-slate-500">{{ unnamed === 1 ? 'One property has' : `${unnamed} properties have` }} no name yet, so it can’t be tried.</p>

      <div v-if="advanced" class="mt-3 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200/70" data-advanced-panel>
        <p class="text-xs font-medium text-slate-600">Information it doesn’t define</p>
        <div class="mt-2 flex gap-2">
          <input
            :value="extra?.name ?? ''"
            type="text"
            placeholder="Property name"
            aria-label="Name of information it doesn’t define"
            :class="control"
            @input="emit('update:extra', { name: ($event.target as HTMLInputElement).value, text: extra?.text ?? '' })"
          >
          <input
            :value="extra?.text ?? ''"
            type="text"
            placeholder="Value"
            aria-label="Its value"
            :class="control"
            @input="emit('update:extra', { name: extra?.name ?? '', text: ($event.target as HTMLInputElement).value })"
          >
        </div>
      </div>
    </section>

    <!-- Result -->
    <section aria-labelledby="result-heading" class="min-w-0 self-start lg:sticky lg:top-6" data-preview-result>
      <h2 id="result-heading" class="text-xs font-medium text-slate-500">Result</h2>
      <div class="mt-2 overflow-hidden rounded-2xl border border-slate-200/80 bg-white">
        <div class="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
          <DefinitionTile :appearance="appearance" size="sm" />
          <div class="min-w-0">
            <p class="truncate font-semibold text-slate-900">{{ name || 'New Definition' }}</p>
            <p class="text-xs text-slate-500">This example, as Orbit receives it</p>
          </div>
        </div>
        <div class="px-4">
          <ResultTree :nodes="nodes" :entries="entries" :data="result.data" :by-path="result.byPath" :catalogue="catalogue" />
          <div v-if="extra?.name.trim()" class="border-t border-slate-100 py-2">
            <div class="flex items-baseline justify-between gap-3 text-sm">
              <span class="min-w-0 truncate font-mono text-amber-700">{{ extra.name.trim() }}</span>
              <span class="min-w-0 truncate font-medium text-red-700">“{{ extra.text }}”</span>
            </div>
            <p v-if="result.byPath[extra.name.trim()]" class="mt-0.5 text-xs text-red-700">{{ result.byPath[extra.name.trim()] }}</p>
          </div>
          <p v-if="!anything && !extra?.name.trim()" class="py-3 text-sm text-slate-400">Nothing given</p>
        </div>
        <p v-if="result.left.length" class="border-t border-slate-100 px-4 py-2 text-xs text-slate-500" data-left-out>Not given: {{ result.left.join(', ') }}</p>
        <!-- A contract that can't be resolved here: not the information's fault, so not red -->
        <div v-if="result.unavailable.length" class="border-t border-amber-100 bg-amber-50/70 px-4 py-3 text-sm text-amber-900" role="status" data-verdict data-unavailable>
          <p class="font-medium">Can’t be checked here yet</p>
          <ul class="mt-1 flex flex-col gap-0.5 text-xs">
            <li v-for="u in result.unavailable" :key="u">{{ u }}</li>
          </ul>
        </div>
        <div v-else class="border-t px-4 py-3 text-sm" :class="fits ? 'border-emerald-100 bg-emerald-50/60 text-emerald-800' : 'border-red-100 bg-red-50/60 text-red-800'" role="status" data-verdict>
          <p class="font-medium">{{ fits ? `Fits ${name || 'this Definition'}` : `Doesn’t fit ${name || 'this Definition'}` }}</p>
          <ul v-if="!fits" class="mt-1 flex flex-col gap-0.5 text-xs">
            <li v-for="issue in result.issues" :key="issue">{{ issue }}</li>
          </ul>
        </div>
      </div>
    </section>
  </div>
</template>
