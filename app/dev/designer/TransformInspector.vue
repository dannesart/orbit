<script setup lang="ts">
// The Transform in the inspector: enough to understand it and make simple changes. What it reads
// and makes, how each output property gets its value (simple ones chosen right here), the preview,
// the latest run, and Apply. Composing values and changing the structure happen in the focused
// editor, opened with “Edit output” in Output properties (or a property’s Compose).
import type { DefinitionVersion } from '#shared/features/definitions'
import { type Step, definitionLabel } from '../features/experiment'
import ApplyBar from './ApplyBar.vue'
import PreviewObject from './PreviewObject.vue'
import QuickMappings from './QuickMappings.vue'
import RunHistory from './RunHistory.vue'
import type { Configuration, Plan, RunRecord, TransformDraft } from './config'
import type { DraftReview, Example, OutputPreview } from './preview'
import { runState } from './summary'

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
const problems = computed(() => [...props.structure, ...props.review.problems])
const mapped = computed(() => props.review.fields.filter((f) => f.state === 'set').length)
const state = computed(() => runState(props.step))
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <div class="min-h-0 flex-1 overflow-y-auto px-5 pb-4">
      <!-- Latest run: what actually executed, in one row. Its exact versions are in the evidence. -->
      <section aria-labelledby="latest-run-heading" class="flex items-center gap-2 text-sm">
        <h3 id="latest-run-heading" class="text-xs font-medium text-slate-500">Latest run</h3>
        <p class="flex min-w-0 items-center gap-1.5 text-slate-800">
          <span aria-hidden="true" class="w-3.5 text-center text-xs font-semibold" :class="state.tone">{{ state.icon }}</span>
          <span class="truncate"><span class="font-medium">{{ state.label }}</span> · Run {{ runNumber }}<span v-if="stale" class="text-slate-500"> · before your changes</span></span>
        </p>
        <button type="button" class="link ml-auto shrink-0 text-xs" :aria-expanded="details" aria-controls="transform-evidence" @click="details = !details">{{ details ? 'Back' : 'Evidence' }}</button>
      </section>

      <RunHistory v-if="details" id="transform-evidence" class="mt-4" :step="step" :stale="stale" :run-number="runNumber" :runs="runs" :config="config" />
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
          <div class="mb-2 flex items-center gap-2">
            <h3 id="quick-heading" class="text-sm font-semibold text-slate-900">Output properties</h3>
            <span class="text-xs text-slate-500">{{ mapped }} of {{ review.fields.length }} mapped</span>
            <!-- The full editor, for the output as a whole (a property's own mapping: Compose, below).
                 Focus returns here when the editor closes. -->
            <button
              type="button"
              data-open-editor
              title="Change what the output contains and how its values are made"
              class="ml-auto flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium text-accent-700 ring-1 ring-accent-200 transition hover:bg-accent-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
              @click="emit('focus', 'structure', null)"
            >
              <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" class="size-3.5"><path d="M13.6 3.4a1.9 1.9 0 0 1 2.7 2.7L7 15.4l-3.5.9.9-3.5 9.2-9.4Z" /><path d="m12.2 4.8 2.9 2.9" /></svg>
              Edit output
            </button>
          </div>
          <QuickMappings :draft="draft" :review="review" :input="input" :example="example" @update:draft="emit('update:draft', $event)" @edit="emit('focus', 'mapping', $event)" />
          <p v-if="review.extras.length" class="mt-2 text-xs text-amber-800">
            {{ review.extras.length === 1 ? 'One mapping has' : `${review.extras.length} mappings have` }} no property to fill.
            <button type="button" class="link text-xs" @click="emit('focus', 'structure', null)">Review</button>
          </p>
        </section>

        <PreviewObject class="mt-5" :draft="draft" :target="target" :review="review" :output="output" :example="example" :problems="problems.length" />
      </template>
    </div>

    <div class="border-t border-slate-100 px-5 pt-3 pb-4">
      <ApplyBar :plan="plan" :config="config" :draft="draft" :errors="[...structure, ...review.errors]" :missing="review.missing" :can-undo="canUndo" @apply="emit('apply')" @discard="emit('discard')" @undo="emit('undo')" />
    </div>
  </div>
</template>
