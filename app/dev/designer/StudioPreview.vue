<script setup lang="ts">
// Mapping Studio's Preview: the example input, and what would be made from it, as trees (raw JSON
// on demand). Three different things, never mixed and always named:
//   Draft    this draft, previewed: the very evaluation and validation the Transform runs with,
//            but nothing runs (preview.ts)
//   Applied  the applied Mapping, previewed the same way with the same example
//   Run      what actually ran: the latest run's evidence and output, and earlier runs (RunHistory)
import type { DefinitionRef, DefinitionVersion, Field } from '#shared/features/definitions'
import type { MappingProperty } from '#shared/features/mappings'
import type { Step } from '../features/experiment'
import ObservedTree from './ObservedTree.vue'
import RunHistory from './RunHistory.vue'
import { type Configuration, type RunRecord, type TransformDraft, labelOf } from './config'
import { fromDraft } from './parts'
import type { DraftReview, Example, OutputPreview } from './preview'
import { FLAT, READING } from './reading'
import { type AppliedPreview, madeFrom } from './studio'

const props = defineProps<{
  draft: TransformDraft
  config: Configuration
  target: { definition: DefinitionVersion; label: string }
  review: DraftReview
  output: OutputPreview
  example: Example
  input: DefinitionVersion
  /** What the draft reads, in words, as the authority resolved it (never looked up here). */
  inputLabel: string
  applied: AppliedPreview
  step: Step
  stale: boolean
  runNumber: number
  runs: readonly RunRecord[]
}>()

type View = 'draft' | 'applied' | 'run'
const view = ref<View>('draft')
const reading = inject(READING, ref(FLAT))
const versionWords = (ref: DefinitionRef) => `${reading.value.resolve(ref)?.name ?? ref.id} · v${ref.version}`
const label = (ref: DefinitionRef) => labelOf(props.config, ref)

/** One previewed Mapping: the object it would make, and why anything isn't in it. */
function previewed(properties: readonly MappingProperty[], preview: OutputPreview, target: DefinitionVersion, targetLabel: string) {
  const data = madeFrom(properties, preview)
  const notes: string[] = []
  for (const f of target.fields) {
    const i = properties.findIndex((p) => p.name === f.name)
    const v = i >= 0 ? preview.values[i] : undefined
    if (i < 0 && f.optional !== true) notes.push(`${f.name}: not mapped`)
    else if (v && 'problems' in v) notes.push(`${f.name}: can’t be made. ${v.problems[0]}`)
    else if (v && 'absent' in v) notes.push(`${f.name}: left out, the example has no ${v.absent.join(', ')}`)
  }
  // Against a contract that can't be resolved here nothing is known, so nothing is said about it.
  if (!preview.unresolved) properties.forEach((p) => { if (!target.fields.some((f) => f.name === p.name)) notes.push(`${p.name || 'An unnamed value'}: not part of ${targetLabel}`) })
  const fits = preview.fits ? preview.fits.issues : null
  return { data, notes, fits, kind: preview.kind, refused: preview.refused, unresolved: preview.unresolved === true, fields: target.fields as readonly Field[], label: targetLabel }
}
const draftView = computed(() => previewed(fromDraft(props.draft.properties), props.output, props.target.definition, props.target.label))
const appliedView = computed(() => previewed(props.applied.properties, props.applied.preview, props.applied.target, props.applied.label))
const shown = computed(() => (view.value === 'applied' ? appliedView.value : draftView.value))
const shownExample = computed(() => (view.value === 'applied' ? props.applied.example : props.example))
const same = computed(() => JSON.stringify(draftView.value.data) === JSON.stringify(appliedView.value.data) && props.target.label === props.applied.label)
const VIEWS = computed(() => [
  { key: 'draft' as const, words: 'Draft' },
  { key: 'applied' as const, words: `Applied · v${props.applied.version}` },
  { key: 'run' as const, words: props.runNumber ? `Run ${props.runNumber}` : 'Runs' },
])
const panel = 'rounded-3xl bg-white p-5 ring-1 ring-slate-200/80 sm:p-6'
const segment = 'rounded-full px-3 py-1 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500'
</script>

