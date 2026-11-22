<script setup lang="ts">
// Experiment #2: the Feature playground's chain on a canvas. Disposable: it exists to find out
// whether a spatial view makes Orbit better, not to become the workflow designer.
// Experiment #5: the same Designer in Orbit's own design language: a floating toolbar, a floating
// inspector for understanding and simple changes, and a focused editor with room to create.
//
// Development and Deploy Previews only (registered by nuxt.config.ts, like /dev/features). It runs
// the same in-memory experiment as the list playground: same fixtures, same runExperiment, same
// editors. Nothing is fetched, saved or logged, and the layout isn't kept either.
//
// Execution order comes from graph.ts alone. Positions are only where nodes are drawn.
import { Background, ControlButton, Controls, Panel, VueFlow, type Node, type Padding, type VueFlowInstance } from '@xyflow/vue'
import '@xyflow/vue/dist/style.css'
import type { Data, DefinitionRef } from '#shared/features/definitions'
import { orbitConsole } from '#shared/features/features'
import {
  A1, CONSOLES, DEFINITIONS, INITIAL_DATA, PINS, RECORD_ID, WORKSPACE, type Step,
  definitionLabel, outcomeLabel, parseRecordData, runExperiment, shapeOf,
} from '../features/experiment'
import RunResult from './RunResult.vue'
import DesignerToolbar from './DesignerToolbar.vue'
import FocusEditor from './FocusEditor.vue'
import TransformInspector from './TransformInspector.vue'
import StepNode, { type StepView } from './StepNode.vue'
import { EXECUTION_ORDER, type StepId, fixedEdges, initialNodes, resetPositions, stepBadge, stepTitle } from './graph'
import { summarize } from './summary'
import { fromDraft } from './parts'
import { exampleFrom, previewOutput, reviewDraft } from './preview'
import {
  type Configuration, type RunRecord, type TransformDraft, allDefinitions, applyConfiguration, draftFrom, findMapping,
  initialConfiguration, labelOf, outputOf, planApply, structureProblems,
} from './config'

useHead({ title: 'Spatial designer (experiment) · Orbit' })

// --- The experiment's state: as on the list playground (FeaturePlayground.vue), except that the
// Transform's configuration (its output Definition and its Mapping) is edited as a draft and only
// Apply makes versions (Experiments #3 and #4) ---
const pinKey = ref('a1')
const recordText = ref(JSON.stringify(INITIAL_DATA, null, 2))
const consoleId = ref(orbitConsole.id)
const config = shallowRef<Configuration>(initialConfiguration())
const steps = shallowRef<[Step, Step, Step]>([null, null, null])
const runs = shallowRef<RunRecord[]>([])
const ranWith = ref('')
const runNumber = ref(0)

const pin = computed(() => PINS.find((p) => p.key === pinKey.value)!)
const parsed = computed(() => parseRecordData(recordText.value))
const appliedMapping = computed(() => findMapping(config.value, config.value.mapping)!)
const label = (ref: DefinitionRef) => labelOf(config.value, ref)
// What a run depends on. The draft isn't part of it: runs use the applied versions.
const snapshot = computed(() => JSON.stringify([pinKey.value, recordText.value, consoleId.value, config.value.mapping]))
const stale = computed(() => snapshot.value !== ranWith.value)

// --- The draft: edited freely, previewed, and only applied on purpose ---
const draft = shallowRef<TransformDraft>(draftFrom(config.value))
const history = shallowRef<TransformDraft[]>([])
let lastEdit = 0
/** Every change to the draft can be undone. Typing in one box counts as one change. */
function setDraft(next: TransformDraft, coalesce = true) {
  const now = Date.now()
  if (!coalesce || now - lastEdit > 800 || !history.value.length) history.value = [...history.value, draft.value].slice(-50)
  lastEdit = coalesce ? now : 0
  draft.value = next
}
function undo() {
  const previous = history.value.at(-1)
  if (!previous) return
  history.value = history.value.slice(0, -1)
  lastEdit = 0
  draft.value = previous
}
const target = computed(() => outputOf(config.value, draft.value))
const draftProperties = computed(() => fromDraft(draft.value.properties))
const structure = computed(() => structureProblems(draft.value))
const example = computed(() => exampleFrom(recordText.value, A1))
const review = computed(() => reviewDraft(draftProperties.value, A1, target.value.definition, target.value.label))
const output = computed(() => previewOutput(draftProperties.value, A1, target.value.definition, example.value))
const plan = computed(() => planApply(config.value, draft.value))
/**
 * The only place versions are made. Normally only a sound draft; "anyway" is the playground's
 * boundary test, and only for Mapping problems: an invalid structure is never a Definition.
 */
