<script setup lang="ts">
// The live Preview: an example of the Definition being built, and what Orbit makes of it.
//
//   Example  neutral, illustrative values for each property (never a Record, never guessed from a
//            name), each given or left out: an optional one may be left out; a required one can
//            be, to see Orbit refuse it. Reset brings the generated values back. Advanced testing
//            (discreet) sends values exactly as typed, and adds information it doesn't define.
//   Result   the information as Orbit receives it, under the Definition's own icon, colour and
//            name, and Orbit's verdict: its own validation (example.ts), never a second one.
//
// Optional: nothing here is needed to create anything, and nothing typed here is kept.
import type { Appearance } from './appearance'
import { type ExampleEntries, type ExampleEntry, previewResult, shown } from './example'
import { type DraftField, type Example, typeWords } from './model'
import DefinitionTile from './DefinitionTile.vue'
import DefinitionsIcon from './DefinitionsIcon.vue'

const props = defineProps<{
  fields: readonly DraftField[]
  entries: ExampleEntries
  extra: Example['extra']
  advanced: boolean
  name: string
  appearance: Appearance
  idPrefix: string
}>()
const emit = defineEmits<{
  'update:entries': [ExampleEntries]
  'update:extra': [Example['extra']]
  'update:advanced': [boolean]
  reset: []
}>()

const named = computed(() => props.fields.filter((f) => f.name.trim() && props.entries[f.key]))
const unnamed = computed(() => props.fields.filter((f) => !f.name.trim()).length)
const result = computed(() => previewResult(props.fields, props.entries, props.extra))
const fits = computed(() => !result.value.issues.length)