<template>
  <div class="grid gap-6 lg:grid-cols-2">
    <!-- The example input -->
    <section :class="panel" aria-labelledby="example-heading" data-studio-example>
      <div class="mb-3 flex items-baseline gap-2">
        <h2 id="example-heading" class="text-sm font-semibold text-slate-900">Example input</h2>
        <span class="truncate text-xs text-slate-500">Record A’s data · {{ view === 'applied' ? label(applied.input) : inputLabel }}</span>
      </div>
      <p v-if="'problem' in shownExample" class="text-sm text-amber-800">{{ shownExample.problem }} <span v-if="shownExample.details.length" class="block text-xs">{{ shownExample.details.join(' ') }}</span></p>
      <template v-else>
        <ObservedTree :data="shownExample.data as Record<string, unknown>" :fields="(view === 'applied' ? applied.input : input).fields" :resolve="reading.resolve" :label="versionWords" />
        <details class="mt-3 text-xs text-slate-500">
          <summary class="cursor-pointer">JSON</summary>
          <pre class="mt-1 overflow-x-auto rounded-xl bg-slate-50 p-3 font-mono text-slate-700">{{ JSON.stringify(shownExample.data, null, 2) }}</pre>
        </details>
      </template>
      <p class="mt-3 text-xs text-slate-500">Changed on Record A in the Designer.</p>
    </section>

    <!-- What would be made, what's applied, and what ran -->
    <section :class="panel" aria-labelledby="result-heading" data-studio-result>
      <div class="mb-3 flex flex-wrap items-center gap-2">
        <h2 id="result-heading" class="mr-auto text-sm font-semibold text-slate-900">Output</h2>
        <div class="flex rounded-full bg-slate-100 p-0.5" role="radiogroup" aria-label="Which output">
          <button v-for="v in VIEWS" :key="v.key" type="button" role="radio" :aria-checked="view === v.key" :data-preview-view="v.key" :class="[segment, view === v.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900']" @click="view = v.key">{{ v.words }}</button>
        </div>
      </div>

      <template v-if="view !== 'run'">
        <p class="mb-3 text-xs text-slate-500" data-preview-kind>
          <template v-if="view === 'draft'">This draft, previewed with the example. Nothing has run.</template>
          <template v-else>Mapping v{{ applied.version }}, what runs use now, previewed with the same example. Nothing has run.<template v-if="same"> The draft makes the same.</template></template>
        </p>
        <template v-if="!('problem' in shownExample)">
          <ObservedTree :data="shown.data" :fields="shown.fields" :resolve="reading.resolve" :label="versionWords" />
          <ul v-if="shown.notes.length" class="mt-3 flex flex-col gap-1 text-xs text-amber-800" data-preview-notes>
            <li v-for="n in shown.notes" :key="n">{{ n }}</li>
          </ul>
          <p v-if="shown.fits && shown.fits.length" class="mt-2 text-xs text-red-700">{{ shown.label }} wouldn’t accept this: {{ shown.fits.join(' ') }}</p>
          <p v-else-if="shown.fits" class="mt-2 text-xs text-slate-500" data-preview-fits>Fits {{ shown.label }}.</p>
          <!-- Not a result: what each value reads, shown as such, and why a run would refuse it -->
          <p v-if="shown.kind === 'illustration'" class="mt-2 text-xs" :class="shown.refused.length ? 'text-red-700' : 'text-slate-500'" data-preview-illustration>
            An illustration, not a result.<template v-if="shown.unresolved"> A Definition it depends on can’t be found here, so nothing was checked against it.</template><template v-if="shown.refused.length"> This Transform version would refuse the Mapping before running: {{ shown.refused.join(' ') }}</template>
          </p>
          <details class="mt-3 text-xs text-slate-500">
            <summary class="cursor-pointer">JSON</summary>
            <pre class="mt-1 overflow-x-auto rounded-xl bg-slate-50 p-3 font-mono text-slate-700">{{ JSON.stringify(shown.data, null, 2) }}</pre>
          </details>
        </template>
        <p v-else class="text-sm text-slate-500">There’s no example to preview with.<template v-if="shown.unresolved"> An illustration, not a result. A Definition it depends on can’t be found here.</template></p>
      </template>

      <template v-else>
        <p class="mb-3 text-xs text-slate-500" data-preview-kind>What actually ran: evidence, with the exact versions each run used. Later changes never rewrite it.</p>
        <RunHistory :step="step" :stale="stale" :run-number="runNumber" :runs="runs" :config="config" />
      </template>
    </section>
  </div>
</template>
