<script setup lang="ts">
// The Transform's panel (Experiment #3), top to bottom:
//   the last run, in one line, with its details a click away (never under the editor);
//   the setup, the only part that scrolls;
//   the preview of the draft and Apply / Discard, always in view.
// The preview is labelled as one and never shows an outcome: only a run has those.
import type { DefinitionVersion } from '#shared/features/definitions'
import type { Mapping } from '#shared/features/mappings'
import { type Step, definitionLabel, outcomeLabel } from '../features/experiment'
import StepResult from '../features/StepResult.vue'
import ShownText from './ShownText.vue'
import TransformEditor from './TransformEditor.vue'
import type { DraftProperty } from './parts'
import type { DraftReview, Example, OutputPreview } from './preview'

const props = defineProps<{
  draft: readonly DraftProperty[]
  review: DraftReview
  output: OutputPreview
  example: Example
  input: DefinitionVersion
  target: DefinitionVersion
  latest: Mapping
  changed: boolean
  canUndo: boolean
  step: Step
  stale: boolean
  runNumber: number
}>()
const emit = defineEmits<{ 'update:draft': [DraftProperty[]]; apply: [anyway: boolean]; discard: []; undo: [] }>()

const details = ref(false)
const sound = computed(() => props.review.problems.length === 0)
const tone = computed(() => {
  const kind = props.step?.evidence.outcome.kind
  return kind === 'succeeded' ? 'bg-emerald-50 text-emerald-800 ring-emerald-200' : kind === 'failed' ? 'bg-red-50 text-red-700 ring-red-200' : kind ? 'bg-amber-50 text-amber-800 ring-amber-200' : 'bg-slate-100 text-slate-600 ring-slate-200'
})
const ranVersion = computed(() => props.step?.evidence.mapping?.version)
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <!-- The last run: one line -->
    <div class="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-slate-200 bg-slate-50 px-5 py-2.5">
      <span class="text-xs font-medium text-slate-500">Last run</span>
      <span class="rounded-full px-2 py-0.5 text-xs font-semibold ring-1" :class="tone">{{ step ? outcomeLabel(step.evidence.outcome) : 'Not invoked' }}</span>
      <span class="min-w-0 text-xs text-slate-500">Run {{ runNumber }}<template v-if="ranVersion"> · Mapping v{{ ranVersion }}</template><template v-if="stale"> · changed since</template></span>
      <button type="button" class="link ml-auto text-sm" :aria-expanded="details" aria-controls="transform-body" @click="details = !details">{{ details ? 'Back to setup' : 'Details' }}</button>
    </div>

    <div id="transform-body" class="min-h-0 flex-1 overflow-y-auto px-5 py-4">
      <section v-if="details" aria-labelledby="transform-run-heading">
        <h3 id="transform-run-heading" class="text-sm font-semibold text-slate-900">What happened in run {{ runNumber }}</h3>
        <StepResult :step="step" :stale="stale" />
      </section>
      <section v-else aria-labelledby="transform-setup-heading">
        <h3 id="transform-setup-heading" class="text-sm font-semibold text-slate-900">Setup</h3>
        <p class="mt-0.5 mb-4 text-xs text-slate-500">
          Makes a {{ definitionLabel(target) }} from a {{ definitionLabel(input) }}. Your changes stay here until you apply them.
        </p>
        <TransformEditor :draft="draft" :review="review" :input="input" :target="target" :example="example" @update:draft="emit('update:draft', $event)" />
      </section>
    </div>

    <!-- The draft's preview, and committing it -->
    <div class="border-t border-slate-200 bg-white px-5 pt-3 pb-4 shadow-[0_-6px_16px_-12px_rgb(15_23_42/0.25)]">
      <div class="flex flex-wrap items-baseline justify-between gap-x-2">
        <p class="text-xs font-semibold tracking-wide text-accent-700 uppercase">Preview · not executed</p>
        <p class="text-xs text-slate-500">From Record A’s data</p>
      </div>

      <div v-if="'problem' in example" class="mt-1.5 text-sm text-amber-800">
        {{ example.problem }}
        <span v-if="example.details.length" class="block text-xs">{{ example.details.join(' ') }}</span>
      </div>
      <dl v-else-if="draft.length" class="mt-1.5 flex flex-col gap-1" aria-live="polite">
        <div v-for="(p, i) in draft" :key="i" class="flex min-w-0 items-center gap-2">
          <dt class="shrink-0 font-mono text-xs text-slate-600">{{ p.name || 'unnamed' }}</dt>
          <dd class="min-w-0">
            <ShownText v-if="'value' in output.values[i]!" :value="(output.values[i] as { value: string }).value" />
            <span v-else-if="'problems' in output.values[i]!" class="text-xs text-red-700">Can’t be made: {{ (output.values[i] as { problems: string[] }).problems[0] }}</span>
          </dd>
        </div>
      </dl>
      <p v-else class="mt-1.5 text-sm text-slate-500">Nothing is set yet, so this would make an empty object.</p>
      <!-- The target's own validation of the previewed object. Its problems are already listed below
           (as things to fix), so here it only speaks when it adds something. -->
      <p v-if="output.fits && !('problem' in example) && (!output.fits.issues.length || sound)" class="mt-1 text-xs" :class="output.fits.issues.length ? 'text-red-700' : 'text-slate-500'">
        {{ output.fits.issues.length ? `${definitionLabel(target)} wouldn’t accept this: ${output.fits.issues.join(' ')}` : `Fits ${definitionLabel(target)}. A preview of this Mapping only: nothing has run.` }}
      </p>

      <div class="mt-2.5 flex flex-wrap items-center justify-end gap-x-2 gap-y-1.5">
        <p class="mr-auto basis-full text-xs sm:basis-auto" :class="changed ? 'font-medium text-amber-800' : 'text-slate-500'" aria-live="polite">
          {{ changed ? `Not applied. Runs still use v${latest.version}.` : `Mapping v${latest.version} is applied.` }}
        </p>
        <button type="button" class="link text-sm" :disabled="!canUndo" @click="emit('undo')">Undo</button>
        <button type="button" class="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 disabled:opacity-40 disabled:hover:bg-transparent" :disabled="!changed" @click="emit('discard')">Discard</button>
        <button type="button" class="btn-primary w-auto rounded-lg px-4 py-1.5 text-sm disabled:cursor-default disabled:opacity-40" :disabled="!changed || !sound" @click="emit('apply', false)">Apply as v{{ latest.version + 1 }}</button>
      </div>
      <p v-if="changed && !sound" class="mt-2 text-xs text-slate-600">
        <span class="text-red-700">{{ review.problems.length === 1 ? 'One thing' : `${review.problems.length} things` }} to fix before applying: {{ review.problems[0] }}</span>
        <button type="button" class="link ml-1 text-xs" @click="emit('apply', true)">Apply anyway (playground only: to see the boundary stop it)</button>
      </p>
    </div>
  </div>
</template>
