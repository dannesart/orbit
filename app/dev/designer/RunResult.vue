<script setup lang="ts">
// What one step did, as the list playground's StepResult shows it, except that Definition
// versions are named through `label`, so this Transform's own output versions read by name.
// (A copy, so /dev/features stays exactly as it was.) Labels come from immutable versions, so a
// past run always names the versions that actually produced it, never today's draft.
import type { DefinitionRef } from '#shared/features/definitions'
import { type Step, describeOutcome, outcomeIssues, outcomeLabel } from '../features/experiment'

const props = defineProps<{ step: Step; stale: boolean; passThrough?: boolean; label: (ref: DefinitionRef) => string }>()

const tone = computed(() => {
  if (!props.step) return 'bg-slate-100 text-slate-600'
  return {
    succeeded: 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200',
    failed: 'bg-red-50 text-red-700 ring-1 ring-red-200',
    not_attempted: 'bg-amber-50 text-amber-800 ring-1 ring-amber-200',
  }[props.step.evidence.outcome.kind]
})
const explanation = computed(() => {
  const outcome = props.step?.evidence.outcome
  if (outcome?.kind === 'not_attempted' && outcome.reason === 'contract_mismatch') {
    return `It reads ${props.label(outcome.expected)}, but received ${props.label(outcome.actual)}. Exact versions only, so the Feature didn’t run.`
  }
  return outcome ? describeOutcome(outcome) : ''
})
const json = (value: unknown) => JSON.stringify(value, null, 2)
</script>

<template>
  <div class="mt-3 transition" :class="{ 'opacity-50': stale }">
    <div class="flex flex-wrap items-center gap-2">
      <span class="rounded-full px-2.5 py-0.5 text-xs font-semibold" :class="tone">{{ step ? outcomeLabel(step.evidence.outcome) : 'Not invoked' }}</span>
      <span v-if="stale" class="text-xs text-slate-500">From the last run. Things have changed since.</span>
    </div>
    <template v-if="step">
      <p v-if="explanation" class="mt-2 text-sm text-slate-700">{{ explanation }}</p>
      <ul v-if="outcomeIssues(step.evidence.outcome).length" class="mt-2 list-disc pl-5 text-sm text-red-700">
        <li v-for="issue in outcomeIssues(step.evidence.outcome)" :key="issue">{{ issue }}</li>
      </ul>
      <div v-for="(seen, i) in step.observations" :key="i" class="mt-3">
        <p class="text-xs font-medium text-slate-500">Observed</p>
        <pre class="mt-1 overflow-x-auto rounded-xl bg-slate-900 px-4 py-3 font-mono text-sm text-slate-100">{{ json(seen) }}</pre>
      </div>
      <p v-if="step.output && passThrough" class="mt-3 text-xs font-medium text-slate-500">
        Handed on unchanged, still a Value of <span class="text-slate-800">{{ label(step.output.definition) }}</span>
      </p>
      <div v-else-if="step.output" class="mt-3">
        <p class="text-xs font-medium text-slate-500">Produced: a Value of <span class="text-slate-800">{{ label(step.output.definition) }}</span> (not a Record, nothing saved)</p>
        <pre class="mt-1 overflow-x-auto rounded-xl bg-slate-900 px-4 py-3 font-mono text-sm text-slate-100">{{ json(step.output.data) }}</pre>
      </div>
      <details class="mt-3 text-sm">
        <summary class="text-xs font-medium text-slate-500">Evidence (references and outcome only, no data)</summary>
        <pre class="mt-1 overflow-x-auto rounded-xl bg-slate-50 px-4 py-3 font-mono text-xs text-slate-700 ring-1 ring-slate-200">{{ json(step.evidence) }}</pre>
      </details>
    </template>
    <p v-else class="mt-2 text-sm text-slate-500">The step before it handed nothing on, so this Feature was never invoked and there’s nothing to record.</p>
  </div>
</template>
