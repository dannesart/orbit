<script setup lang="ts">
// Mapping Studio (Phase 4.5A, experimental): the Transform's Mapping in a view of its own, the way
// Definition Studio gives a Definition one. The Designer shows what happens; this shows how
// information changes. One editor in three segments, moved between freely:
//
//   General  the Mapping's exact contracts (what it reads and makes), and the Feature version the
//            step invokes it with, shown apart: the Mapping doesn't belong to a Feature version
//   Mapping  the input contract and the output contract side by side; an output property opens
//            the existing editor for it in place
//   Preview  the example input and what the draft would make from it (not executed), beside the
//            applied Mapping's preview and what actually ran (evidence)
//
// The same draft, review, preview and Apply as the inspector and the focused editor: opening,
// leaving or moving between segments changes nothing. Apply and Cancel are always in view.
import type { DefinitionRef, DefinitionVersion, PropertyPath } from '#shared/features/definitions'
import type { Step } from '../features/experiment'
import ApplyBar from './ApplyBar.vue'
import PropertyEditor from './PropertyEditor.vue'
import StructureEditor from './StructureEditor.vue'
import StudioInputTree from './StudioInputTree.vue'
import StudioOutputTree from './StudioOutputTree.vue'
import StudioPreview from './StudioPreview.vue'
import UnsupportedNotice from './UnsupportedNotice.vue'
import { type Configuration, type Plan, type RunRecord, type TransformDraft, inputOf, labelOf } from './config'
import type { DraftReview, Example, OutputPreview } from './preview'
import { FLAT, READING } from './reading'
import { type AppliedPreview, inputTree, outputTree } from './studio'
import { fromPiece } from './parts'
import { describeSource } from './summary'

const props = defineProps<{
  draft: TransformDraft
  config: Configuration
  target: { definition: DefinitionVersion; label: string; isNew: boolean }
  plan: Plan
  structure: readonly string[]
  review: DraftReview
  output: OutputPreview
  example: Example
  input: DefinitionVersion
  canUndo: boolean
  boundary: readonly string[]
  /** The exact Transform version the step invokes, in words. */
  feature: string
  applied: AppliedPreview
  step: Step
  stale: boolean
  runNumber: number
  runs: readonly RunRecord[]
}>()
const emit = defineEmits<{ 'update:draft': [TransformDraft]; apply: []; cancel: []; undo: []; back: [] }>()

type Segment = 'general' | 'mapping' | 'preview'
const SEGMENTS: Segment[] = ['general', 'mapping', 'preview']
const LABELS: Record<Segment, string> = { general: 'General', mapping: 'Mapping', preview: 'Preview' }
const segment = ref<Segment>('mapping')

const reading = inject(READING, ref(FLAT))
const label = (ref: DefinitionRef) => labelOf(props.config, ref)
const versionWords = (ref: DefinitionRef) => `${reading.value.resolve(ref)?.name ?? ref.id} · v${ref.version}`
const inputs = computed(() => inputTree(props.input, reading.value))
const outputs = computed(() => outputTree(props.target.definition, props.draft.properties, props.review, reading.value.resolve))
const mapped = computed(() => props.review.fields.filter((f) => f.state === 'set').length)
const needed = computed(() => props.review.fields.filter((f) => f.state !== 'left_out' && f.state !== 'unsupported').length)

// --- Editing one output property, in place ---
const editing = ref<string | null>(null)
const field = computed(() => props.review.fields.find((f) => f.name === editing.value) ?? null)
/** Opening a row: its top-level property's editor, at the place chosen. The open one closes again. */
function open(path: PropertyPath) {
  const name = path[0]!
  if (path.length === 1 && editing.value === name) {
    editing.value = null
    return
  }
  editing.value = name
  nextTick(() => {
    const at = path.join(' › ')
    const place = document.querySelector<HTMLElement>(`[data-construction-property="${CSS.escape(at)}"]`) ?? document.querySelector<HTMLElement>(`[data-output-node="${CSS.escape(name)}"]`)
    place?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    place?.querySelector<HTMLElement>('button, select, input')?.focus({ preventScroll: true })
  })
}
/** What the property being edited reads, pointed out in the input. */
const reads = computed(() => {
  const i = field.value?.index ?? -1
  return new Set(i >= 0 ? outputs.value.find((o) => o.name === editing.value)?.reads.map((p) => JSON.stringify(p)) ?? [] : [])
})

