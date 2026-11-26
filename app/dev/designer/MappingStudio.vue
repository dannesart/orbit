<script setup lang="ts">
// Mapping Studio (Phase 4.5A, experimental): the Transform's Mapping in a view of its own, the way
// Definition Studio gives a Definition one. The Designer shows what happens; this shows how
// information changes. One editor in three segments, moved between freely:
//
//   General  the Mapping's exact contracts (what it reads and makes), and the Feature version the
//            step invokes it with, shown apart: the Mapping doesn't belong to a Feature version
//   Mapping  the input contract and the output contract side by side, staying where they are; an
//            output property opens the existing editor for it in a floating inspector beside them
//            (Phase 4.5B). On narrow screens, one contract at a time, Output first
//   Preview  the example input and what the draft would make from it (not executed), beside the
//            applied Mapping's preview and what actually ran (evidence)
//
// The same draft, review, preview and Apply as the inspector and the focused editor: opening,
// leaving or moving between segments changes nothing. Apply and Cancel are always in view.
import type { DefinitionRef, DefinitionVersion, PropertyPath } from '#shared/features/definitions'
import type { Step } from '../features/experiment'
import ApplyBar from './ApplyBar.vue'
import StructureEditor from './StructureEditor.vue'
import StudioConnections from './StudioConnections.vue'
import StudioInspector from './StudioInspector.vue'
import StudioInputTree from './StudioInputTree.vue'
import StudioOutputTree from './StudioOutputTree.vue'
import StudioPreview from './StudioPreview.vue'
import UnsupportedNotice from './UnsupportedNotice.vue'
import { type Configuration, type Plan, type RunRecord, type TransformDraft, inputOf, labelOf } from './config'
import type { DraftReview, Example, OutputPreview } from './preview'
import { FLAT, READING } from './reading'
import { type AppliedPreview, connections, inputTree, isWithin, outputTree } from './studio'
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

// --- The selected output property, in the inspector ---
// The trees never change shape while a property is edited: the inspector floats beside them. Its
// editor is the top-level property's (a built object is edited whole), opened at the place chosen.
const selected = ref<PropertyPath | null>(null)
const editing = computed(() => selected.value?.[0] ?? null)
const field = computed(() => props.review.fields.find((f) => f.name === editing.value) ?? null)
const node = computed(() => outputs.value.find((o) => o.name === editing.value) ?? null)
const samePath = (a: PropertyPath | null, b: PropertyPath) => !!a && a.join(' › ') === b.join(' › ')
/** Selecting a row: the inspector, at that place. Selecting it again closes it. */
function open(path: PropertyPath) {
  if (samePath(selected.value, path)) return close()
  selected.value = path
  nextTick(() => {
    const inspector = document.querySelector<HTMLElement>('[data-studio-inspector]')
    const place = path.length > 1 ? inspector?.querySelector<HTMLElement>(`[data-construction-property="${CSS.escape(path.join(' › '))}"]`) : null
    place?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    ;(place ?? inspector?.querySelector<HTMLElement>('[data-inspector-body]'))?.querySelector<HTMLElement>('button, select, input')?.focus({ preventScroll: true })
  })
}
/** Closing the inspector: focus goes back to the row it was opened from. */
function close() {
  const at = selected.value
  selected.value = null
  if (at) nextTick(() => document.querySelector<HTMLElement>(`[data-output-node="${CSS.escape(at.join(' › '))}"] > button`)?.focus())
}
// A property that's no longer part of the output (the output changed in General) closes.
watch(outputs, (nodes) => { if (editing.value && !nodes.some((n) => n.name === editing.value)) selected.value = null })

/** Every dependency the draft has; those of the selected property (and inside it) are lit. */
const links = computed(() => connections(outputs.value, inputs.value))
const lit = computed(() => (selected.value ? links.value.filter((c) => isWithin(c.to, selected.value!)) : []))
/** What the selected property reads, pointed out in the input. */
const reads = computed(() => new Set(lit.value.map((c) => JSON.stringify(c.from))))

