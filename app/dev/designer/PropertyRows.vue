<script setup lang="ts">
// The output's properties in the inspector, one row each and all alike: state, name, type, and
// what makes the value below. The whole row opens the editor at that property (rows.ts); nothing
// is edited here, and the values themselves are in the Preview.
import DesignerIcon from './DesignerIcon.vue'
import type { TransformDraft } from './config'
import type { DraftReview } from './preview'
import { type PropertyRow, propertyRows } from './rows'

const props = defineProps<{ draft: TransformDraft; review: DraftReview }>()
const emit = defineEmits<{ open: [PropertyRow['opens']] }>()

const rows = computed(() => propertyRows(props.draft, props.review))
const icon = {
  not_set: { mark: '○', tone: 'text-amber-600' },
  left_out: { mark: '–', tone: 'text-slate-400' },
  problem: { mark: '!', tone: 'text-red-600' },
  set: { mark: '✓', tone: 'text-accent-600' },
}
</script>

<template>
  <ul class="-mx-2 flex flex-col divide-y divide-slate-100">
    <li v-for="r in rows" :key="r.name">
      <button
        type="button"
        :data-property-row="r.name"
        class="flex w-full items-center gap-2 rounded-xl px-2 py-3 text-left transition hover:bg-accent-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-inset"
        :aria-label="r.label"
        @click="emit('open', r.opens)"
      >
        <span class="min-w-0 flex-1">
          <span class="flex items-center gap-2">
            <span aria-hidden="true" class="w-3 text-center text-xs font-semibold" :class="icon[r.state].tone">{{ icon[r.state].mark }}</span>
            <span class="truncate font-mono text-sm font-semibold text-slate-900">{{ r.name || '(no name)' }}</span>
            <span class="text-xs text-slate-400">{{ r.type }}</span>
          </span>
          <span class="mt-1.5 flex items-center gap-2 pl-5 text-sm" :class="r.state === 'not_set' ? 'text-amber-700' : 'text-slate-700'">
            <span aria-hidden="true" class="text-slate-400">←</span>
            <span class="min-w-0 truncate">{{ r.summary }}</span>
          </span>
          <span v-if="r.problem" class="mt-1 block pl-5 text-xs text-red-700">{{ r.problem }}</span>
        </span>
        <DesignerIcon name="chevron" class="size-4 shrink-0 text-slate-400" />
      </button>
    </li>
    <li v-if="!rows.length" class="px-2 py-3 text-sm text-slate-500">No properties yet. Add some in Structure.</li>
  </ul>
</template>