function set(key: number, change: Partial<ExampleEntry>, edited = true) {
  emit('update:entries', { ...props.entries, [key]: { ...props.entries[key]!, ...change, ...(edited ? { edited: true } : {}) } })
}
const valueOf = (f: DraftField) => props.entries[f.key]!
/** Advanced: send this value exactly as typed text (yes or no becomes the text "true" or "false"), or not. */
function setRaw(f: DraftField, on: boolean) {
  const v = valueOf(f).value
  if (on) set(f.key, { raw: true, value: typeof v === 'boolean' ? String(v) : v })
  else set(f.key, { raw: false, value: f.type === 'boolean' ? v === true || v === 'true' : String(v) })
}
const id = (f: DraftField, what: string) => `${props.idPrefix}-example-${what}-${f.key}`
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

      <p v-if="!named.length" class="mt-3 rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">
        Name a property in Model to try it here.
      </p>
      <ul v-else class="mt-2 flex flex-col gap-1.5">
        <li v-for="f in named" :key="f.key" class="rounded-xl border border-slate-200/80 bg-white px-3 py-2.5" :data-example="f.name.trim()">
          <div class="flex items-center gap-2">
            <DefinitionsIcon :name="f.type" class="size-4 shrink-0 text-slate-400" />
            <span class="min-w-0 truncate font-mono text-sm text-slate-900">{{ f.name.trim() }}</span>
            <span class="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium" :class="f.optional ? 'bg-slate-100 text-slate-500' : 'bg-accent-50 text-accent-700'">{{ f.optional ? 'Optional' : 'Required' }}</span>
            <label class="ml-auto flex shrink-0 cursor-pointer items-center gap-2 text-xs text-slate-600">
              <input
                :id="id(f, 'given')"
                type="checkbox"
                class="peer sr-only"
                :checked="valueOf(f).given"
                @change="set(f.key, { given: ($event.target as HTMLInputElement).checked }, false)"
              >
              <span class="relative h-5 w-9 rounded-full bg-slate-200 transition peer-checked:bg-accent-500 peer-focus-visible:ring-2 peer-focus-visible:ring-accent-500 peer-focus-visible:ring-offset-2 after:absolute after:top-0.5 after:left-0.5 after:size-4 after:rounded-full after:bg-white after:shadow-sm after:transition peer-checked:after:translate-x-4" aria-hidden="true" />
              <span class="sr-only">Give {{ f.name.trim() }}</span>
              <span aria-hidden="true">{{ valueOf(f).given ? 'Given' : 'Left out' }}</span>
            </label>
          </div>

          <div v-if="valueOf(f).given" class="mt-2">
            <input
              v-if="valueOf(f).raw || f.type !== 'boolean'"
              :id="id(f, 'value')"
              :value="String(valueOf(f).value)"
              type="text"
              :inputmode="f.type === 'number' && !valueOf(f).raw ? 'decimal' : undefined"
              :aria-label="`${f.name.trim()}, ${valueOf(f).raw ? 'sent as typed text' : typeWords[f.type].toLowerCase()}`"
              :class="control"
              @input="set(f.key, { value: ($event.target as HTMLInputElement).value })"
            >
            <div v-else role="radiogroup" :aria-label="f.name.trim()" class="flex w-48 rounded-full bg-slate-100 p-0.5">
              <label v-for="choice in [true, false]" :key="String(choice)" class="flex flex-1 cursor-pointer items-center justify-center rounded-full px-3 py-1.5 text-xs font-medium transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent-500" :class="valueOf(f).value === choice ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'">
                <input type="radio" class="sr-only" :name="id(f, 'choice')" :checked="valueOf(f).value === choice" @change="set(f.key, { value: choice })">
                {{ choice ? 'Yes' : 'No' }}
              </label>
            </div>
            <label v-if="advanced && f.type !== 'string'" class="mt-1.5 flex items-center gap-2 text-xs text-slate-500">
              <input type="checkbox" :checked="valueOf(f).raw" class="size-3.5 rounded accent-accent-600" @change="setRaw(f, ($event.target as HTMLInputElement).checked)">
              Send exactly as typed text
            </label>
          </div>
          <p v-else class="mt-1 text-xs text-slate-500">{{ f.optional ? 'Left out. Allowed: it’s optional.' : 'Left out, to see what happens: it’s required.' }}</p>
        </li>
      </ul>
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
        <ul class="divide-y divide-slate-100 px-4">
          <li v-for="f in named.filter((x) => valueOf(x).given)" :key="f.key" class="py-2">
            <div class="flex items-baseline justify-between gap-3 text-sm">
              <span class="min-w-0 truncate font-mono text-slate-600">{{ f.name.trim() }}</span>
              <span class="min-w-0 truncate font-medium" :class="result.byProperty[f.name.trim()] ? 'text-red-700' : 'text-slate-900'">{{ shown(result.data[f.name.trim()]) }}</span>
            </div>
            <p v-if="result.byProperty[f.name.trim()]" class="mt-0.5 text-xs text-red-700">{{ result.byProperty[f.name.trim()] }}</p>
          </li>
          <li v-if="extra?.name.trim()" class="py-2">
            <div class="flex items-baseline justify-between gap-3 text-sm">
              <span class="min-w-0 truncate font-mono text-amber-700">{{ extra.name.trim() }}</span>
              <span class="min-w-0 truncate font-medium text-red-700">{{ shown(extra.text) }}</span>
            </div>
            <p v-if="result.byProperty[extra.name.trim()]" class="mt-0.5 text-xs text-red-700">{{ result.byProperty[extra.name.trim()] }}</p>
          </li>
          <li v-if="!named.some((x) => valueOf(x).given) && !extra?.name.trim()" class="py-3 text-sm text-slate-400">Nothing given</li>
        </ul>
        <p v-if="result.left.length" class="border-t border-slate-100 px-4 py-2 text-xs text-slate-500" data-left-out>Not given: {{ result.left.join(', ') }}</p>
        <div class="border-t px-4 py-3 text-sm" :class="fits ? 'border-emerald-100 bg-emerald-50/60 text-emerald-800' : 'border-red-100 bg-red-50/60 text-red-800'" role="status" data-verdict>
          <p class="font-medium">{{ fits ? `Fits ${name || 'this Definition'}` : `Doesn’t fit ${name || 'this Definition'}` }}</p>
          <ul v-if="!fits" class="mt-1 flex flex-col gap-0.5 text-xs">
            <li v-for="issue in result.issues" :key="issue">{{ issue }}</li>
          </ul>
        </div>
      </div>
    </section>
  </div>
</template>
