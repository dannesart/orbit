<script setup lang="ts">
// The whole object the draft would make from Record A's data. A preview, never a run: no
// outcome, no evidence. Unmapped properties and mappings that wouldn't fit stay visible.
import type { DefinitionVersion } from '#shared/features/definitions'
import ShownText from './ShownText.vue'
import type { TransformDraft } from './config'
import type { DraftReview, Example, OutputPreview } from './preview'

const props = defineProps<{
  draft: TransformDraft
  target: { definition: DefinitionVersion; label: string }
  review: DraftReview
  output: OutputPreview
  example: Example
  problems: number
}>()

const rows = computed(() => {
  const names = props.draft.properties.map((p) => p.name)
  const required = props.target.definition.fields.map((f) => {
    const index = names.indexOf(f.name)
    return { name: f.name, value: index >= 0 ? props.output.values[index]! : null, extra: false }
  })
  const extras = props.review.extras.map((x) => ({ name: props.draft.properties[x.index]!.name || 'unnamed', value: props.output.values[x.index]!, extra: true }))
  return [...required, ...extras]
})
</script>

<template>
  <div>
    <div class="flex items-baseline gap-2">
      <p class="mr-auto text-xs font-semibold tracking-wide text-accent-700 uppercase">Preview · not executed</p>
      <p class="text-xs text-slate-500">From Record A’s data</p>
    </div>
    <p v-if="'problem' in example" class="mt-1.5 text-sm text-amber-800">{{ example.problem }} <span v-if="example.details.length" class="block text-xs">{{ example.details.join(' ') }}</span></p>
    <div v-else class="mt-1.5 rounded-2xl bg-slate-50 px-3 py-2 font-mono text-xs ring-1 ring-slate-200/80" aria-live="polite">
      <span class="text-slate-400">{</span>
      <div v-for="r in rows" :key="r.name" class="flex min-w-0 items-center gap-2 pl-3">
        <span class="shrink-0" :class="r.extra ? 'text-amber-800 line-through' : 'text-slate-600'">{{ r.name }}:</span>
        <ShownText v-if="r.value && 'value' in r.value" :value="r.value.value" />
        <span v-else-if="r.value && 'problems' in r.value" class="font-sans text-red-700">can’t be made: {{ r.value.problems[0] }}</span>
        <span v-else class="font-sans text-amber-700">not mapped</span>
        <span v-if="r.extra" class="font-sans text-amber-800">not part of the output</span>
      </div>
      <span class="text-slate-400">}</span>
    </div>
    <p v-if="output.fits && !('problem' in example) && !problems" class="mt-1 text-xs text-slate-500">
      {{ output.fits.issues.length ? `${target.label} wouldn’t accept this: ${output.fits.issues.join(' ')}` : `Fits ${target.label}. A preview only: nothing has run.` }}
    </p>
  </div>
</template>
