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
    return { name: f.name, value: index >= 0 ? props.output.values[index]! : null, optional: f.optional === true, extra: false }
  })
  const extras = props.review.extras.map((x) => ({ name: props.draft.properties[x.index]!.name || 'unnamed', value: props.output.values[x.index]!, optional: false, extra: true }))
  return [...required, ...extras]
})
const about = ref(false)
/** Whether the previewed object fits the target: only known when every value could be made. */
const fit = computed(() => (!props.output.fits || 'problem' in props.example || props.problems ? null : props.output.fits.issues.length === 0))
</script>

<template>
  <div>
    <div class="flex items-center gap-2">
      <h3 class="mr-auto text-sm font-semibold text-slate-900">Preview</h3>
      <!-- Where it comes from and whether it fits, on demand -->
      <button type="button" class="rounded-md px-1 text-xs text-slate-500 transition hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500" :aria-expanded="about" aria-controls="preview-about" @click="about = !about">Not executed</button>
    </div>
    <p v-if="about" id="preview-about" class="mt-1 text-xs text-slate-500">
      This draft, with Record A’s data. Nothing has run.<template v-if="fit === true"> Fits {{ target.label }}.</template>
    </p>
    <p v-if="'problem' in example" class="mt-1.5 text-sm text-amber-800">{{ example.problem }} <span v-if="example.details.length" class="block text-xs">{{ example.details.join(' ') }}</span></p>
    <div v-else class="mt-2 rounded-xl bg-slate-50 px-3 py-2 font-mono text-xs" aria-live="polite">
      <span class="text-slate-400">{</span>
      <div v-for="r in rows" :key="r.name" class="flex min-w-0 items-center gap-2 pl-3">
        <span class="shrink-0" :class="r.extra ? 'text-amber-800 line-through' : 'text-slate-600'">{{ r.name }}:</span>
        <ShownText v-if="r.value && 'value' in r.value" :value="r.value.value" />
        <span v-else-if="r.value && 'problems' in r.value" class="font-sans text-red-700">can’t be made: {{ r.value.problems[0] }}</span>
        <span v-else-if="r.value && 'absent' in r.value" class="font-sans text-slate-500">left out: the example has no {{ r.value.absent.join(', ') }}</span>
        <span v-else-if="!r.value && r.optional" class="font-sans text-slate-500">left out (optional)</span>
        <span v-else class="font-sans text-amber-700">not mapped</span>
        <span v-if="r.extra" class="font-sans text-amber-800">not part of the output</span>
      </div>
      <span class="text-slate-400">}</span>
    </div>
    <!-- An actual mismatch stays in view; a good fit is said only on demand (above). -->
    <p v-if="fit === false" class="mt-1.5 text-xs text-red-700">{{ target.label }} wouldn’t accept this: {{ output.fits!.issues.join(' ') }}</p>
  </div>
</template>
