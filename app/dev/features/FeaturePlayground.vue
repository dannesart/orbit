<script setup lang="ts">
// Feature playground (development only; registered by nuxt.config.ts under `nuxt dev` alone):
// Record A → Orbit.Console → Orbit.Transform → Orbit.Console, run in the browser on in-memory
// fixtures. Nothing is fetched, saved or logged.
import { type Data, sameData } from '#shared/features/definitions'
import { type Mapping, type MappingProperty, formatSource, reviseMapping } from '#shared/features/mappings'
import { orbitConsole } from '#shared/features/features'
import {
  A1, B1, CONSOLES, DEFINITIONS, INITIAL_DATA, INITIAL_MAPPING, PINS, RECORD_ID, WORKSPACE, type Step,
  definitionLabel, featureKey, mappingHints, parseRecordData, runExperiment, shapeOf,
} from './experiment'
import SourceEditor from './SourceEditor.vue'
import StepResult from './StepResult.vue'

useHead({ title: 'Feature playground · Orbit' })

const plain = <T,>(value: T): T => JSON.parse(JSON.stringify(value))

const pinKey = ref('a1')
const recordText = ref(JSON.stringify(INITIAL_DATA, null, 2))
const consoleId = ref(featureKey(orbitConsole))
const draft = ref<MappingProperty[]>(plain([...INITIAL_MAPPING.properties]))
const versions = shallowRef<Mapping[]>([INITIAL_MAPPING])
const steps = shallowRef<[Step, Step, Step]>([null, null, null])
const ranWith = ref('')

const pin = computed(() => PINS.find((p) => p.key === pinKey.value)!)
const parsed = computed(() => parseRecordData(recordText.value))
const latest = computed(() => versions.value.at(-1)!)
const draftChanged = computed(() => !sameData(plain(draft.value), plain(latest.value.properties)))
const hints = computed(() => mappingHints(draft.value, A1, B1))
const snapshot = computed(() => JSON.stringify([pinKey.value, recordText.value, consoleId.value, draft.value]))
const stale = computed(() => snapshot.value !== ranWith.value)

function run() {
  const record = parsed.value
  if ('error' in record) return
  // Mappings are immutable: a changed draft becomes the Mapping's next version.
  if (draftChanged.value) versions.value = [...versions.value, reviseMapping(latest.value, plain(draft.value))]
  steps.value = runExperiment(
    {
      definitions: DEFINITIONS,
      // A fixture: a real Record could never be saved with data that doesn't match its Definition.
      records: [{ id: RECORD_ID, workspaceId: WORKSPACE, definition: pin.value.ref, data: record.data as Data }],
      mappings: versions.value,
    },
    { console: CONSOLES.find((c) => featureKey(c.feature) === consoleId.value)!.feature, mapping: { id: latest.value.id, version: latest.value.version } },
  )
  ranWith.value = snapshot.value
}

function startOver() {
  pinKey.value = 'a1'
  recordText.value = JSON.stringify(INITIAL_DATA, null, 2)
  consoleId.value = featureKey(orbitConsole)
  draft.value = plain([...INITIAL_MAPPING.properties])
}

const setName = (i: number, name: string) => (draft.value[i] = { ...draft.value[i]!, name })
const setSource = (i: number, source: MappingProperty['source']) => (draft.value[i] = { ...draft.value[i]!, source })
const addProperty = () => draft.value.push({ name: '', source: { kind: 'literal', value: '' } })
const removeProperty = (i: number) => draft.value.splice(i, 1)

run()

const card = 'rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm sm:p-8'
const control = 'rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-900 shadow-xs outline-none transition focus:border-accent-500 focus:ring-2 focus:ring-accent-100'
</script>

