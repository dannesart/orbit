<script setup lang="ts">
// The Transform's panel (Experiment #4), output first:
//   the last run, in one line, with its details, past runs and every version a click away;
//   the setup (the only part that scrolls): what the Transform creates, then its properties;
//   the preview of the whole draft object and Apply / Discard, always in view, saying exactly
//   which versions Apply would create.
// Preview is never execution: it shows no outcome, and only a run makes evidence.
import type { DefinitionRef, DefinitionVersion } from '#shared/features/definitions'
import { type Step, DEFINITIONS, WORKSPACE, definitionLabel, outcomeLabel, shapeOf } from '../features/experiment'
import OutputTree from './OutputTree.vue'
import RunResult from './RunResult.vue'
import ShownText from './ShownText.vue'
import { type Configuration, type Plan, type RunRecord, type TransformDraft, labelOf } from './config'
import type { DraftReview, Example, OutputPreview } from './preview'
import { describeProperty } from './summary'

const props = defineProps<{
  draft: TransformDraft
  config: Configuration
  target: { definition: DefinitionVersion; label: string; isNew: boolean }
  plan: Plan
  structure: readonly string[]
  review: DraftReview
  output: OutputPreview
  example: Example
  input: DefinitionVersion
  canUndo: boolean
  step: Step
  stale: boolean
  runNumber: number
  runs: readonly RunRecord[]
}>()
const emit = defineEmits<{ 'update:draft': [TransformDraft]; apply: [anyway: boolean]; discard: []; undo: [] }>()

const details = ref(false)
const showPreview = ref(true)
const label = (ref: DefinitionRef) => labelOf(props.config, ref)
const problems = computed(() => [...props.structure, ...props.review.problems])
const mappingProblemsOnly = computed(() => !props.structure.length && props.review.problems.length > 0)
const tone = computed(() => {
  const kind = props.step?.evidence.outcome.kind
  return kind === 'succeeded' ? 'bg-emerald-50 text-emerald-800 ring-emerald-200' : kind === 'failed' ? 'bg-red-50 text-red-700 ring-red-200' : kind ? 'bg-amber-50 text-amber-800 ring-amber-200' : 'bg-slate-100 text-slate-600 ring-slate-200'
})
const lastRun = computed(() => props.runs.at(-1))

// --- What to create ---
const setUse = (use: TransformDraft['use']) => emit('update:draft', { ...props.draft, use })
const keyOf = (ref: DefinitionRef) => `${ref.id}@${ref.version}`
function setCatalogue(key: string) {
  const d = DEFINITIONS.find((x) => keyOf(x) === key)
  if (d) emit('update:draft', { ...props.draft, catalogue: { id: d.id, version: d.version } })
}
const setLocalName = (name: string) => emit('update:draft', { ...props.draft, local: { ...props.draft.local, name } })
const latestLocal = computed(() => props.config.locals.at(-1))

// --- What Apply would do, in words ---
const applyWords = computed(() => {
  const { output, mapping, changes } = props.plan
  if (!changes) return `Applied: ${label(props.config.output)} · Mapping v${props.config.mapping.version}.`
  const made: string[] = []
  if (output.isNew) made.push(`${props.draft.local.name || 'the output'} v${output.ref.version}`)
  if (mapping.isNew) made.push(`${output.isNew ? 'its' : 'a new'} Mapping v${mapping.version}`)
  if (made.length) return `Apply creates ${made.join(' and ')}. Runs still use ${label(props.config.output)} · Mapping v${props.config.mapping.version}.`
  return `Apply switches to ${output.label} and its existing Mapping v${mapping.version}. Nothing new is created.`
})

// --- The whole object, as the draft would make it ---
const rows = computed(() => {
  const names = props.draft.properties.map((p) => p.name)
  const required = props.target.definition.fields.map((f) => {
    const index = names.indexOf(f.name)
    return { name: f.name, value: index >= 0 ? props.output.values[index]! : null, extra: false }
  })
  const extras = props.review.extras.map((x) => ({ name: props.draft.properties[x.index]!.name || 'unnamed', value: props.output.values[x.index]!, extra: true }))
  return [...required, ...extras]
})

