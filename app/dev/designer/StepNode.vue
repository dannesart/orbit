<script setup lang="ts">
// One step on the canvas: its place on the path, what it does in plain words, and how the shown
// run went for it. Its dots are where connections start and end: small, shown when they're
// relevant (hovering, selected, connecting), and never where nothing can connect (into Record A).
// A connection starts only from a step's right-hand dot, and only from one that doesn't hand on yet:
// a step that already does offers its arrow's end to move instead (one path only). The left-hand
// dot is only ever where a connection ends, so it can't be grabbed, and shows only while connecting.
import { Handle, Position } from '@xyflow/vue'

export interface StepView {
  /** "Start", the step's number on the path, or "–" when it isn't on the path. */
  badge: string
  kind: string
  title: string
  lines: string[]
  more: number
  /** A configuration worth noticing, e.g. a misbehaving Console or an edited Mapping. */
  note: string | null
  /** What it receives that its contract can't accept, in words. */
  problem: string | null
  /** The shown run, for this step: null for Record A, which never runs. */
  outcome: { label: string; tone: 'ok' | 'bad' | 'warn' | 'none' } | null
  stale: boolean
}

defineProps<{ view: StepView; selected: boolean; start: boolean; handsOn: boolean }>()

const tones = {
  ok: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  bad: 'bg-red-50 text-red-700 ring-red-200',
  warn: 'bg-amber-50 text-amber-800 ring-amber-200',
  none: 'bg-slate-100 text-slate-600 ring-slate-200',
}
</script>

<template>
  <div
    class="rounded-2xl border bg-white p-4 text-left shadow-sm transition"
    :class="[
      view.title === 'Transform' ? 'w-72' : 'w-60',
      selected ? 'border-accent-400 shadow-lg shadow-accent-500/10 ring-4 ring-accent-100' : 'border-slate-200/80 shadow-slate-900/[0.04] hover:border-slate-300 hover:shadow-md',
    ]"
  >
    <Handle v-if="!start" type="target" :position="Position.Left" :is-connectable-start="false" />
    <div class="flex items-center gap-2">
      <span
        class="flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-xs font-semibold"
        :class="view.badge === '–' ? 'border border-dashed border-slate-300 bg-white text-slate-400' : selected ? 'bg-accent-600 text-white' : 'bg-slate-800 text-white'"
      >{{ view.badge }}</span>
      <span class="text-xs font-medium text-slate-500">{{ view.kind }}</span>
    </div>
    <p class="mt-2 text-base font-semibold text-slate-900">{{ view.title }}</p>
    <ul class="mt-1 flex flex-col gap-0.5 text-sm text-slate-600">
      <li v-for="line in view.lines" :key="line" class="break-words">{{ line }}</li>
      <li v-if="view.more" class="text-slate-500">and {{ view.more }} more</li>
    </ul>
    <p v-if="view.note" class="mt-2 text-xs font-medium text-amber-700">{{ view.note }}</p>
    <p v-if="view.problem" class="mt-2 text-xs font-medium text-red-700">{{ view.problem }}</p>
    <div v-if="view.outcome" class="mt-3 flex items-center gap-2" :class="{ 'opacity-60': view.stale }">
      <span class="rounded-full px-2 py-0.5 text-xs font-semibold ring-1" :class="tones[view.outcome.tone]">{{ view.outcome.label }}</span>
      <span v-if="view.stale" class="text-xs text-slate-500">earlier run</span>
    </div>
    <Handle type="source" :position="Position.Right" :is-connectable-start="!handsOn" />
  </div>
</template>