function apply(anyway: boolean) {
  if (!plan.value.changes || structure.value.length || (!anyway && review.value.problems.length)) return
  config.value = applyConfiguration(config.value, draft.value)
  setDraft({ ...draft.value, properties: draftFrom(config.value).properties }, false)
}
const discard = () => setDraft(draftFrom(config.value), false)

function run() {
  const record = parsed.value
  if ('error' in record) return
  // Runs use the applied versions only. Running never makes one (only apply does).
  const applied = config.value
  steps.value = runExperiment(
    {
      definitions: allDefinitions(applied),
      records: [{ id: RECORD_ID, workspaceId: WORKSPACE, definition: pin.value.ref, data: record.data as Data }],
      mappings: applied.mappings,
    },
    { console: CONSOLES.find((c) => c.feature.id === consoleId.value)!.feature, mapping: applied.mapping },
  )
  ranWith.value = snapshot.value
  runNumber.value++
  const evidence = steps.value[1]?.evidence
  const used = evidence?.mapping ? findMapping(applied, evidence.mapping) : null
  runs.value = [...runs.value, { number: runNumber.value, outcome: evidence?.outcome ?? null, mapping: evidence?.mapping ?? null, output: used?.to ?? null }]
}

function startOver() {
  pinKey.value = 'a1'
  recordText.value = JSON.stringify(INITIAL_DATA, null, 2)
  consoleId.value = orbitConsole.id
  setDraft({ ...draftFrom(initialConfiguration()), local: draft.value.local }, false)
}

run()

// --- The canvas ---
const nodes = ref<Node[]>(initialNodes())
const flow = shallowRef<VueFlowInstance>()
const edges = computed(() => fixedEdges([steps.value[0] !== null, steps.value[1] !== null, steps.value[2] !== null]))

const selectedId = computed(() => nodes.value.find((n) => n.selected)?.id as StepId | undefined)
const select = (id: StepId | undefined) => (nodes.value = nodes.value.map((n) => ({ ...n, selected: n.id === id })))
/** Never enlarged past 100%: four nodes shouldn't be blown up just because there's room. */
const FIT = { padding: { x: '48px', top: '104px', bottom: '64px' }, maxZoom: 1 } as const
const small = () => !window.matchMedia('(min-width: 1024px)').matches
function fit() {
  if (!small()) return flow.value?.fitView({ ...FIT, duration: 250 })
  // Phones: the whole chain, fitted to 390px, is too small to read. Show the selected step (or the
  // start of the chain) at a readable size instead, above the sheet when one is open; the rest
  // is a swipe away. Transform's sheet covers nearly all of it (editing comes first): leave it be.
  const ids = selectedId.value ? [selectedId.value] : ['record', 'console-in']
  // Above the sheet as it actually is (its height depends on its content), below the toolbar.
  const sheetTop = selectedId.value ? document.querySelector('aside[data-floating-surface]')?.getBoundingClientRect().top : undefined
  const bottom = sheetTop ? Math.round(innerHeight - sheetTop + 12) : 24
  const padding: Padding = { x: '24px', top: '80px', bottom: `${bottom}px` }
  return flow.value?.fitView({ nodes: ids.map((id) => ({ id })), padding, minZoom: 0.45, maxZoom: 0.9, duration: 250 })
}
function resetLayout() {
  nodes.value = resetPositions(nodes.value)
  nextTick(fit)
}

/** Record A's field names as typed (names only: the node shows its shape, not its data). */
const recordFields = computed(() => {
  const record = parsed.value
  if ('error' in record) return 'Its data isn’t valid JSON yet'
  const data = record.data
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return 'Its data isn’t an object'
  return Object.keys(data).join(', ') || 'No fields'
})