<template>
  <main class="mx-auto max-w-3xl px-4 pt-10 pb-32 sm:px-6 sm:pt-14">
    <header>
      <p class="text-xs font-semibold tracking-wide text-accent-700 uppercase">Development only</p>
      <h1 class="mt-1 text-2xl font-semibold tracking-tight text-slate-900">Feature playground</h1>
      <p class="mt-2 text-slate-600">
        Record A → Orbit.Console → Orbit.Transform → Orbit.Console. Each Feature is invoked on its own;
        a step runs only if the one before it handed something on. Everything here lives in this page:
        nothing is saved, sent or logged.
      </p>
    </header>

    <ol class="mt-8 flex flex-col">
      <!-- Record A -->
      <li :class="card">
        <p class="text-xs font-medium text-slate-500">Record · in memory</p>
        <h2 class="text-lg font-semibold text-slate-900">Record A</h2>

        <label for="pin" class="mt-5 block text-sm font-medium text-slate-700">Pinned to</label>
        <select id="pin" v-model="pinKey" :class="[control, 'mt-1.5 w-full sm:w-auto']">
          <option v-for="p in PINS" :key="p.key" :value="p.key">{{ definitionLabel(p.ref) }}</option>
        </select>
        <p class="mt-1.5 text-sm text-slate-500">
          {{ pin.note }}
          <span class="font-mono text-xs text-slate-600">{{ shapeOf(DEFINITIONS.find((d) => d.id === pin.ref.id && d.version === pin.ref.version)!) }}</span>
        </p>

        <label for="record-data" class="mt-5 block text-sm font-medium text-slate-700">Data</label>
        <textarea
          id="record-data"
          v-model="recordText"
          rows="4"
          spellcheck="false"
          autocomplete="off"
          :aria-invalid="'error' in parsed"
          aria-describedby="record-data-hint"
          class="field font-mono text-sm"
        />
        <p id="record-data-hint" class="mt-2 text-sm" :class="'error' in parsed ? 'text-red-700' : 'text-slate-500'" aria-live="polite">
          {{ 'error' in parsed ? parsed.error : 'Edit freely, even into something its Definition wouldn’t allow, to see what the boundary does.' }}
        </p>
      </li>

      <li aria-hidden="true" class="flex justify-center py-1"><span class="h-6 w-px bg-slate-300" /></li>

      <!-- Step 1: Console -->
      <li :class="card">
        <p class="text-xs font-medium text-slate-500">Step 1 · Feature</p>
        <h2 class="text-lg font-semibold text-slate-900">Orbit.Console</h2>
        <p class="mt-1 text-sm text-slate-600">Shows what it receives and passes it on, unchanged.</p>
        <details class="mt-3 text-sm">
          <summary class="text-sm text-slate-600">Misbehave on purpose</summary>
          <label for="console-variant" class="mt-3 block text-sm font-medium text-slate-700">Run this Console instead</label>
          <select id="console-variant" v-model="consoleId" :class="[control, 'mt-1.5 w-full sm:w-auto']">
            <option v-for="c in CONSOLES" :key="featureKey(c.feature)" :value="featureKey(c.feature)">{{ c.label }}</option>
          </select>
        </details>
        <StepResult :step="steps[0]" :stale="stale" pass-through />
      </li>

      <li aria-hidden="true" class="flex justify-center py-1"><span class="h-6 w-px bg-slate-300" /></li>

      <!-- Step 2: Transform -->
      <li :class="card">
        <p class="text-xs font-medium text-slate-500">Step 2 · Feature</p>
        <h2 class="text-lg font-semibold text-slate-900">Orbit.Transform</h2>
        <p class="mt-1 text-sm text-slate-600">
          Builds a new object from {{ definitionLabel(A1) }} for {{ definitionLabel(B1) }}
          <span class="font-mono text-xs text-slate-600">{{ shapeOf(B1) }}</span>.
        </p>

        <div class="mt-5 flex flex-wrap items-baseline justify-between gap-2">
          <h3 class="text-sm font-semibold text-slate-800">Output properties</h3>
          <p class="text-xs text-slate-500">
            Mapping v{{ latest.version }}<template v-if="draftChanged">. Edited: running makes v{{ latest.version + 1 }}</template>
          </p>
        </div>

        <ul class="mt-3 flex flex-col gap-4">
          <li v-for="(property, i) in draft" :key="i" class="rounded-2xl border border-slate-200 p-4">
            <div class="flex flex-wrap items-center gap-2">
              <input
                :value="property.name"
                type="text"
                autocomplete="off"
                spellcheck="false"
                placeholder="propertyName"
                :aria-label="`Property ${i + 1} name`"
                :class="[control, 'w-40 font-mono font-medium']"
                @input="setName(i, ($event.target as HTMLInputElement).value)"
              >
              <span class="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-700">{{ hints.rows[i]?.type ?? '?' }}</span>
              <span v-if="hints.rows[i]?.expected === null && property.name" class="text-xs text-amber-700">Not in {{ definitionLabel(B1) }}</span>
              <span v-else-if="hints.rows[i]?.type && hints.rows[i]?.expected && hints.rows[i]?.type !== hints.rows[i]?.expected" class="text-xs text-amber-700">
                {{ definitionLabel(B1) }} expects {{ hints.rows[i]?.expected }}
              </span>
              <button type="button" class="link ml-auto text-sm" :aria-label="`Remove property ${property.name || i + 1}`" @click="removeProperty(i)">Remove</button>
            </div>
            <div class="mt-3">
              <SourceEditor :model-value="property.source" :fields="A1.fields" :label="property.name || `Property ${i + 1}`" @update:model-value="setSource(i, $event)" />
            </div>
            <p class="mt-3 overflow-x-auto font-mono text-xs whitespace-nowrap text-slate-500">{{ property.name || '?' }} = {{ formatSource(property.source) }}</p>
            <ul v-if="hints.rows[i]?.issues.length" class="mt-2 list-disc pl-5 text-sm text-red-700">
              <li v-for="issue in hints.rows[i]?.issues" :key="issue">{{ issue }}</li>
            </ul>
          </li>
        </ul>
        <button type="button" class="link mt-3 text-sm" @click="addProperty">Add a property</button>
        <p v-if="hints.missing.length" class="mt-2 text-sm text-amber-700">
          {{ definitionLabel(B1) }} also needs {{ hints.missing.map((f) => `${f.name} (${f.type})`).join(', ') }}.
        </p>

        <StepResult :step="steps[1]" :stale="stale" />
      </li>

      <li aria-hidden="true" class="flex justify-center py-1"><span class="h-6 w-px bg-slate-300" /></li>

      <!-- Step 3: Console -->
      <li :class="card">
        <p class="text-xs font-medium text-slate-500">Step 3 · Feature</p>
        <h2 class="text-lg font-semibold text-slate-900">Orbit.Console</h2>
        <p class="mt-1 text-sm text-slate-600">Shows what Transform handed on.</p>
        <StepResult :step="steps[2]" :stale="stale" pass-through />
      </li>
    </ol>

    <div class="sticky bottom-4 z-10 mt-8">
      <div class="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white/90 p-3 shadow-lg backdrop-blur">
        <button type="button" class="btn-primary w-auto px-6" :disabled="'error' in parsed" :class="{ 'disabled:cursor-default': true }" @click="run">
          Run the experiment
        </button>
        <p class="text-sm text-slate-500" aria-live="polite">
          {{ 'error' in parsed ? 'Fix Record A’s JSON to run.' : stale ? 'Changed since the last run.' : 'Up to date.' }}
        </p>
        <button type="button" class="link ml-auto text-sm" @click="startOver">Start over</button>
      </div>
    </div>
  </main>
</template>
