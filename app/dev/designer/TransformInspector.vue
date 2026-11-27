<script setup lang="ts">
// The Transform in the inspector: a tool, not a report. Its header (number, title, applied Mapping
// version, the latest run's status, Close), what it reads and makes, its output's properties
// (each row opens Mapping at that property; nothing is edited here), the preview, and Apply. More
// appears on demand: the run's details and evidence from the status button, the full editor at
// Structure from the Output pencil.
import type { DefinitionRef, DefinitionVersion } from '#shared/features/definitions'
import { type Step, definitionLabel } from '../features/experiment'
import ApplyBar from './ApplyBar.vue'
import DesignerIcon from './DesignerIcon.vue'
import PreviewObject from './PreviewObject.vue'
import PropertyRows from './PropertyRows.vue'
import RunHistory from './RunHistory.vue'
import RunStatus from './RunStatus.vue'
import UnsupportedNotice from './UnsupportedNotice.vue'
import { type ApplyAssessment, type Configuration, type Plan, type RunRecord, type TransformDraft, labelOf } from './config'
import type { DraftReview, Example, OutputPreview } from './preview'

const props = defineProps<{
  badge: string
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
  /** Whether the draft may be applied, and why not: the authoritative assessment. */
  assessment: ApplyAssessment
  step: Step
  stale: boolean
  runNumber: number
  runs: readonly RunRecord[]
  /** The exact Transform version this step invokes (featureKey), and those it may invoke. */
  featureKey: string
  versions: readonly { readonly key: string; readonly label: string }[]
}>()
const emit = defineEmits<{
  apply: []
  discard: []
  undo: []
  focus: [mode: 'mapping' | 'structure', property: string | null]
  close: []
  feature: [key: string]
  studio: []
}>()

const details = ref(false)
const label = (ref: DefinitionRef) => labelOf(props.config, ref)
const problems = computed(() => [...props.structure, ...props.review.problems])
const mapped = computed(() => props.review.fields.filter((f) => f.state === 'set').length)
// Optional properties left out aren't unfinished work: the count is of the properties that need a value.
// Nor is what this Transform version can't make: no value would do.
const leftOut = computed(() => props.review.fields.filter((f) => f.state === 'left_out').length)
const needed = computed(() => props.review.fields.filter((f) => f.state !== 'left_out' && f.state !== 'unsupported').length)
const back = ref<HTMLButtonElement>()
function showEvidence() {
  details.value = true
  nextTick(() => back.value?.focus())
}
const iconButton = 'grid size-9 shrink-0 place-items-center rounded-xl transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500'
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <!-- Header -->
    <div class="flex items-center gap-3 px-5 pt-3 pb-4 lg:pt-4">
      <span class="flex h-7 min-w-7 items-center justify-center rounded-full bg-accent-600 px-2 text-xs font-semibold text-white" aria-hidden="true">{{ badge }}</span>
      <div class="min-w-0 flex-1">
        <h2 class="text-base leading-tight font-semibold text-slate-900">Transform</h2>
        <p class="text-xs text-slate-500">Mapping v{{ config.mapping.version }}</p>
      </div>
      <RunStatus :step="step" :run-number="runNumber" :run="runs.at(-1)" :stale="stale" :unapplied="plan.changes" :label="label" @evidence="showEvidence" />
      <button type="button" :class="[iconButton, 'rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-900']" aria-label="Close the Transform inspector" title="Close" @click="emit('close')">
        <DesignerIcon name="close" class="size-4" />
      </button>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto px-5 pb-4">
      <template v-if="details">
        <button ref="back" type="button" class="link text-xs" aria-controls="transform-evidence" @click="details = false">‹ Back</button>
        <RunHistory id="transform-evidence" class="mt-3" :step="step" :stale="stale" :run-number="runNumber" :runs="runs" :config="config" />
      </template>
      <template v-else>
        <p class="flex flex-wrap items-center gap-x-2 text-sm text-slate-700">
          <span>{{ definitionLabel(input) }}</span>
          <span aria-hidden="true" class="text-slate-400">→</span>
          <span class="sr-only">makes</span>
          <span class="font-medium text-slate-900">{{ target.label }}</span>
        </p>
        <!-- The exact Transform version this step invokes: changed only by choosing another here. -->
        <label class="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-600">
          Feature version
          <select :value="featureKey" class="rounded-lg border border-slate-200 bg-white py-1 pr-7 pl-2 text-xs font-medium text-slate-800 outline-none focus:border-accent-500 focus:ring-2 focus:ring-accent-100" data-transform-version @change="emit('feature', ($event.target as HTMLSelectElement).value)">
            <option v-for="v in versions" :key="v.key" :value="v.key">{{ v.label }}</option>
          </select>
        </label>

        <!-- Mapping Studio: the Mapping in a view of its own. Opening it changes nothing. -->
        <button type="button" data-edit-mapping class="mt-4 flex w-full items-center gap-2 rounded-2xl px-4 py-2.5 text-left text-sm font-medium text-accent-700 ring-1 ring-accent-200 transition hover:bg-accent-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500" @click="emit('studio')">
          Edit Mapping
          <span class="text-xs font-normal text-slate-500">· {{ definitionLabel(input) }} → {{ target.label }}</span>
          <DesignerIcon name="chevron" class="ml-auto size-4 shrink-0" />
        </button>

        <UnsupportedNotice v-if="review.unsupported" class="mt-4" :text="review.unsupported" />

        <section aria-labelledby="output-heading" class="mt-6">
          <div class="mb-2 flex items-center gap-2">
            <h3 id="output-heading" class="text-sm font-semibold text-slate-900">Output</h3>
            <span class="text-xs text-slate-500" :aria-label="`${mapped} of ${needed} mapped${leftOut ? `, ${leftOut} optional left out` : ''}`">{{ mapped }}/{{ needed }}</span>
            <!-- The full editor at Structure, beside the output it affects. Focus returns here when it closes. -->
            <button
              type="button"
              data-open-editor
              aria-label="Edit output"
              title="Edit output"
              :class="[iconButton, 'ml-auto border border-slate-200 text-accent-700 hover:border-accent-200 hover:bg-accent-50']"
              @click="emit('focus', 'structure', null)"
            >
              <DesignerIcon name="pencil" class="size-4" />
            </button>
          </div>
          <PropertyRows :draft="draft" :review="review" @open="emit('focus', $event.mode, $event.property)" />
          <p v-if="review.extras.length" class="mt-2 text-xs text-amber-800">
            {{ review.extras.length === 1 ? 'One mapping has' : `${review.extras.length} mappings have` }} no property to fill.
            <button type="button" class="link text-xs" @click="emit('focus', 'structure', null)">Review</button>
          </p>
        </section>

        <PreviewObject class="mt-6" :draft="draft" :target="target" :review="review" :output="output" :example="example" :problems="problems.length" />
      </template>
    </div>

    <div class="border-t border-slate-100 px-5 pt-3 pb-4">
      <ApplyBar :plan="plan" :config="config" :draft="draft" :assessment="assessment" :can-undo="canUndo" @apply="emit('apply')" @discard="emit('discard')" @undo="emit('undo')" />
    </div>
  </div>
</template>