// --- Narrow screens: one tree at a time, Output first (it's where editing happens) ---
type Pane = 'output' | 'input'
const pane = ref<Pane>('output')

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
  <section class="flex min-h-[calc(100dvh-3rem)] flex-col rounded-3xl border border-slate-200/80 bg-white shadow-sm sm:min-h-[calc(100dvh-3.5rem)] lg:min-h-[calc(100dvh-4rem)]" aria-labelledby="studio-heading" data-mapping-studio @keydown.escape="close">
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

    <div id="studio-panel" role="tabpanel" :aria-labelledby="`studio-segment-${segment}`" class="flex-1 bg-slate-50/60 px-4 py-6 sm:px-6">
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

      <!-- Mapping: the input and the output, side by side, and the selected property beside them -->
      <div v-else-if="segment === 'mapping'" class="flex items-start gap-6">
        <div class="min-w-0 flex-1">
          <!-- Narrow screens: one tree at a time, Output first -->
          <div class="mb-4 flex rounded-full bg-slate-200/60 p-1 lg:hidden" role="tablist" aria-label="Which contract" data-studio-pane-switch>
            <button
              v-for="p in (['output', 'input'] as const)"
              :key="p"
              type="button"
              role="tab"
              :aria-selected="pane === p"
              :data-studio-pane="p"
              :class="[tab, 'flex-1', pane === p ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600']"
              @click="pane = p"
            >
              {{ p === 'output' ? 'Output' : 'Input' }}
            </button>
          </div>
          <div class="relative grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(4rem,7rem)_minmax(0,1fr)] lg:gap-0" data-studio-workspace>
            <section :class="[panel, 'lg:col-start-1 lg:row-start-1', pane === 'input' ? '' : 'max-lg:hidden']" aria-labelledby="studio-input-heading" data-studio-input>
              <div class="mb-3 flex flex-wrap items-baseline gap-x-2" data-input-root>
                <h2 id="studio-input-heading" class="text-sm font-semibold text-slate-900">Input</h2>
                <span class="text-xs text-slate-500">{{ label(inputOf(draft)) }}</span>
              </div>
              <StudioInputTree :nodes="inputs" :label="versionWords" :highlight="reads" />
              <p v-if="!inputs.length" class="text-sm text-slate-500">It has no properties.</p>
            </section>

            <section :class="[panel, 'lg:col-start-3 lg:row-start-1', pane === 'output' ? '' : 'max-lg:hidden']" aria-labelledby="studio-output-heading" data-studio-output>
              <div class="mb-2 flex flex-wrap items-baseline gap-x-2">
                <h2 id="studio-output-heading" class="text-sm font-semibold text-slate-900">Output</h2>
                <span class="text-xs text-slate-500">{{ target.label }}</span>
                <span class="ml-auto shrink-0 text-xs text-slate-500" :aria-label="`${mapped} of ${needed} mapped`">{{ mapped }}/{{ needed }}</span>
              </div>
              <StudioOutputTree :nodes="outputs" :label="versionWords" :selected="selected" class="-mx-2" @open="open" />
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
            <StudioConnections :connections="links" :selected="selected" />
          </div>
          <!-- What the lines mean: only where they're drawn -->
          <p v-if="links.length" class="mt-3 flex flex-wrap justify-center gap-x-5 gap-y-1 text-xs text-slate-400 max-lg:hidden" data-connections-legend>
            <span class="flex items-center gap-1.5"><svg width="22" height="6" aria-hidden="true"><path d="M1 3h20" stroke="currentColor" stroke-width="1.5" /></svg>Value</span>
            <span class="flex items-center gap-1.5"><svg width="22" height="6" aria-hidden="true"><path d="M1 3h20" stroke="currentColor" stroke-width="3" stroke-linecap="round" /></svg>Copied whole</span>
            <span class="flex items-center gap-1.5"><svg width="22" height="6" aria-hidden="true"><path d="M1 3h20" stroke="currentColor" stroke-width="1.5" stroke-dasharray="5 4" /></svg>Built when present</span>
          </p>
        </div>

        <!-- The selected property: docked beside the trees on very wide screens, floating over the output below that, a sheet on phones -->
        <StudioInspector
          v-if="node && field"
          class="fixed inset-0 z-50 animate-rise lg:inset-auto lg:top-4 lg:right-4 lg:bottom-28 lg:w-[26rem] lg:rounded-3xl lg:border lg:border-slate-200/80 lg:shadow-xl lg:shadow-slate-900/10 xl:sticky xl:top-4 xl:right-auto xl:bottom-auto xl:z-20 xl:max-h-[calc(100dvh-8rem)] xl:shrink-0"
          data-floating-surface
          :node="node"
          :field="field"
          :draft="draft"
          :review="review"
          :input="input"
          :example="example"
          :output="target.definition"
          :label="versionWords"
          @update:draft="emit('update:draft', $event)"
          @close="close"
        />
        <p v-else class="sticky top-4 hidden w-[26rem] shrink-0 rounded-3xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500 xl:block" data-inspector-placeholder>Select an output property to choose how it’s made.</p>
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
