<script setup lang="ts">
// The Transform in the inspector: what the step does, how it's configured, whether it's ready, and
// what actually ran. Nothing is edited or applied here: Mapping Studio is the one place to edit,
// undo, cancel and Apply. Its header carries the step's identity (the pinned Feature version and the
// applied Mapping version) and its three actions: edit in Mapping Studio, the latest run's status and
// evidence, and Close. Below: what it reads and makes, and its output, each property once with its
// example value (each row opens Mapping Studio at that property). Unapplied changes are said at the
// foot, with the way to Mapping Studio, where they're reviewed and applied.
import type { DefinitionRef, DefinitionVersion } from '#shared/features/definitions'
import type { Step } from '../features/experiment'
import DesignerIcon from './DesignerIcon.vue'
import PropertyRows from './PropertyRows.vue'
import RunHistory from './RunHistory.vue'
import RunStatus from './RunStatus.vue'
import UnsupportedNotice from './UnsupportedNotice.vue'
import { type ApplyAssessment, type Configuration, type Plan, type RunRecord, type TransformDraft, labelOf } from './config'
import type { DraftReview, Example, OutputPreview } from './preview'
import { type StudioOpening, studioStatus, unappliedWords } from './studio'

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
  /** Whether the draft may be applied, and why not: the authoritative assessment. */
  assessment: ApplyAssessment
  step: Step
  stale: boolean
  runNumber: number
  runs: readonly RunRecord[]
  /** The exact Feature version this step pins, in words ("Feature v3"), and as its key. */
  feature: string
  featureKey: string
}>()
const emit = defineEmits<{
  close: []
  /** Mapping Studio, where everything about the Mapping is edited: at a segment or property, or as it opens. */
  studio: [at: StudioOpening | null]
}>()

const details = ref(false)
const label = (ref: DefinitionRef) => labelOf(props.config, ref)
const problems = computed(() => [...props.structure, ...props.review.problems])
/** Where unapplied changes stand, from the authoritative assessment (the Studio's own status). */
const unapplied = computed(() => unappliedWords(studioStatus(props.assessment), props.assessment.problems.some((p) => p.kind === 'unsupported_contract')))
const back = ref<HTMLButtonElement>()
function showEvidence() {
  details.value = true
  nextTick(() => back.value?.focus())
}
const iconButton = 'grid size-9 shrink-0 place-items-center rounded-xl transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500'
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <!-- Header: which step, which exact versions, and its actions -->
    <div class="flex items-center gap-2 px-5 pt-3 pb-4 lg:pt-4">
      <span class="mr-1 flex h-7 min-w-7 items-center justify-center rounded-full bg-accent-600 px-2 text-xs font-semibold text-white" aria-hidden="true">{{ badge }}</span>
      <div class="min-w-0 flex-1">
        <h2 class="text-base leading-tight font-semibold text-slate-900">Transform</h2>
        <p class="truncate text-xs text-slate-500" data-step-versions :title="`${featureKey} · Mapping v${config.mapping.version}`">{{ feature }} · Mapping v{{ config.mapping.version }}</p>
      </div>
      <button
        type="button"
        data-edit-mapping
        :class="[iconButton, 'text-accent-700 hover:bg-accent-50']"
        aria-label="Edit in Mapping Studio"
        title="Edit in Mapping Studio"
        @click="emit('studio', null)"
      >
        <DesignerIcon name="pencil" class="size-4" />
      </button>
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
        <p class="flex flex-wrap items-center gap-x-2 text-sm text-slate-700" data-contract-summary>
          <span>{{ assessment.from.label }}</span>
          <span aria-hidden="true" class="text-slate-400">→</span>
          <span class="sr-only">makes</span>
          <span class="font-medium text-slate-900">{{ target.label }}</span>
        </p>

        <UnsupportedNotice v-if="review.unsupported" class="mt-4" :text="review.unsupported" />

        <PropertyRows class="mt-5" :draft="draft" :review="review" :output="output" :example="example" :target="target" :problems="problems.length" @open="emit('studio', $event)" />
        <p v-if="review.extras.length" class="mt-2 text-xs text-amber-800">
          {{ review.extras.length === 1 ? 'One mapping has' : `${review.extras.length} mappings have` }} no property to fill.
          <button type="button" class="link text-xs" data-review-extras @click="emit('studio', { segment: 'general' })">Review</button>
        </p>
      </template>
    </div>

    <!-- Unapplied changes: said, with the way to where they're reviewed and applied -->
    <div v-if="plan.changes" class="flex items-center gap-2.5 border-t border-slate-100 px-5 py-3" data-unapplied :data-state="assessment.state">
      <span class="size-2 shrink-0 rounded-full" :class="unapplied.tone === 'ready' ? 'bg-accent-500' : unapplied.tone === 'todo' ? 'bg-amber-500' : 'bg-red-500'" aria-hidden="true" />
      <p class="min-w-0 flex-1 text-xs" aria-live="polite">
        <span class="font-medium text-slate-900">Unapplied changes</span>
        <span class="text-slate-500"> · {{ unapplied.words }}</span>
      </p>
      <button type="button" class="link shrink-0 text-xs font-medium" data-review-changes @click="emit('studio', null)">Review in Mapping Studio</button>
    </div>
  </div>
</template>