/** The step of runExperiment's result that belongs to a node (Record A has none). */
const stepOf = (id: StepId): Step => (id === 'record' ? null : steps.value[EXECUTION_ORDER.indexOf(id) - 1]!)

const views = computed<Record<StepId, StepView>>(() => {
  const outcome = (id: StepId): StepView['outcome'] => {
    const step = stepOf(id)
    if (!step) return { label: 'Not invoked', tone: 'none' }
    const kind = step.evidence.outcome.kind
    return { label: outcomeLabel(step.evidence.outcome), tone: kind === 'succeeded' ? 'ok' : kind === 'failed' ? 'bad' : 'warn' }
  }
  const variant = CONSOLES.find((c) => c.feature.id === consoleId.value)!
  const mapping = summarize(appliedMapping.value.properties)
  return {
    'record': {
      badge: stepBadge('record'), kind: 'Record · in memory', title: stepTitle('record'),
      lines: [definitionLabel(pin.value.ref), recordFields.value],
      more: 0, note: pinKey.value === 'a1' ? null : 'Pinned to a different Definition', outcome: null, stale: false,
    },
    'console-in': {
      badge: stepBadge('console-in'), kind: 'Feature', title: stepTitle('console-in'),
      lines: ['Shows what arrives and passes it on, unchanged'], more: 0,
      note: variant.feature.id === orbitConsole.id ? null : 'Misbehaving on purpose', outcome: outcome('console-in'), stale: stale.value,
    },
    'transform': {
      badge: stepBadge('transform'), kind: `Feature · Mapping v${config.value.mapping.version}`, title: stepTitle('transform'),
      lines: [`${definitionLabel(A1)} → ${label(config.value.output)}`, ...(mapping.lines.length ? mapping.lines : ['Makes nothing yet'])], more: mapping.more,
      note: plan.value.changes ? 'Unapplied changes. Runs use the applied versions' : null, outcome: outcome('transform'), stale: stale.value,
    },
    'console-out': {
      badge: stepBadge('console-out'), kind: 'Feature', title: stepTitle('console-out'),
      lines: ['Shows what Transform made'], more: 0, note: null, outcome: outcome('console-out'), stale: stale.value,
    },
  }
})

// --- The inspector and the focused editor ---
// Both float over the canvas, so opening or closing them never resizes it and never moves a node.
// The one deliberate exception: a step you select (or start editing) that would sit underneath is
// brought into view by panning, without zooming, on wide screens; on phones, where they're sheets,
// the selected step is fitted above the sheet.
const focus = ref<{ mode: 'mapping' | 'structure'; property: string | null } | null>(null)
const inspector = ref<HTMLElement>()
function openFocus(mode: 'mapping' | 'structure', property: string | null) {
  focus.value = { mode, property }
  nextTick(() => reveal('transform'))
}
function closeFocus() {
  focus.value = null
  nextTick(() => inspector.value?.querySelector<HTMLElement>('[data-open-editor]')?.focus())
}
function closeInspector() {
  const id = selectedId.value
  focus.value = null
  select(undefined)
  if (id) nextTick(() => document.querySelector<HTMLElement>(`.vue-flow__node[data-id="${id}"]`)?.focus())
}
/** Pans (never zooms) so the selected step isn't hidden under a floating surface. */
function reveal(id: StepId) {
  if (small() || !flow.value) return
  requestAnimationFrame(() => {
    const node = document.querySelector(`.vue-flow__node[data-id="${id}"]`)?.getBoundingClientRect()
    const surface = document.querySelector('[data-floating-surface]')?.getBoundingClientRect()
    if (!node || !surface || !flow.value) return
    const margin = 24
    const overlap = node.right + margin - surface.left
    if (overlap <= 0) return
    const shift = Math.min(overlap, node.left - margin)
    if (shift <= 0) return
    const viewport = flow.value.getViewport()
    flow.value.setViewport({ ...viewport, x: viewport.x - shift }, { duration: 300 })
  })
}
watch(selectedId, (id) => {
  if (id !== 'transform') focus.value = null
  if (!id) return
  if (small()) nextTick(() => requestAnimationFrame(() => fit()))
  else nextTick(() => reveal(id))
})
const panelTitle = computed(() => (selectedId.value ? views.value[selectedId.value] : null))
const runLabel = computed(() => `Run ${runNumber.value}${stale.value ? ' · the setup has changed since' : ''}`)
const descriptions: Record<StepId, string> = {
  'record': 'The in-memory Record the chain starts from.',
  'console-in': 'Shows what arrives, and passes it on unchanged.',
  'transform': 'Builds a new Value, property by property, from the one it receives.',
  'console-out': 'Shows what Transform made.',
}
const toolbarStatus = computed(() => ('error' in parsed.value ? 'Fix Record A’s data to run' : stale.value ? `Changed since run ${runNumber.value}` : `Up to date · run ${runNumber.value}`))
const showHint = ref(true)

