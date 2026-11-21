<script setup lang="ts">
// One step on the canvas: where it sits in the order, what it does in plain words, and how the
// shown run went for it. Handles exist only so the fixed arrows have somewhere to attach; they
// can't be grabbed (nothing here is connectable) and are hidden by the page's styles.
import { Handle, Position } from '@xyflow/vue'

export interface StepView {
  badge: string
  kind: string
  title: string
  lines: string[]
  more: number
  /** A configuration worth noticing, e.g. a misbehaving Console or an edited Mapping. */
  note: string | null
  /** The shown run, for this step: null for Record A, which never runs. */
  outcome: { label: string; tone: 'ok' | 'bad' | 'warn' | 'none' } | null
  stale: boolean
}

defineProps<{ view: StepView; selected: boolean; first: boolean; last: boolean }>()

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
      selected ? 'border-accent-500 shadow-md ring-4 ring-accent-100' : 'border-slate-200 hover:border-slate-300 hover:shadow-md',
    ]"
  >
    <Handle v-if="!first" type="target" :position="Position.Left" :is-connectable="false" />
    <div class="flex items-center gap-2">
      <span
        class="flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-xs font-semibold"
        :class="selected ? 'bg-accent-600 text-white' : 'bg-slate-900 text-white'"
      >{{ view.badge }}</span>
      <span class="text-xs font-medium text-slate-500">{{ view.kind }}</span>
    </div>
    <p class="mt-2 text-base font-semibold text-slate-900">{{ view.title }}</p>
    <ul class="mt-1 flex flex-col gap-0.5 text-sm text-slate-600">
      <li v-for="line in view.lines" :key="line" class="break-words">{{ line }}</li>
      <li v-if="view.more" class="text-slate-500">and {{ view.more }} more</li>
    </ul>
    <p v-if="view.note" class="mt-2 text-xs font-medium text-amber-700">{{ view.note }}</p>
    <div v-if="view.outcome" class="mt-3 flex items-center gap-2" :class="{ 'opacity-60': view.stale }">
      <span class="rounded-full px-2 py-0.5 text-xs font-semibold ring-1" :class="tones[view.outcome.tone]">{{ view.outcome.label }}</span>
      <span v-if="view.stale" class="text-xs text-slate-500">earlier run</span>
    </div>
    <Handle v-if="!last" type="source" :position="Position.Right" :is-connectable="false" />
  </div>
</template>
