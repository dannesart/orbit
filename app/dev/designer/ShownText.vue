<script setup lang="ts">
// A value (from the example, or as a step observed it), with the whitespace that matters drawn as
// dots, and said in words for screen readers. Shown exactly: nothing is trimmed or reformatted.
import type { Scalar } from '#shared/features/definitions'
import { visibleSegments, whitespaceNote } from './preview'

const props = defineProps<{ value: Scalar; struck?: boolean }>()
const segments = computed(() => (typeof props.value === 'string' ? visibleSegments(props.value) : [{ text: String(props.value), mark: false }]))
const note = computed(() => (segments.value.some((s) => s.mark) ? whitespaceNote(String(props.value)) : ''))
</script>

<template>
  <span
    class="inline-flex max-w-full min-w-0 items-center rounded-md px-1.5 py-0.5 font-mono text-sm ring-1"
    :class="struck ? 'bg-white text-slate-400 line-through ring-slate-200' : 'bg-slate-100 text-slate-900 ring-slate-200'"
  >
    <span v-if="value === ''" class="font-sans text-xs text-slate-500 italic">empty</span>
    <span v-else aria-hidden="true" class="truncate whitespace-pre"><template v-for="(s, i) in segments" :key="i"><span v-if="s.mark" class="text-accent-500">{{ s.text }}</span><template v-else>{{ s.text }}</template></template></span>
    <span v-if="value !== ''" class="sr-only">{{ value }}{{ note ? ` (${note})` : '' }}</span>
  </span>
</template>