const card = 'rounded-2xl bg-white p-4 ring-1 ring-slate-200/80'
const control = 'rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-xs outline-none transition focus:border-accent-500 focus:ring-2 focus:ring-accent-100'
</script>

<template>
  <div class="designer relative h-dvh overflow-hidden bg-slate-50">
    <!-- Orbit's distant orbits, far behind the canvas; they never move. -->
    <div class="pointer-events-none absolute inset-0 grid place-items-center" aria-hidden="true">
      <div class="size-[56rem] rounded-full border border-accent-100/60" />
      <div class="absolute size-[36rem] rounded-full border border-accent-secondary-100/50" />
    </div>

    <DesignerToolbar
      :status="toolbarStatus"
      :attention="plan.changes ? 'Transform has unapplied changes' : null"
      :can-run="!('error' in parsed)"
      @run="run"
      @start-over="startOver"
    />

    <div class="absolute inset-0">
      <ClientOnly>
        <VueFlow
          v-model:nodes="nodes"
          :edges="edges"
          :nodes-connectable="false"
          :edges-reconnectable="false"
          :edges-focusable="false"
          :delete-key-code="null"
          :selection-key-code="null"
          :multi-selection-key-code="null"
          :node-drag-threshold="6"
          :zoom-on-double-click="false"
          :min-zoom="0.3"
          :max-zoom="1.75"
          fit-view
          :fit-view-options="FIT"
          aria-label="The chain, as a canvas"
          @init="flow = $event"
          @nodes-initialized="small() && fit()"
        >
          <template #node-step="node">
            <StepNode
              :view="views[node.id as StepId]"
              :selected="node.selected"
              :first="node.id === EXECUTION_ORDER[0]"
              :last="node.id === EXECUTION_ORDER.at(-1)"
            />
          </template>
          <Background :gap="22" :size="1.2" pattern-color="#cbd5e1" />
          <Controls :show-interactive="false" position="bottom-left" :class="{ 'max-lg:hidden': selectedId }">
            <ControlButton title="Reset layout" aria-label="Reset layout" @click="resetLayout">
              <span aria-hidden="true" class="text-sm leading-none">↺</span>
            </ControlButton>
          </Controls>
          <Panel v-if="showHint" position="bottom-center" :class="{ 'max-lg:hidden': selectedId, 'lg:hidden': focus }">
            <p class="flex items-center gap-2 rounded-full border border-white/80 bg-white/75 py-1.5 pr-1.5 pl-4 text-xs text-slate-600 shadow-lg shadow-slate-900/[0.06] ring-1 ring-slate-900/5 backdrop-blur-md">
              The arrows and numbers are the order. Moving a step only changes the picture.
              <button type="button" class="grid size-7 place-items-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700" aria-label="Hide this hint" @click="showHint = false">✕</button>
            </p>
          </Panel>
        </VueFlow>
        <template #fallback>
          <p class="p-6 pt-24 text-sm text-slate-500">Loading the canvas…</p>
        </template>
      </ClientOnly>
    </div>

    <!-- The inspector: contextual, floating. Phones: a sheet with one scroll and a clear way back. -->
    <aside
      v-if="selectedId && panelTitle && !focus"
      ref="inspector"
      data-floating-surface
      :aria-label="`${panelTitle.title}: inspector`"
      class="fixed inset-x-0 bottom-0 z-20 flex animate-rise flex-col overflow-hidden rounded-t-3xl border border-slate-200/80 bg-white shadow-2xl shadow-slate-900/15 lg:absolute lg:inset-x-auto lg:top-4 lg:right-4 lg:w-[26rem] lg:rounded-3xl lg:shadow-xl lg:shadow-slate-900/10"
      :class="selectedId === 'transform' ? 'max-h-[75dvh] lg:bottom-4 lg:max-h-none' : 'max-h-[60dvh] lg:max-h-[calc(100%-2rem)]'"
      @keydown.escape="closeInspector"
    >
      <div class="mx-auto mt-2 h-1 w-10 rounded-full bg-slate-200 lg:hidden" aria-hidden="true" />
      <div class="flex items-start gap-3 px-5 pt-3 pb-3 lg:pt-4">
        <span class="mt-0.5 flex h-7 min-w-7 items-center justify-center rounded-full bg-accent-600 px-2 text-xs font-semibold text-white" aria-hidden="true">{{ panelTitle.badge }}</span>
        <div class="min-w-0 flex-1">
          <p class="text-xs text-slate-500">{{ panelTitle.kind }}</p>
          <h2 class="text-base font-semibold text-slate-900">{{ panelTitle.title }}</h2>
          <p class="mt-0.5 text-xs text-slate-500">{{ descriptions[selectedId] }}</p>
        </div>
        <button type="button" class="grid size-10 shrink-0 place-items-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500" :aria-label="`Close the ${panelTitle.title} inspector`" @click="closeInspector">✕</button>
      </div>

      <TransformInspector
        v-if="selectedId === 'transform'"
        :draft="draft"
        :config="config"
        :target="target"
        :plan="plan"
        :structure="structure"
        :review="review"
        :output="output"
        :example="example"
        :input="A1"
        :can-undo="history.length > 0"
        :step="stepOf('transform')"
        :stale="stale"
        :run-number="runNumber"
        :runs="runs"
        @update:draft="setDraft"
        @apply="apply"
        @discard="discard"
        @undo="undo"
        @focus="openFocus"
      />
      <div v-else class="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
        <section v-if="selectedId !== 'console-out'" aria-labelledby="setup-heading">
          <h3 id="setup-heading" class="text-sm font-semibold text-slate-900">Setup</h3>
          <p class="mt-0.5 text-xs text-slate-500">Changes take effect the next time you run.</p>

          <div v-if="selectedId === 'record'" class="mt-3">
            <label for="pin" class="block text-xs font-medium text-slate-600">Pinned to</label>
            <select id="pin" v-model="pinKey" :class="[control, 'mt-1 w-full']">
              <option v-for="p in PINS" :key="p.key" :value="p.key">{{ definitionLabel(p.ref) }}</option>
            </select>
            <p class="mt-1.5 text-xs text-slate-500">
              {{ pin.note }}
              <span class="font-mono text-slate-600">{{ shapeOf(DEFINITIONS.find((d) => d.id === pin.ref.id && d.version === pin.ref.version)!) }}</span>
            </p>
            <label for="record-data" class="mt-4 block text-xs font-medium text-slate-600">Data</label>
            <textarea id="record-data" v-model="recordText" rows="5" spellcheck="false" autocomplete="off" :aria-invalid="'error' in parsed" aria-describedby="record-data-hint" class="field font-mono text-sm" />
            <p id="record-data-hint" class="mt-2 text-xs" :class="'error' in parsed ? 'text-red-700' : 'text-slate-500'" aria-live="polite">
              {{ 'error' in parsed ? parsed.error : 'Edit freely, even into something its Definition wouldn’t allow, to see what the boundary does.' }}
            </p>
          </div>

          <div v-else-if="selectedId === 'console-in'" :class="[card, 'mt-3']">
            <label for="console-variant" class="block text-xs font-medium text-slate-600">Misbehave on purpose: run this Console instead</label>
            <select id="console-variant" v-model="consoleId" :class="[control, 'mt-1 w-full']">
              <option v-for="c in CONSOLES" :key="c.feature.id" :value="c.feature.id">{{ c.label }}</option>
            </select>
          </div>
        </section>

        <!-- What happened: read-only, from an actual run. -->
        <section aria-labelledby="run-heading" class="mt-5 rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200/70" :class="{ 'mt-0': selectedId === 'console-out' }">
          <div class="flex flex-wrap items-baseline justify-between gap-2">
            <h3 id="run-heading" class="text-sm font-semibold text-slate-900">What happened</h3>
            <p class="text-xs text-slate-500">{{ runLabel }}</p>
          </div>
          <p v-if="selectedId === 'record'" class="mt-2 text-sm text-slate-600">
            Record A isn’t a Feature, so it never runs. Step 1 read it; select step 1 to see what it observed.
          </p>
          <RunResult v-else :step="stepOf(selectedId)" :stale="stale" pass-through :label="label" />
        </section>
      </div>
    </aside>

    <!-- The focused editor: the inspector, grown. Wide screens leave the canvas (and the selected
         step) in view on the left; phones get the whole screen, with Done as the way back. -->
    <section
      v-if="focus && selectedId === 'transform'"
      data-floating-surface
      aria-label="Transform: focused editor"
      class="fixed inset-0 z-30 flex animate-rise flex-col overflow-hidden bg-white lg:absolute lg:inset-auto lg:top-4 lg:right-4 lg:bottom-4 lg:left-[max(1rem,calc(100%-68rem))] lg:rounded-3xl lg:border lg:border-slate-200/80 lg:shadow-2xl lg:shadow-slate-900/15"
    >
      <FocusEditor
        :draft="draft"
        :config="config"
        :target="target"
        :plan="plan"
        :structure="structure"
        :review="review"
        :output="output"
        :example="example"
        :input="A1"
        :can-undo="history.length > 0"
        :mode="focus.mode"
        :property="focus.property"
        @update:draft="setDraft"
        @update:mode="focus = { ...focus!, mode: $event }"
        @update:property="focus = { ...focus!, property: $event }"
        @apply="apply"
        @discard="discard"
        @undo="undo"
        @close="closeFocus"
      />
    </section>
  </div>
