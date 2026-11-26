<script setup lang="ts">
// Mapping Studio (Phase 4.5B): where the draft stands, in a word, with Apply and Cancel beside it.
// Invalid, Incompatible, Incomplete, Unchanged or Compatible, as studioStatus derives it from the
// structured problems' categories; what to do is there on demand (Details), each item taking you to its place. Apply is
// available only when the draft is changed and compatible, exactly as everywhere else.
import type { DefinitionRef } from '#shared/features/definitions'
import DesignerIcon from './DesignerIcon.vue'
import { type Configuration, type Plan, type TransformDraft, labelOf } from './config'
import type { StudioItem, StudioState, StudioStatus } from './studio'

const props = defineProps<{ status: StudioStatus; plan: Plan; config: Configuration; draft: TransformDraft; canUndo: boolean }>()
const emit = defineEmits<{ apply: []; cancel: []; undo: []; go: [StudioItem] }>()

const label = (ref: DefinitionRef) => labelOf(props.config, ref)
const STATE: Record<StudioState, { words: string; dot: string }> = {
  invalid: { words: 'Invalid', dot: 'bg-red-500' },
  incompatible: { words: 'Incompatible', dot: 'bg-red-500' },
  incomplete: { words: 'Incomplete', dot: 'bg-amber-500' },
  unchanged: { words: 'Unchanged', dot: 'bg-slate-300' },
  compatible: { words: 'Compatible', dot: 'bg-accent-500' },
}
const count = (n: number, one: string, many: string) => (n === 1 ? `1 ${one}` : `${n} ${many}`)
/** What Apply would make, shortly. */
const creates = computed(() => {
  const { output, mapping } = props.plan
  const made: string[] = []
  if (output.isNew) made.push(`${props.draft.local.name || 'the output'} v${output.ref.version}`)
  if (mapping.isNew) made.push(`${output.isNew ? 'its' : ''} Mapping v${mapping.version}`.trim())
  return made.length ? `Apply creates ${made.join(' and ')}` : `Apply switches to ${output.label} · Mapping v${mapping.version}`
})
const detail = computed(() => {
  const { state, problems, todo } = props.status
  if (state === 'invalid' || state === 'incompatible') return count(problems.length, 'problem to fix', 'problems to fix')
  if (state === 'incomplete') return `${count(todo.length || 1, 'property needs', 'properties need')} a value`
  if (state === 'unchanged') return `${label(props.config.output)} · Mapping v${props.config.mapping.version} applied`
  return creates.value
})
const canApply = computed(() => props.plan.changes && props.status.state === 'compatible')

const open = ref(false)
const items = computed(() => [...props.status.problems, ...props.status.todo])
watch(items, (now) => { if (!now.length) open.value = false })
function go(item: StudioItem) {
  open.value = false
  emit('go', item)
}
</script>

<template>
  <div class="relative" data-studio-status :data-state="status.state" @keydown.escape="open && ($event.stopPropagation(), (open = false))">
    <!-- What's left to do, on demand -->
    <div v-if="open && items.length" id="studio-status-details" class="absolute right-0 bottom-full left-0 mb-3 max-h-[50dvh] overflow-y-auto rounded-2xl border border-slate-200/80 bg-white p-2 shadow-xl shadow-slate-900/10 sm:right-auto sm:w-[28rem]" data-status-details>
      <ul class="flex flex-col">
        <li v-for="(item, i) in items" :key="i">
          <button type="button" class="flex w-full items-baseline gap-2 rounded-xl px-3 py-2 text-left text-sm transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500" data-status-item @click="go(item)">
            <span aria-hidden="true" class="size-1.5 shrink-0 translate-y-[-1px] rounded-full" :class="i < status.problems.length ? 'bg-red-500' : 'bg-amber-500'" />
            <span class="min-w-0 flex-1">
              <span v-if="item.at" class="font-mono font-medium [overflow-wrap:anywhere] text-slate-900">{{ item.at.join(' › ') }}</span>
              <span :class="item.at ? 'text-slate-600' : 'text-slate-800'">{{ item.at ? ' · ' : '' }}{{ item.text }}</span>
            </span>
            <span class="shrink-0 text-xs text-slate-400">{{ item.where === 'general' ? 'General' : 'Edit' }}</span>
          </button>
        </li>
      </ul>
    </div>

    <div class="flex items-center gap-2">
      <div class="flex min-w-0 flex-1 items-center gap-2.5" aria-live="polite">
        <span aria-hidden="true" class="size-2 shrink-0 rounded-full" :class="STATE[status.state].dot" />
        <p class="min-w-0 text-sm">
          <span class="font-semibold text-slate-900" data-status-word>{{ STATE[status.state].words }}</span>
          <span class="text-slate-500 max-sm:sr-only"> · {{ detail }}</span>
        </p>
        <button
          v-if="items.length"
          type="button"
          class="shrink-0 rounded-full px-2.5 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-200 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
          :aria-expanded="open"
          aria-controls="studio-status-details"
          data-status-toggle
          @click="open = !open"
        >
          {{ open ? 'Hide' : 'Details' }}
        </button>
      </div>
      <button type="button" class="grid size-9 shrink-0 place-items-center rounded-xl text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 disabled:opacity-40 disabled:hover:bg-transparent" aria-label="Undo" title="Undo" :disabled="!canUndo" @click="emit('undo')">
        <DesignerIcon name="undo" class="size-4" />
      </button>
      <button type="button" class="shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500" data-cancel @click="emit('cancel')">Cancel</button>
      <button type="button" class="btn-primary w-auto shrink-0 rounded-full px-5 py-1.5 text-sm disabled:cursor-default disabled:opacity-40" :disabled="!canApply" data-apply @click="emit('apply')">Apply</button>
    </div>
  </div>
</template>
