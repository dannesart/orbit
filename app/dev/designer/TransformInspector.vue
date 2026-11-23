<script setup lang="ts">
// The Transform in the inspector: enough to understand it and make simple changes. What it reads
// and makes, how each output property gets its value (simple ones chosen right here), the preview,
// the last run, and Apply. Composing values and changing the structure happen in the focused
// editor, which this opens.
import type { DefinitionRef, DefinitionVersion } from '#shared/features/definitions'
import { type Step, definitionLabel, outcomeLabel } from '../features/experiment'
import ApplyBar from './ApplyBar.vue'
import PreviewObject from './PreviewObject.vue'
import QuickMappings from './QuickMappings.vue'
import RunHistory from './RunHistory.vue'
import { type Configuration, type Plan, type RunRecord, type TransformDraft, labelOf } from './config'
import type { DraftReview, Example, OutputPreview } from './preview'

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
const emit = defineEmits<{
  'update:draft': [TransformDraft]
  apply: []
  discard: []
  undo: []
  focus: [mode: 'mapping' | 'structure', property: string | null]
}>()

const details = ref(false)
const label = (ref: DefinitionRef) => labelOf(props.config, ref)
const problems = computed(() => [...props.structure, ...props.review.problems])
const mapped = computed(() => props.review.fields.filter((f) => f.state === 'set').length)
const lastRun = computed(() => props.runs.at(-1))
const tone = computed(() => {
  const kind = props.step?.evidence.outcome.kind
  return kind === 'succeeded' ? 'bg-emerald-50 text-emerald-800 ring-emerald-200' : kind === 'failed' ? 'bg-red-50 text-red-700 ring-red-200' : kind ? 'bg-amber-50 text-amber-800 ring-amber-200' : 'bg-slate-100 text-slate-600 ring-slate-200'
})
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <div class="min-h-0 flex-1 overflow-y-auto px-5 pb-4">
      <!-- The last run, in one line -->
      <div class="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-2xl bg-slate-50 px-3 py-2 ring-1 ring-slate-200/70">
        <span class="rounded-full px-2 py-0.5 text-xs font-semibold ring-1" :class="tone">{{ step ? outcomeLabel(step.evidence.outcome) : 'Not invoked' }}</span>
        <span class="min-w-0 text-xs text-slate-500">
          Run {{ runNumber }}<template v-if="lastRun?.output"> · {{ label(lastRun.output) }}</template><template v-if="lastRun?.mapping"> · Mapping v{{ lastRun.mapping.version }}</template><template v-if="stale"> · changed since</template>
        </span>
        <button type="button" class="link ml-auto text-xs" :aria-expanded="details" @click="details = !details">{{ details ? 'Back' : 'Evidence' }}</button>
      </div>

      <RunHistory v-if="details" class="mt-4" :step="step" :stale="stale" :run-number="runNumber" :runs="runs" :config="config" />
      <template v-else>
        <!-- Contracts -->
        <section aria-label="What it reads and makes" class="mt-4 flex flex-wrap items-center gap-2 text-sm">
          <span class="text-xs text-slate-500">Reads</span>
          <span class="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-slate-700 ring-1 ring-slate-200">{{ definitionLabel(input) }}</span>
          <span aria-hidden="true" class="text-slate-400">→</span>
          <span class="text-xs text-slate-500">makes</span>
          <button
            type="button"
            class="rounded-full bg-accent-50 px-2.5 py-1 text-xs font-medium text-accent-800 ring-1 ring-accent-200 transition hover:bg-accent-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
            :aria-label="`Makes ${target.label}. Change what it creates`"
            @click="emit('focus', 'structure', null)"
          >
            {{ target.label }}
          </button>
        </section>

        <!-- Output properties: simple mappings right here -->
        <section aria-labelledby="quick-heading" class="mt-5">
          <div class="mb-2 flex items-baseline gap-2">
            <h3 id="quick-heading" class="mr-auto text-sm font-semibold text-slate-900">Output properties</h3>
            <span class="text-xs text-slate-500">{{ mapped }} of {{ review.fields.length }} mapped</span>
          </div>
          <QuickMappings :draft="draft" :review="review" :input="input" :example="example" @update:draft="emit('update:draft', $event)" @edit="emit('focus', 'mapping', $event)" />
          <p v-if="review.extras.length" class="mt-2 text-xs text-amber-800">
            {{ review.extras.length === 1 ? 'One mapping has' : `${review.extras.length} mappings have` }} no property to fill.
            <button type="button" class="link text-xs" @click="emit('focus', 'structure', null)">Review</button>
          </p>
          <button
            type="button"
            data-open-editor
            class="mt-3 flex w-full items-center justify-between gap-2 rounded-2xl bg-white px-4 py-2.5 text-left text-sm font-medium text-slate-800 ring-1 ring-slate-200 transition hover:bg-accent-50 hover:text-accent-800 hover:ring-accent-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
            @click="emit('focus', 'mapping', null)"
          >
            <span>Open the editor<span class="block text-xs font-normal text-slate-500">Compose values, or change what the output contains</span></span>
            <span aria-hidden="true" class="text-accent-600">↗</span>
          </button>
        </section>

        <PreviewObject class="mt-5" :draft="draft" :target="target" :review="review" :output="output" :example="example" :problems="problems.length" />
      </template>
    </div>

    <div class="border-t border-slate-100 px-5 pt-3 pb-4">
      <ApplyBar :plan="plan" :config="config" :draft="draft" :errors="[...structure, ...review.errors]" :missing="review.missing" :can-undo="canUndo" @apply="emit('apply')" @discard="emit('discard')" @undo="emit('undo')" />
    </div>
  </div>
</template>