</template>

<style>
/* The canvas library's defaults, toned to Orbit. Handles are anchors for the fixed arrows only. */
.designer .vue-flow__handle { opacity: 0; pointer-events: none; }
.designer .vue-flow__node-step { border: 0; background: transparent; padding: 0; }
.designer .designer-edge .vue-flow__edge-path { stroke: var(--color-slate-400); stroke-width: 2; }
.designer .designer-edge--unused .vue-flow__edge-path { stroke: var(--color-slate-300); stroke-dasharray: 6 6; }
.designer .vue-flow__node.selected .vue-flow__edge-path { stroke: var(--color-accent-400); }
/* Zoom controls: the same floating glass as Orbit's navigation. */
.designer .vue-flow__controls {
  overflow: hidden; border-radius: 1.25rem; border: 1px solid rgb(255 255 255 / 0.8); padding: 0.25rem;
  background: rgb(255 255 255 / 0.75); backdrop-filter: blur(12px);
  box-shadow: 0 10px 15px -3px rgb(15 23 42 / 0.06), 0 0 0 1px rgb(15 23 42 / 0.05);
}
.designer .vue-flow__controls-button { width: 2.25rem; height: 2.25rem; border: 0; border-radius: 0.875rem; background: transparent; color: var(--color-slate-600); }
.designer .vue-flow__controls-button:hover { background: var(--color-accent-50); color: var(--color-accent-700); }
.designer .vue-flow__controls-button:focus-visible { outline: 2px solid var(--color-accent-500); outline-offset: -2px; }
.designer .vue-flow__attribution { background: transparent; color: var(--color-slate-400); }
/* Touch: nothing essential smaller than a fingertip. Checkboxes and radios are tapped by their labels. */
@media (pointer: coarse) {
  .designer :is(button, select, input[type="text"], input[type="number"], a[role="menuitem"]):not([data-action="insert"]) { min-height: 2.5rem; }
  .designer [data-action="insert"] { min-height: 1.75rem; top: -1rem; }
}
</style>
