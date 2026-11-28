<script setup lang="ts">
// The output in the inspector: each property once, in one row that says everything about it. Its
// state, name and type; the value the draft would make from Record A's data (a preview, never a
// run, and only where the preview has one); and what makes that value. The whole row opens Mapping
// Studio at that property (rows.ts); nothing is edited here. A built object shows its first level;
// the whole output is one named toggle away as raw JSON. An illustration says so, and a real
// mismatch stays in view.
import type { DefinitionVersion } from '#shared/features/definitions'
import DesignerIcon from './DesignerIcon.vue'
import ShownText from './ShownText.vue'
import type { TransformDraft } from './config'
import type { DraftReview, Example, OutputPreview } from './preview'
import { type PropertyRow, propertyRows } from './rows'
import { RECORD_NAME } from './workflows'

const props = defineProps<{
  draft: TransformDraft
  review: DraftReview
  output: OutputPreview
  example: Example
  target: { definition: DefinitionVersion; label: string }
  /** How many problems the draft has: a fit is said only when there are none. */
  problems: number
}>()
const emit = defineEmits<{ open: [PropertyRow['opens']] }>()

const rows = computed(() => propertyRows(props.draft, props.review, { output: props.output, example: props.example }))
const mapped = computed(() => props.review.fields.filter((f) => f.state === 'set').length)
// Optional properties left out aren't unfinished work, nor is what this Transform version can't make.
const leftOut = computed(() => props.review.fields.filter((f) => f.state === 'left_out').length)
const needed = computed(() => props.review.fields.filter((f) => f.state !== 'left_out' && f.state !== 'unsupported').length)
const icon = {
  not_set: { mark: '○', tone: 'text-amber-600' },
  left_out: { mark: '–', tone: 'text-slate-400' },
  problem: { mark: '!', tone: 'text-red-600' },
  set: { mark: '✓', tone: 'text-accent-600' },
  unsupported: { mark: '×', tone: 'text-slate-400' },
}
/** The output's values that could be made, as the object they'd form: what the JSON view shows. */
const json = computed(() => JSON.stringify(Object.fromEntries(props.review.fields.flatMap((f): [string, unknown][] => {
  const v = f.index >= 0 && f.state !== 'unsupported' ? props.output.values[f.index] : undefined
  return v && 'value' in v ? [[f.name, v.value]] : v && 'object' in v ? [[f.name, v.object]] : []
})), null, 2))
const hasExample = computed(() => !('problem' in props.example))
const illustration = computed(() => props.output.kind === 'illustration')
const about = ref(false)
const raw = ref(false)
/** Whether the previewed object fits the target: only known when every value could be made. */
const fit = computed(() => (!props.output.fits || !hasExample.value || props.problems ? null : props.output.fits.issues.length === 0))
const SHOWN = 4
/** Whose data the example values are: the chosen Record ("Record A" unless another is chosen). */
const recordName = inject(RECORD_NAME, computed(() => 'Record A'))
</script>

