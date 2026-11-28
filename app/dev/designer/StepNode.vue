<script setup lang="ts">
// One step on the canvas, compact whatever it holds: the journey at a glance, the details in the
// inspector. Every card is the same width and, normally, about the same height: its place on the
// path, an icon and its title, what information it holds, observes, or receives and makes (by exact
// Definition version, wrapped rather than cut short), one short detail (a size or completeness), and
// technical identity (exact Feature and Mapping versions) quietly underneath. Two states, kept apart:
// the configuration as it is now (a problem, unapplied changes, something to notice) and the outcome
// of the shown run, labelled as a run's, so an earlier success never reads as "this is fine now". A
// problem is always shown whole, even when it makes the card taller.
//
// Its dots are where connections start and end: small, shown when they're relevant (hovering,
// selected, connecting), and never where nothing can connect (into the Record). A connection starts
// only from a step's right-hand dot, and only from one that doesn't hand on yet: a step that already
// does offers its arrow's end to move instead (one path only). The left-hand dot is only ever where
// a connection ends, so it can't be grabbed, and shows only while connecting.
import { Handle, Position } from '@xyflow/vue'
import DesignerIcon from './DesignerIcon.vue'

export interface StepView {
  /** "Start", the step's number on the path, or "–" when it isn't on the path. */
  badge: string
  icon: 'record' | 'eye' | 'transform'
  title: string
  /** The information, briefly: what it holds or observes (`text`), or what it receives and makes. */
  flow: { readonly text?: string; readonly from?: string; readonly to?: string }
  /** One short detail: "39 properties", "12 of 12 properties mapped". */
  detail: string | null
  /** Technical identity, secondary: "Record · in memory", "Feature v2", "Feature v3 (provisional) · Mapping v1". */
  meta: string
  /** The exact identities, on hover: "orbit.transform@3 · Mapping v1". */
  metaTitle?: string
  /** The configuration as it is now, apart from any run: a problem, something unfinished, or worth noticing. */
  config: { readonly label: string; readonly tone: 'problem' | 'todo' | 'info' } | null
  /** What it receives that its contract can't accept, in words: always shown whole. */
  problem: string | null
  /** The shown run, for this step: null for the Record, which never runs. */
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
const configTones = { problem: 'text-red-700', todo: 'text-amber-700', info: 'text-amber-700' }
</script>

<template>
  <div
    class="w-64 rounded-2xl border bg-white p-4 text-left shadow-sm transition"
    :class="selected ? 'border-accent-400 shadow-lg shadow-accent-500/10 ring-4 ring-accent-100' : 'border-slate-200/80 shadow-slate-900/[0.04] hover:border-slate-300 hover:shadow-md'"
    data-step-card
  >
    <Handle v-if="!start" type="target" :position="Position.Left" :is-connectable-start="false" />
    <!-- Place, kind and title -->
    <div class="flex items-center gap-2">
      <span
        class="flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full px-1.5 text-xs font-semibold"
        :class="view.badge === '–' ? 'border border-dashed border-slate-300 bg-white text-slate-400' : selected ? 'bg-accent-600 text-white' : 'bg-slate-800 text-white'"
      >{{ view.badge }}</span>
      <span class="grid size-6 shrink-0 place-items-center rounded-md bg-accent-50 text-accent-600" aria-hidden="true">
        <DesignerIcon :name="view.icon" class="size-3.5" />
      </span>
      <p class="min-w-0 text-base leading-tight font-semibold [overflow-wrap:anywhere] text-slate-900" data-step-title>{{ view.title }}</p>
    </div>
    <!-- The information: what it holds or observes, or what it receives and makes -->
    <p v-if="view.flow.text" class="mt-2.5 text-sm font-medium [overflow-wrap:anywhere] text-slate-700" data-step-flow>{{ view.flow.text }}</p>
    <p v-else class="mt-2.5 flex flex-wrap items-center gap-x-1.5 text-sm text-slate-700" data-step-flow>
      <span class="[overflow-wrap:anywhere]">{{ view.flow.from }}</span>
      <span aria-hidden="true" class="text-slate-400">→</span>
      <span class="sr-only">makes</span>
      <span class="font-medium [overflow-wrap:anywhere] text-slate-900">{{ view.flow.to }}</span>
    </p>
    <p v-if="view.detail" class="mt-0.5 text-xs text-slate-500" data-step-detail>{{ view.detail }}</p>
    <!-- The configuration now, apart from any run; a problem in full -->
    <p v-if="view.config" class="mt-2 flex items-start gap-1.5 text-xs font-medium" :class="configTones[view.config.tone]" data-step-config>
      <DesignerIcon :name="view.config.tone === 'problem' ? 'error' : 'minus'" class="mt-px size-3.5 shrink-0" />
      <span>{{ view.config.label }}</span>
    </p>
    <p v-if="view.problem" class="mt-2 text-xs font-medium text-red-700" data-step-problem>{{ view.problem }}</p>
    <!-- Technical identity, quietly; then the shown run, labelled as a run's -->
    <div class="mt-3 flex items-center gap-2 border-t border-slate-100 pt-2.5">
      <span class="min-w-0 flex-1 text-[11px] leading-tight [overflow-wrap:anywhere] text-slate-400" :title="view.metaTitle" data-step-meta>{{ view.meta }}</span>
      <span v-if="view.outcome" class="flex shrink-0 items-center gap-1" :class="{ 'opacity-60': view.stale }" data-step-outcome>
        <span class="sr-only">{{ view.stale ? 'Earlier run:' : 'Last run:' }}</span>
        <span class="rounded-full px-2 py-0.5 text-xs font-semibold ring-1" :class="tones[view.outcome.tone]" :title="view.stale ? 'An earlier run, before the latest changes' : 'The latest run'">{{ view.outcome.label }}</span>
        <span v-if="view.stale" class="text-[11px] text-slate-500">earlier run</span>
      </span>
    </div>
    <Handle type="source" :position="Position.Right" :is-connectable-start="!handsOn" />
  </div>
</template>