// --- History ---
const mappingIds = computed(() => [...new Set(props.config.mappings.map((m) => m.id))])
const card = 'flex w-full cursor-pointer items-start gap-2.5 rounded-xl p-3 text-left ring-1 transition'
const control = 'rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-900 shadow-xs outline-none transition focus:border-accent-500 focus:ring-2 focus:ring-accent-100'
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <!-- The last run: one line -->
    <div class="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-slate-200 bg-slate-50 px-5 py-2.5">
      <span class="text-xs font-medium text-slate-500">Last run</span>
      <span class="rounded-full px-2 py-0.5 text-xs font-semibold ring-1" :class="tone">{{ step ? outcomeLabel(step.evidence.outcome) : 'Not invoked' }}</span>
      <span class="min-w-0 text-xs text-slate-500">
        Run {{ runNumber }}<template v-if="lastRun?.output"> · {{ label(lastRun.output) }}</template><template v-if="lastRun?.mapping"> · Mapping v{{ lastRun.mapping.version }}</template><template v-if="stale"> · changed since</template>
      </span>
      <button type="button" class="link ml-auto text-sm" :aria-expanded="details" aria-controls="transform-body" @click="details = !details">{{ details ? 'Back to setup' : 'Details' }}</button>
    </div>

    <div id="transform-body" class="min-h-0 flex-1 overflow-y-auto px-5 py-4">
      <!-- What happened, and what exists -->
      <template v-if="details">
        <section aria-labelledby="transform-run-heading">
          <h3 id="transform-run-heading" class="text-sm font-semibold text-slate-900">What happened in run {{ runNumber }}</h3>
          <RunResult :step="step" :stale="stale" :label="label" />
        </section>
        <section v-if="runs.length > 1" aria-labelledby="runs-heading" class="mt-6">
          <h3 id="runs-heading" class="text-sm font-semibold text-slate-900">Earlier runs</h3>
          <p class="mt-0.5 text-xs text-slate-500">Each names the exact versions it used. Later changes don’t rewrite them.</p>
          <ol class="mt-2 flex flex-col gap-1 text-sm text-slate-700">
            <li v-for="r in [...runs].reverse().slice(1)" :key="r.number">
              Run {{ r.number }} · {{ r.outcome ? outcomeLabel(r.outcome) : 'Transform not invoked' }}<template v-if="r.output"> · {{ label(r.output) }}</template><template v-if="r.mapping"> · Mapping v{{ r.mapping.version }}</template>
            </li>
          </ol>
        </section>
        <section aria-labelledby="versions-heading" class="mt-6">
          <h3 id="versions-heading" class="text-sm font-semibold text-slate-900">Versions</h3>
          <p class="mt-0.5 text-xs text-slate-500">Frozen when applied. Nothing here changes afterwards.</p>
          <div v-if="config.locals.length" class="mt-3">
            <p class="text-xs font-medium text-slate-500">This Transform’s own output</p>
            <ul class="mt-1 flex flex-col gap-1 text-sm text-slate-700">
              <li v-for="d in config.locals" :key="d.version"><span class="font-medium">{{ d.name }} · v{{ d.version }}</span> <span class="font-mono text-xs text-slate-500">{{ shapeOf(d) }}</span></li>
            </ul>
          </div>
          <div v-for="id in mappingIds" :key="id" class="mt-3">
            <p class="text-xs font-medium text-slate-500">Mapping for {{ label(config.mappings.find((m) => m.id === id)!.to) }}</p>
            <ul class="mt-1 flex flex-col gap-1.5 text-sm text-slate-700">
              <li v-for="m in config.mappings.filter((x) => x.id === id)" :key="m.version">
                <span class="font-medium">v{{ m.version }}</span>
                <span v-if="m.id === config.mapping.id && m.version === config.mapping.version" class="ml-1 rounded-full bg-accent-50 px-1.5 text-xs font-medium text-accent-800 ring-1 ring-accent-200">applied</span>
                <span class="block text-xs text-slate-500">{{ m.properties.map(describeProperty).join(' · ') || 'Makes nothing' }}</span>
              </li>
            </ul>
          </div>
        </section>
      </template>

      <!-- Setup: output first -->
      <template v-else>
        <section aria-labelledby="create-heading">
          <h3 id="create-heading" class="text-sm font-semibold text-slate-900">What should this Transform create?</h3>
          <div class="mt-2 grid grid-cols-2 gap-2" role="radiogroup" aria-labelledby="create-heading">
            <label :class="[card, draft.use === 'catalogue' ? 'bg-accent-50/60 ring-accent-300' : 'ring-slate-200 hover:bg-slate-50']">
              <input type="radio" name="output-use" class="mt-0.5 accent-accent-600" :checked="draft.use === 'catalogue'" @change="setUse('catalogue')">
              <span><span class="block text-sm font-medium text-slate-900">An existing Definition</span><span class="block text-xs text-slate-500">Shared, and can’t change here</span></span>
            </label>
            <label :class="[card, draft.use === 'local' ? 'bg-accent-50/60 ring-accent-300' : 'ring-slate-200 hover:bg-slate-50']">
              <input type="radio" name="output-use" class="mt-0.5 accent-accent-600" :checked="draft.use === 'local'" @change="setUse('local')">
              <span><span class="block text-sm font-medium text-slate-900">Its own output</span><span class="block text-xs text-slate-500">Shaped here, only for this Transform</span></span>
            </label>
          </div>

          <div v-if="draft.use === 'catalogue'" class="mt-3">
            <label for="output-definition" class="block text-xs font-medium text-slate-600">Definition and version</label>
            <select id="output-definition" :value="keyOf(draft.catalogue)" :class="[control, 'mt-1 w-full']" @change="setCatalogue(($event.target as HTMLSelectElement).value)">
              <option v-for="d in DEFINITIONS" :key="keyOf(d)" :value="keyOf(d)" :disabled="d.workspaceId !== null && d.workspaceId !== WORKSPACE">
                {{ definitionLabel(d) }}{{ d.workspaceId !== null && d.workspaceId !== WORKSPACE ? ' (another workspace’s)' : '' }}
              </option>
            </select>
            <p class="mt-1 font-mono text-xs text-slate-500">{{ shapeOf(target.definition) }}</p>
          </div>
          <div v-else class="mt-3">
            <label for="output-name" class="block text-xs font-medium text-slate-600">Name</label>
            <input id="output-name" :value="draft.local.name" type="text" autocomplete="off" placeholder="e.g. Person summary" :class="[control, 'mt-1 w-full']" @input="setLocalName(($event.target as HTMLInputElement).value)">
            <p class="mt-1 text-xs text-slate-500">
              A Definition only this Transform uses, not added to the shared ones.
              <template v-if="target.isNew">Applying freezes it as v{{ target.definition.version }}<template v-if="latestLocal">; v{{ latestLocal.version }} stays as it was</template>.</template>
              <template v-else>Matches v{{ target.definition.version }}, already frozen.</template>
            </p>
          </div>
          <ul v-if="structure.length" class="mt-2 flex flex-col gap-0.5 text-sm text-red-700">
            <li v-for="p in structure" :key="p">{{ p }}</li>
          </ul>
        </section>

        <section aria-labelledby="properties-heading" class="mt-5">
          <h3 id="properties-heading" class="text-sm font-semibold text-slate-900">Its properties, and where each value comes from</h3>
          <p class="mt-0.5 mb-2 text-xs text-slate-500">From a {{ definitionLabel(input) }}. Select a property to set its value.</p>
          <OutputTree :draft="draft" :target="target.definition" :target-label="target.label" :review="review" :input="input" :example="example" @update:draft="emit('update:draft', $event)" />
        </section>
      </template>
    </div>

    <!-- The draft's whole object, and committing it -->
    <div class="border-t border-slate-200 bg-white px-5 pt-3 pb-4 shadow-[0_-6px_16px_-12px_rgb(15_23_42/0.25)]">
      <div class="flex flex-wrap items-baseline gap-x-2">
        <p class="mr-auto text-xs font-semibold tracking-wide text-accent-700 uppercase">Preview · not executed</p>
        <p class="text-xs text-slate-500">From Record A’s data</p>
        <button type="button" class="link text-xs" :aria-expanded="showPreview" aria-controls="preview-object" @click="showPreview = !showPreview">{{ showPreview ? 'Hide' : 'Show' }}</button>
      </div>
      <div v-show="showPreview" id="preview-object">
        <p v-if="'problem' in example" class="mt-1.5 text-sm text-amber-800">{{ example.problem }} <span v-if="example.details.length" class="block text-xs">{{ example.details.join(' ') }}</span></p>
        <div v-else class="mt-1.5 rounded-xl bg-slate-50 px-3 py-2 font-mono text-xs ring-1 ring-slate-200" aria-live="polite">
          <span class="text-slate-400">{</span>
          <div v-for="r in rows" :key="r.name" class="flex min-w-0 items-center gap-2 pl-3">
            <span class="shrink-0" :class="r.extra ? 'text-amber-800 line-through' : 'text-slate-600'">{{ r.name }}:</span>
            <ShownText v-if="r.value && 'value' in r.value" :value="r.value.value" />
            <span v-else-if="r.value && 'problems' in r.value" class="font-sans text-red-700">can’t be made: {{ r.value.problems[0] }}</span>
            <span v-else class="font-sans text-amber-700">not mapped</span>
            <span v-if="r.extra" class="font-sans text-amber-800">not part of the output</span>
          </div>
          <span class="text-slate-400">}</span>
        </div>
        <p v-if="output.fits && !('problem' in example) && !problems.length" class="mt-1 text-xs text-slate-500">
          {{ output.fits.issues.length ? `${target.label} wouldn’t accept this: ${output.fits.issues.join(' ')}` : `Fits ${target.label}. A preview only: nothing has run.` }}
        </p>
      </div>

      <div class="mt-2.5 flex flex-wrap items-center justify-end gap-x-2 gap-y-1.5">
        <p class="mr-auto basis-full text-xs sm:basis-auto" :class="plan.changes ? 'font-medium text-amber-800' : 'text-slate-500'" aria-live="polite">{{ applyWords }}</p>
        <button type="button" class="link text-sm" :disabled="!canUndo" @click="emit('undo')">Undo</button>
        <button type="button" class="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 disabled:opacity-40 disabled:hover:bg-transparent" :disabled="!plan.changes" @click="emit('discard')">Discard</button>
        <button type="button" class="btn-primary w-auto rounded-lg px-4 py-1.5 text-sm disabled:cursor-default disabled:opacity-40" :disabled="!plan.changes || problems.length > 0" @click="emit('apply', false)">Apply</button>
      </div>
      <p v-if="plan.changes && problems.length" class="mt-2 text-xs text-slate-600">
        <span class="text-red-700">{{ problems.length === 1 ? 'One thing' : `${problems.length} things` }} to fix before applying: {{ problems[0] }}</span>
        <button v-if="mappingProblemsOnly" type="button" class="link ml-1 text-xs" @click="emit('apply', true)">Apply anyway (playground only: to see the boundary stop it)</button>
      </p>
    </div>
  </div>
</template>
