<script setup lang="ts">
// The whole object the draft would make from Record A's data. A preview, never a run: no
// outcome, no evidence. Unmapped properties and mappings that wouldn't fit stay visible.
import type { DefinitionRef, DefinitionVersion, Field } from '#shared/features/definitions'
import ObservedTree from './ObservedTree.vue'
import ShownText from './ShownText.vue'
import { FLAT, READING } from './reading'
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
    const unsupported = props.review.fields.some((r) => r.name === f.name && r.state === 'unsupported')
    return { name: f.name, value: index >= 0 && !unsupported ? props.output.values[index]! : null, optional: f.optional === true, extra: false, unsupported }
  })
  const extras = props.review.extras.map((x) => ({ name: props.draft.properties[x.index]!.name || 'unnamed', value: props.output.values[x.index]!, optional: false, extra: true, unsupported: false }))
  return [...required, ...extras]
})
const about = ref(false)
// A built object (Transform v3) shows as a tree, as observations do: the target's contract says what each place is.
const reading = inject(READING, ref(FLAT))
const fieldsOf = (name: string): readonly Field[] | null => {
  const f = props.target.definition.fields.find((x) => x.name === name)
  if (f?.type === 'object') return f.fields
  if (f?.type === 'reference') return reading.value.resolve(f.definition)?.fields ?? null
  return null
}
const versionWords = (ref: DefinitionRef) => `${reading.value.resolve(ref)?.name ?? ref.id} · v${ref.version}`
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
      <template v-for="r in rows" :key="r.name">
      <div v-if="r.value && 'object' in r.value" class="pl-3 font-sans" data-preview-object>
        <span class="font-mono text-slate-600">{{ r.name }}:</span>
        <div class="mt-0.5 ml-1 rounded-lg bg-white px-2 ring-1 ring-slate-200/80">
          <ObservedTree :data="r.value.object" :fields="fieldsOf(r.name)" :resolve="reading.resolve" :label="versionWords" />
        </div>
      </div>
      <div v-else class="flex min-w-0 items-center gap-2 pl-3">
        <span class="shrink-0" :class="r.extra ? 'text-amber-800 line-through' : 'text-slate-600'">{{ r.name }}:</span>
        <span v-if="r.unsupported" class="font-sans text-slate-500">not supported by this Transform version</span>
        <ShownText v-else-if="r.value && 'value' in r.value" :value="r.value.value" />
        <span v-else-if="r.value && 'problems' in r.value" class="font-sans text-red-700">can’t be made: {{ r.value.problems[0] }}</span>
        <span v-else-if="r.value && 'absent' in r.value" class="font-sans text-slate-500">left out: the example has no {{ r.value.absent.join(', ') }}</span>
        <span v-else-if="!r.value && r.optional" class="font-sans text-slate-500">left out (optional)</span>
        <span v-else class="font-sans text-amber-700">not mapped</span>
        <span v-if="r.extra" class="font-sans text-amber-800">not part of the output</span>
      </div>
      </template>
      <span class="text-slate-400">}</span>
    </div>
    <!-- An actual mismatch stays in view; a good fit is said only on demand (above). -->
    <p v-if="fit === false" class="mt-1.5 text-xs text-red-700">{{ target.label }} wouldn’t accept this: {{ output.fits!.issues.join(' ') }}</p>
    <!-- Not a result: what each value reads, and why a run would refuse it -->
    <p v-if="output.kind === 'illustration' && !('problem' in example)" class="mt-1.5 text-xs" :class="output.refused.length ? 'text-red-700' : 'text-slate-500'" data-preview-illustration>
      An illustration, not a result.<template v-if="output.refused.length"> This Transform version would refuse the Mapping before running: {{ output.refused.join(' ') }}</template>
    </p>
  </div>
</template>