<template>
  <section aria-labelledby="output-heading">
    <div class="mb-1 flex items-center gap-2">
      <h3 id="output-heading" class="text-sm font-semibold text-slate-900">Output</h3>
      <span class="mr-auto text-xs text-slate-500" :aria-label="`${mapped} of ${needed} mapped${leftOut ? `, ${leftOut} optional left out` : ''}`">{{ mapped }}/{{ needed }}</span>
      <!-- Where the example values come from, on demand -->
      <button v-if="hasExample" type="button" class="rounded-md px-1 text-xs text-slate-500 transition hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500" :aria-expanded="about" aria-controls="preview-about" data-preview-about @click="about = !about">Not executed</button>
      <button
        v-if="hasExample"
        type="button"
        data-preview-json
        class="grid size-7 place-items-center rounded-lg transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
        :class="raw ? 'bg-accent-50 text-accent-700' : 'text-slate-400 hover:bg-slate-100 hover:text-slate-700'"
        :aria-pressed="raw"
        aria-label="Show as JSON"
        title="Show as JSON"
        @click="raw = !raw"
      >
        <DesignerIcon name="code" class="size-4" />
      </button>
    </div>
    <p v-if="about" id="preview-about" class="mb-1 text-xs text-slate-500">
      Example values: this draft, with {{ recordName }}’s data. Nothing has run.<template v-if="fit === true"> Fits {{ target.label }}.</template>
    </p>
    <p v-if="!hasExample && 'problem' in example" class="mb-1 text-xs text-amber-800">{{ example.problem }} <span v-if="example.details.length" class="block">{{ example.details.join(' ') }}</span></p>

    <pre v-if="raw" class="mt-1 overflow-x-auto rounded-xl bg-slate-50 p-3 font-mono text-xs text-slate-700" aria-label="The example output as JSON" data-preview-raw>{{ json }}</pre>
    <ul v-else class="-mx-2 flex flex-col divide-y divide-slate-100" data-output-rows>
      <li v-for="r in rows" :key="r.name">
        <button
          type="button"
          :data-property-row="r.name"
          class="flex w-full items-center gap-2 rounded-xl px-2 py-2.5 text-left transition hover:bg-accent-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-inset"
          :aria-label="r.label"
          @click="emit('open', r.opens)"
        >
          <span class="min-w-0 flex-1">
            <!-- Name and type, and the example value beside them -->
            <span class="flex min-w-0 items-center gap-2">
              <span aria-hidden="true" class="w-3 shrink-0 text-center text-xs font-semibold" :class="icon[r.state].tone">{{ icon[r.state].mark }}</span>
              <span class="truncate font-mono text-sm font-semibold text-slate-900">{{ r.name || '(no name)' }}</span>
              <span class="shrink-0 text-xs text-slate-400">{{ r.type }}</span>
              <span v-if="r.example" class="ml-auto flex min-w-0 max-w-[55%] justify-end text-xs" :class="{ 'opacity-60': illustration }" data-row-example>
                <ShownText v-if="r.example.kind === 'value'" :value="r.example.value" />
                <span v-else-if="r.example.kind === 'object'" class="text-slate-500">{{ r.example.entries.length === 1 ? '1 value' : `${r.example.entries.length} values` }}</span>
                <span v-else-if="r.example.kind === 'cannot'" class="truncate text-red-700" :title="r.example.why">Can’t be made</span>
                <span v-else class="truncate text-slate-500" :title="`The example has no ${r.example.what}`">Left out</span>
              </span>
            </span>
            <!-- How it's made -->
            <span class="mt-1 flex items-center gap-2 pl-5 text-xs" :class="r.state === 'not_set' ? 'text-amber-700' : r.state === 'unsupported' ? 'text-slate-500' : 'text-slate-600'">
              <!-- The arrow reads "made from"; an optional property left out, or one this version can't make, is made from nothing. -->
              <span v-if="r.state !== 'left_out' && r.state !== 'unsupported'" aria-hidden="true" class="text-slate-400">←</span>
              <span class="min-w-0 truncate">{{ r.summary }}</span>
            </span>
            <span v-if="r.problem" class="mt-1 block pl-5 text-xs text-red-700">{{ r.problem }}</span>
            <!-- A built object: its first level, compactly -->
            <span v-if="r.example?.kind === 'object' && r.example.entries.length" class="mt-1.5 ml-5 flex flex-col gap-0.5 border-l-2 border-slate-100 pl-2.5 text-xs" :class="{ 'opacity-60': illustration }" data-row-object>
              <span v-for="e in r.example.entries.slice(0, SHOWN)" :key="e.name" class="flex min-w-0 items-center gap-2">
                <span class="shrink-0 font-mono text-slate-500">{{ e.name }}</span>
                <span class="ml-auto flex min-w-0 justify-end">
                  <ShownText v-if="e.value !== null" :value="e.value" />
                  <span v-else class="text-slate-500">{{ e.size === 1 ? '1 value' : `${e.size} values` }}</span>
                </span>
              </span>
              <span v-if="r.example.entries.length > SHOWN" class="text-slate-400">{{ r.example.entries.length - SHOWN }} more in JSON</span>
            </span>
          </span>
          <DesignerIcon name="chevron" class="size-4 shrink-0 text-slate-400" />
        </button>
      </li>
      <li v-if="!rows.length" class="px-2 py-3 text-sm text-slate-500">No properties yet. Add some in Mapping Studio.</li>
    </ul>

    <!-- An actual mismatch stays in view; a good fit is said only on demand (above). -->
    <p v-if="fit === false" class="mt-1.5 text-xs text-red-700">{{ target.label }} wouldn’t accept this: {{ output.fits!.issues.join(' ') }}</p>
    <!-- Not a result: what each value reads, and why a run would refuse it -->
    <p v-if="illustration && (output.unresolved || hasExample)" class="mt-1.5 text-xs" :class="output.refused.length ? 'text-red-700' : 'text-slate-500'" data-preview-illustration>
      An illustration, not a result.<template v-if="output.unresolved"> A Definition it depends on can’t be found here, so nothing was checked against it.</template><template v-if="output.refused.length"> This Transform version would refuse the Mapping before running: {{ output.refused.join(' ') }}</template>
    </p>
  </section>
</template>