// --- Moving between segments: arrow keys within the tab list ---
const tabs = ref<HTMLElement>()
function onTabKey(event: KeyboardEvent) {
  const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
  if (!step) return
  segment.value = SEGMENTS[(SEGMENTS.indexOf(segment.value) + step + SEGMENTS.length) % SEGMENTS.length]!
  nextTick(() => tabs.value?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus())
}
const heading = ref<HTMLElement>()
onMounted(() => heading.value?.focus())
const tab = 'rounded-full px-4 py-1.5 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500'
const panel = 'rounded-3xl bg-white p-5 ring-1 ring-slate-200/80 sm:p-6'
</script>

<template>
  <section class="flex flex-col rounded-3xl border border-slate-200/80 bg-white shadow-sm" aria-labelledby="studio-heading" data-mapping-studio @keydown.escape="editing = null">
    <!-- What's being edited: always in view -->
    <div class="flex flex-wrap items-center gap-x-3 gap-y-3 border-b border-slate-100 px-5 py-4 sm:px-6">
      <button type="button" class="link mr-1 text-sm" data-studio-back @click="emit('back')">‹ Designer</button>
      <div class="flex min-w-0 flex-1 basis-64 items-center gap-3">
        <span class="flex h-7 min-w-7 items-center justify-center rounded-full bg-accent-600 px-2 text-xs font-semibold text-white" aria-hidden="true">2</span>
        <div class="min-w-0">
          <h1 id="studio-heading" ref="heading" tabindex="-1" class="truncate text-base leading-tight font-semibold text-slate-900 outline-none">Mapping</h1>
          <p class="truncate text-xs text-slate-500" data-studio-contracts>{{ label(inputOf(draft)) }} → {{ target.label }}<template v-if="plan.changes"> · <span class="font-medium text-amber-700">unapplied changes</span></template></p>
        </div>
      </div>
      <div ref="tabs" class="flex w-full rounded-full bg-slate-100 p-1 sm:w-auto" role="tablist" aria-label="What you’re looking at" @keydown="onTabKey">
        <button
          v-for="s in SEGMENTS"
          :id="`studio-segment-${s}`"
          :key="s"
          type="button"
          role="tab"
          :aria-selected="segment === s"
          aria-controls="studio-panel"
          :tabindex="segment === s ? 0 : -1"
          :data-studio-segment="s"
          :class="[tab, 'flex-1 sm:flex-none', segment === s ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900']"
          @click="segment = s"
        >
          {{ LABELS[s] }}
        </button>
      </div>
    </div>

    <div id="studio-panel" role="tabpanel" :aria-labelledby="`studio-segment-${segment}`" class="bg-slate-50/60 px-4 py-6 sm:px-6">
      <UnsupportedNotice v-if="review.unsupported" class="mb-5" :text="review.unsupported" />

      <!-- General: the contracts, and the Feature version that invokes the Mapping -->
      <div v-if="segment === 'general'" class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div :class="panel">
          <StructureEditor :draft="draft" :config="config" :target="target" :structure="structure" :review="review" :input="input" @update:draft="emit('update:draft', $event)" />
        </div>
        <div class="flex flex-col gap-4 lg:self-start">
          <section :class="panel" aria-labelledby="invoked-heading" data-studio-feature>
            <h2 id="invoked-heading" class="text-sm font-semibold text-slate-900">Invoked by</h2>
            <p class="mt-2 text-sm font-medium text-slate-800">{{ feature }}</p>
            <p class="mt-1 text-xs" :class="review.unsupported || boundary.length ? 'text-red-700' : 'text-slate-500'">
              <template v-if="review.unsupported">Can’t take these contracts.</template>
              <template v-else-if="boundary.length">Wouldn’t accept this Mapping: {{ boundary[0] }}</template>
              <template v-else>Takes these contracts.</template>
            </p>
            <p class="mt-3 text-xs text-slate-500">Chosen on the Transform step. The Mapping doesn’t belong to it: any version that accepts the Mapping can invoke it.</p>
          </section>
          <section :class="panel" aria-labelledby="applied-heading">
            <h2 id="applied-heading" class="text-sm font-semibold text-slate-900">Applied</h2>
            <p class="mt-2 text-sm text-slate-700">Mapping v{{ config.mapping.version }} · {{ label(config.output) }}</p>
            <p class="mt-1 text-xs text-slate-500">What runs use now. It stays exactly as it is until Apply succeeds.</p>
          </section>
        </div>
      </div>

      <!-- Mapping: the input and the output, side by side -->
      <div v-else-if="segment === 'mapping'" class="grid gap-6 lg:grid-cols-2">
        <section :class="panel" aria-labelledby="studio-input-heading" data-studio-input>
          <div class="mb-3 flex items-baseline gap-2">
            <h2 id="studio-input-heading" class="text-sm font-semibold text-slate-900">Input</h2>
            <span class="truncate text-xs text-slate-500">{{ label(inputOf(draft)) }}</span>
          </div>
          <StudioInputTree :nodes="inputs" :label="versionWords" :highlight="reads" />
          <p v-if="!inputs.length" class="text-sm text-slate-500">It has no properties.</p>
        </section>

        <section :class="panel" aria-labelledby="studio-output-heading" data-studio-output>
          <div class="mb-2 flex items-baseline gap-2">
            <h2 id="studio-output-heading" class="text-sm font-semibold text-slate-900">Output</h2>
            <span class="truncate text-xs text-slate-500">{{ target.label }}</span>
            <span class="ml-auto shrink-0 text-xs text-slate-500" :aria-label="`${mapped} of ${needed} mapped`">{{ mapped }}/{{ needed }}</span>
          </div>
          <StudioOutputTree :nodes="outputs" :label="versionWords" :editing="editing" class="-mx-2" @open="open">
            <template #editor>
              <p v-if="field?.state === 'unsupported'" class="text-sm text-slate-600" data-unsupported-property>This Transform version can’t make {{ field.name }}, so there’s nothing to map here.</p>
              <PropertyEditor v-else-if="field" :output="target.definition" :draft="draft" :field="field" :review="review" :input="input" :example="example" @update:draft="emit('update:draft', $event)" />
              <button type="button" class="mt-4 rounded-full px-4 py-1.5 text-sm font-medium text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500" data-editor-done @click="editing = null">Done</button>
            </template>
          </StudioOutputTree>
          <p v-if="!outputs.length" class="text-sm text-slate-500">The output has no properties yet. Add some in General.</p>
          <div v-if="review.extras.length" class="mt-4 rounded-2xl bg-amber-50/70 p-3 text-sm ring-1 ring-amber-200" data-studio-extras>
            <p class="font-medium text-slate-900">{{ review.extras.length === 1 ? 'One mapping has' : `${review.extras.length} mappings have` }} no property to fill</p>
            <ul class="mt-1 flex flex-col gap-1">
              <li v-for="x in review.extras" :key="x.index" class="text-xs text-amber-800"><span class="font-mono">{{ draft.properties[x.index]!.name || 'Unnamed' }}</span>: {{ x.reason }}</li>
            </ul>
            <button type="button" class="link mt-2 text-xs" @click="segment = 'general'">Review in General</button>
          </div>
          <details v-if="draft.aside?.length" class="mt-3 text-xs text-slate-500">
            <summary class="cursor-pointer">{{ draft.aside.length === 1 ? 'One earlier mapping is' : `${draft.aside.length} earlier mappings are` }} set aside</summary>
            <p class="mt-1">They don’t fit {{ target.label }}, so they aren’t part of this draft. They come back if you choose a Definition they fit again.</p>
            <ul class="mt-1"><li v-for="(p, i) in draft.aside" :key="i" class="font-mono">{{ p.name || 'Unnamed' }} ← {{ describeSource(fromPiece(p.piece)) }}</li></ul>
          </details>
        </section>
      </div>

      <!-- Preview: the example, and what would be made from it -->
      <StudioPreview
        v-else
        :draft="draft"
        :config="config"
        :target="target"
        :review="review"
        :output="output"
        :example="example"
        :input="input"
        :applied="applied"
        :step="step"
        :stale="stale"
        :run-number="runNumber"
        :runs="runs"
      />
    </div>

    <!-- Apply and Cancel, in every segment -->
    <div class="sticky bottom-0 rounded-b-3xl border-t border-slate-100 bg-white/95 px-5 pt-3 pb-4 backdrop-blur sm:px-6">
      <ApplyBar
        :plan="plan"
        :config="config"
        :draft="draft"
        :errors="[...structure, ...review.errors, ...boundary]"
        :missing="review.missing"
        :unsupported="review.unsupported"
        :can-undo="canUndo"
        cancel
        @apply="emit('apply')"
        @discard="emit('cancel')"
        @undo="emit('undo')"
      />
    </div>
  </section>
</template>
