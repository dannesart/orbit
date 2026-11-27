<!--
  The Transform's latest run, as a square status button in the inspector's header. Its popover says
  what actually executed: the outcome, the run number and the exact versions it used, whether
  anything changed since (or the draft differs from what runs use), and opens the evidence. Taken
  from the run's record only, never from the draft. Escape or a click outside closes it.
-->
<script setup lang="ts">
import type { DefinitionRef } from '#shared/features/definitions'
import type { Step } from '../features/experiment'
import DesignerIcon from './DesignerIcon.vue'
import type { RunRecord } from './config'
import { runState } from './summary'

const props = defineProps<{
  step: Step
  runNumber: number
  run: RunRecord | undefined
  /** The setup or the applied versions changed since this run. */
  stale: boolean
  /** The draft differs from the applied versions runs use. */
  unapplied: boolean
  label: (ref: DefinitionRef) => string
}>()
const emit = defineEmits<{ evidence: [] }>()

const state = computed(() => runState(props.step))
const open = ref(false)
const button = ref<HTMLButtonElement>()
const root = ref<HTMLElement>()
function close(returnFocus: boolean) {
  open.value = false
  if (returnFocus) button.value?.focus()
}
function onDocument(event: MouseEvent) {
  if (open.value && !root.value?.contains(event.target as Node)) close(false)
}
onMounted(() => document.addEventListener('click', onDocument))
onBeforeUnmount(() => document.removeEventListener('click', onDocument))
function evidence() {
  close(false)
  emit('evidence')
}
</script>

<template>
  <div ref="root" class="relative" @keydown.escape.stop="close(true)">
    <button
      ref="button"
      type="button"
      data-run-status
      class="grid size-9 shrink-0 place-items-center rounded-xl border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
      :class="state.tone"
      :aria-label="`Latest run: ${state.label}, run ${runNumber}`"
      :title="`Latest run: ${state.label}`"
      aria-haspopup="dialog"
      :aria-expanded="open"
      aria-controls="run-status"
      @click="open = !open"
    >
      <DesignerIcon :name="state.icon" class="size-4" />
    </button>
    <div v-if="open" id="run-status" role="dialog" aria-label="Latest run" class="absolute top-full right-0 z-40 mt-2 w-64 animate-rise rounded-2xl border border-slate-200/80 bg-white p-4 text-sm shadow-lg shadow-slate-900/10">
      <p class="font-medium text-slate-900">{{ state.label }} · Run {{ runNumber }}</p>
      <p v-if="run?.feature || run?.mapping" class="mt-1 text-xs text-slate-600" data-run-versions :title="[run.feature && `${run.feature.id}@${run.feature.version}`, run.mapping && `${run.mapping.id}@${run.mapping.version}`].filter(Boolean).join(' · ')">
        {{ [run.feature && `Feature v${run.feature.version}`, run.mapping && `Mapping v${run.mapping.version}`].filter(Boolean).join(' · ') }}
      </p>
      <p v-if="run?.output" class="mt-0.5 text-xs text-slate-600">Made {{ label(run.output) }}</p>
      <p v-if="stale" class="mt-2 text-xs text-amber-800">Things changed since this run.</p>
      <p v-else-if="unapplied" class="mt-2 text-xs text-slate-500">Your draft isn’t applied. Runs use the applied versions.</p>
      <button type="button" class="link mt-3 text-xs" @click="evidence">Evidence</button>
    </div>
  </div>
</template>
