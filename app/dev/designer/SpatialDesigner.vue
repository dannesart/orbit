<script setup lang="ts">
// Experiment #2: the Feature playground's chain on a canvas. Disposable: it exists to find out
// whether a spatial view makes Orbit better, not to become the workflow designer.
//
// Development and Deploy Previews only (registered by nuxt.config.ts, like /dev/features). It runs
// the same in-memory experiment as the list playground: same fixtures, same runExperiment, same
// editors. Nothing is fetched, saved or logged, and the layout isn't kept either.
//
// Execution order comes from graph.ts alone. Positions are only where nodes are drawn.
import { Background, Controls, Panel, VueFlow, type Node, type Padding, type VueFlowInstance } from '@xyflow/vue'
import '@xyflow/vue/dist/style.css'
import type { Data } from '#shared/features/definitions'
import type { Mapping } from '#shared/features/mappings'
import { orbitConsole } from '#shared/features/features'
import {
  A1, B1, CONSOLES, DEFINITIONS, INITIAL_DATA, INITIAL_MAPPING, PINS, RECORD_ID, WORKSPACE, type Step,
  definitionLabel, outcomeLabel, parseRecordData, runExperiment, shapeOf,
} from '../features/experiment'
import StepResult from '../features/StepResult.vue'
import TransformPanel from './TransformPanel.vue'
import StepNode, { type StepView } from './StepNode.vue'
import { EXECUTION_ORDER, type StepId, fixedEdges, initialNodes, resetPositions, stepBadge, stepTitle } from './graph'
import { summarize } from './summary'
import { type DraftProperty, fromDraft, toDraft } from './parts'
import { exampleFrom, previewOutput, reviewDraft } from './preview'
import { applyDraft, unapplied } from './versions'

useHead({ title: 'Spatial designer (experiment) · Orbit' })

// --- The experiment's state: as on the list playground (FeaturePlayground.vue), except that the
// Mapping is edited as a draft and only Apply makes a new version (Experiment #3) ---
const pinKey = ref('a1')
const recordText = ref(JSON.stringify(INITIAL_DATA, null, 2))
const consoleId = ref(orbitConsole.id)
const versions = shallowRef<readonly Mapping[]>([INITIAL_MAPPING])
const steps = shallowRef<[Step, Step, Step]>([null, null, null])
const ranWith = ref('')
const runNumber = ref(0)

const pin = computed(() => PINS.find((p) => p.key === pinKey.value)!)
const parsed = computed(() => parseRecordData(recordText.value))
const latest = computed(() => versions.value.at(-1)!)
// What a run depends on. The draft isn't part of it: runs use the applied version.
const snapshot = computed(() => JSON.stringify([pinKey.value, recordText.value, consoleId.value, latest.value.version]))
const stale = computed(() => snapshot.value !== ranWith.value)

// --- The Mapping draft: edited freely, previewed, and only applied on purpose ---
const draft = shallowRef<DraftProperty[]>(toDraft(INITIAL_MAPPING.properties))
const history = shallowRef<DraftProperty[][]>([])
let lastEdit = 0
/** Every change to the draft can be undone. Typing in one box counts as one change. */
function setDraft(next: DraftProperty[], coalesce = true) {
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
const draftProperties = computed(() => fromDraft(draft.value))
const draftChanged = computed(() => unapplied(draftProperties.value, latest.value))
const example = computed(() => exampleFrom(recordText.value, A1))
const review = computed(() => reviewDraft(draftProperties.value, A1, B1))
const output = computed(() => previewOutput(draftProperties.value, A1, B1, example.value))
/** The only place a Mapping version is made. Normally only a sound draft; "anyway" is the playground's boundary test. */
function apply(anyway: boolean) {
  if (!draftChanged.value || (!anyway && review.value.problems.length)) return
  versions.value = applyDraft(versions.value, draftProperties.value)
  setDraft(toDraft(latest.value.properties), false)
}
const discard = () => setDraft(toDraft(latest.value.properties), false)

function run() {
  const record = parsed.value
  if ('error' in record) return
  // Runs use the last applied Mapping version. Running never makes one (only apply does).
  steps.value = runExperiment(
    {
      definitions: DEFINITIONS,
      records: [{ id: RECORD_ID, workspaceId: WORKSPACE, definition: pin.value.ref, data: record.data as Data }],
      mappings: versions.value,
    },
    { console: CONSOLES.find((c) => c.feature.id === consoleId.value)!.feature, mapping: { id: latest.value.id, version: latest.value.version } },
  )
  ranWith.value = snapshot.value
  runNumber.value++
}

function startOver() {
  pinKey.value = 'a1'
  recordText.value = JSON.stringify(INITIAL_DATA, null, 2)
  consoleId.value = orbitConsole.id
  setDraft(toDraft(INITIAL_MAPPING.properties), false)
}

run()

// --- The canvas ---
const nodes = ref<Node[]>(initialNodes())
const flow = shallowRef<VueFlowInstance>()
const edges = computed(() => fixedEdges([steps.value[0] !== null, steps.value[1] !== null, steps.value[2] !== null]))

const selectedId = computed(() => nodes.value.find((n) => n.selected)?.id as StepId | undefined)
const select = (id: StepId | undefined) => (nodes.value = nodes.value.map((n) => ({ ...n, selected: n.id === id })))
/** Never enlarged past 100%: four nodes shouldn't be blown up just because there's room. */
const FIT = { padding: '48px', maxZoom: 1 } as const
const small = () => !window.matchMedia('(min-width: 1024px)').matches
function fit() {
  if (!small()) return flow.value?.fitView({ ...FIT, duration: 250 })
  // Phones: the whole chain, fitted to 390px, is too small to read. Show the selected step (or the
  // start of the chain) at a readable size instead, above the sheet when one is open; the rest
  // is a swipe away. Transform's sheet covers nearly all of it (editing comes first): leave it be.
  if (selectedId.value === 'transform') return
  const ids = selectedId.value ? [selectedId.value] : ['record', 'console-in']
  const padding: Padding = selectedId.value ? { x: '24px', top: '24px', bottom: `${Math.round(innerHeight * 0.72)}px` } : '24px'
  return flow.value?.fitView({ nodes: ids.map((id) => ({ id })), padding, minZoom: 0.6, maxZoom: 0.9, duration: 250 })
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
  const mapping = summarize(latest.value.properties)
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
      badge: stepBadge('transform'), kind: `Feature · Mapping v${latest.value.version}`, title: stepTitle('transform'),
      lines: [`${definitionLabel(A1)} → ${definitionLabel(B1)}`, ...(mapping.lines.length ? mapping.lines : ['Makes nothing yet'])], more: mapping.more,
      note: draftChanged.value ? `Unapplied changes. Runs use v${latest.value.version}` : null, outcome: outcome('transform'), stale: stale.value,
    },
    'console-out': {
      badge: stepBadge('console-out'), kind: 'Feature', title: stepTitle('console-out'),
      lines: ['Shows what Transform made'], more: 0, note: null, outcome: outcome('console-out'), stale: stale.value,
    },
  }
})

// --- The panel ---
// Opening or closing the panel resizes the canvas. Refit then, or steps end up hidden behind the
// panel. (Switching between steps keeps the view: only the canvas's size triggers this.)
const panelWidth = computed(() => (!selectedId.value ? 'closed' : 'open'))
watch(panelWidth, () => setTimeout(fit, 60))
// On phones the sheet covers most of the canvas, so each newly selected step is brought into view.
// Not for Transform: its sheet takes nearly the whole screen, because editing matters more there.
watch(selectedId, (id, before) => { if (id && before && id !== 'transform' && small()) fit() })
const panelTitle = computed(() => (selectedId.value ? views.value[selectedId.value] : null))
const runLabel = computed(() => `Run ${runNumber.value}${stale.value ? ' · the setup has changed since' : ''}`)

const card = 'rounded-2xl border border-slate-200 bg-white p-4'
const control = 'rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-900 shadow-xs outline-none transition focus:border-accent-500 focus:ring-2 focus:ring-accent-100'
</script>

<template>
  <div class="designer flex h-dvh flex-col bg-slate-50">
    <header class="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
      <div class="mr-auto min-w-0">
        <p class="text-xs font-semibold tracking-wide text-accent-700 uppercase">Experiment · not in production</p>
        <h1 class="text-lg font-semibold tracking-tight text-slate-900">Spatial designer</h1>
      </div>
      <button type="button" class="btn-primary w-auto px-5" :disabled="'error' in parsed" @click="run">Run</button>
      <p class="text-sm text-slate-500" aria-live="polite">
        {{ 'error' in parsed ? 'Fix Record A’s JSON to run.' : stale ? 'Changed since run ' + runNumber + '.' : 'Up to date · run ' + runNumber + '.' }}
        <span v-if="draftChanged" class="font-medium text-amber-800">Transform has unapplied changes.</span>
      </p>
      <button type="button" class="link text-sm" @click="startOver">Start over</button>
      <NuxtLink to="/dev/features" class="link text-sm">List view</NuxtLink>
    </header>

    <div class="relative flex min-h-0 flex-1">
      <div class="relative min-w-0 flex-1">
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
            <Background :gap="20" />
            <Controls :show-interactive="false" position="bottom-left" />
            <Panel position="top-left" :class="{ 'max-lg:hidden': selectedId }" class="pointer-events-none max-w-[calc(100%-9rem)] rounded-xl bg-white/85 px-3 py-2 text-xs text-slate-600 shadow-sm ring-1 ring-slate-200 backdrop-blur sm:max-w-xs">
              The arrows and numbers are the order. Moving a step only changes the picture.
              <span class="hidden sm:inline">Select a step to set it up or see what it did.</span>
            </Panel>
            <Panel position="top-right" :class="{ 'max-lg:hidden': selectedId }">
              <button type="button" class="pointer-events-auto rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50" @click="resetLayout">
                Reset layout
              </button>
            </Panel>
          </VueFlow>
          <template #fallback>
            <p class="p-6 text-sm text-slate-500">Loading the canvas…</p>
          </template>
        </ClientOnly>
      </div>

      <!-- Configuration and inspection for the selected step. Wide screens: beside the canvas.
           Small screens: a sheet over the lower part of it, so the canvas stays in view. -->
      <aside
        v-if="selectedId && panelTitle"
        :aria-label="`${panelTitle.title}: setup and what happened`"
        class="fixed inset-x-0 bottom-0 z-20 flex flex-col overflow-hidden rounded-t-3xl border-t border-slate-200 bg-white shadow-2xl lg:static lg:z-auto lg:max-h-none lg:shrink-0 lg:rounded-none lg:border-t-0 lg:border-l lg:shadow-none"
        :class="selectedId === 'transform' ? 'h-[92dvh] lg:h-auto lg:w-[30rem]' : 'max-h-[72dvh] lg:w-[28rem]'"
        @keydown.escape="select(undefined)"
      >
        <div class="flex items-center gap-2 border-b border-slate-200 px-5 py-3">
          <span class="flex h-6 min-w-6 items-center justify-center rounded-full bg-accent-600 px-1.5 text-xs font-semibold text-white">{{ panelTitle.badge }}</span>
          <h2 class="mr-auto text-base font-semibold text-slate-900">{{ panelTitle.title }}</h2>
          <button type="button" class="link text-sm" @click="select(undefined)">Close</button>
        </div>

        <TransformPanel
          v-if="selectedId === 'transform'"
          :draft="draft"
          :review="review"
          :output="output"
          :example="example"
          :input="A1"
          :target="B1"
          :latest="latest"
          :changed="draftChanged"
          :can-undo="history.length > 0"
          :step="stepOf('transform')"
          :stale="stale"
          :run-number="runNumber"
          @update:draft="setDraft"
          @apply="apply"
          @discard="discard"
          @undo="undo"
        />
        <div v-else class="min-h-0 flex-1 overflow-y-auto">
          <!-- Setup: what you can change. Takes effect on the next run. -->
          <section aria-labelledby="setup-heading" class="px-5 py-5">
            <h3 id="setup-heading" class="text-sm font-semibold text-slate-900">Setup</h3>
            <p class="mt-0.5 text-xs text-slate-500">Changes take effect the next time you run.</p>

            <div v-if="selectedId === 'record'" class="mt-4">
              <label for="pin" class="block text-sm font-medium text-slate-700">Pinned to</label>
              <select id="pin" v-model="pinKey" :class="[control, 'mt-1.5 w-full']">
                <option v-for="p in PINS" :key="p.key" :value="p.key">{{ definitionLabel(p.ref) }}</option>
              </select>
              <p class="mt-1.5 text-sm text-slate-500">
                {{ pin.note }}
                <span class="font-mono text-xs text-slate-600">{{ shapeOf(DEFINITIONS.find((d) => d.id === pin.ref.id && d.version === pin.ref.version)!) }}</span>
              </p>
              <label for="record-data" class="mt-5 block text-sm font-medium text-slate-700">Data</label>
              <textarea id="record-data" v-model="recordText" rows="5" spellcheck="false" autocomplete="off" :aria-invalid="'error' in parsed" aria-describedby="record-data-hint" class="field font-mono text-sm" />
              <p id="record-data-hint" class="mt-2 text-sm" :class="'error' in parsed ? 'text-red-700' : 'text-slate-500'" aria-live="polite">
                {{ 'error' in parsed ? parsed.error : 'Edit freely, even into something its Definition wouldn’t allow, to see what the boundary does.' }}
              </p>
            </div>

            <div v-else-if="selectedId === 'console-in'" :class="[card, 'mt-4']">
              <p class="text-sm text-slate-700">Shows what it receives and passes it on, unchanged. Nothing to configure for real use.</p>
              <label for="console-variant" class="mt-4 block text-sm font-medium text-slate-700">Misbehave on purpose: run this Console instead</label>
              <select id="console-variant" v-model="consoleId" :class="[control, 'mt-1.5 w-full']">
                <option v-for="c in CONSOLES" :key="c.feature.id" :value="c.feature.id">{{ c.label }}</option>
              </select>
            </div>

            <div v-else :class="[card, 'mt-4']">
              <p class="text-sm text-slate-700">Nothing to set up. It shows whatever Transform handed on.</p>
            </div>
          </section>

          <!-- What happened: read-only, from an actual run. -->
          <section aria-labelledby="run-heading" class="border-t border-slate-200 bg-slate-50 px-5 py-5">
            <div class="flex flex-wrap items-baseline justify-between gap-2">
              <h3 id="run-heading" class="text-sm font-semibold text-slate-900">What happened</h3>
              <p class="text-xs text-slate-500">{{ runLabel }}</p>
            </div>
            <p v-if="selectedId === 'record'" class="mt-3 text-sm text-slate-600">
              Record A isn’t a Feature, so it never runs. Step 1 read it; open step 1 to see what it observed.
            </p>
            <StepResult v-else :step="stepOf(selectedId)" :stale="stale" pass-through />
          </section>
        </div>
      </aside>
    </div>
  </div>
</template>

<style>
/* The canvas library's defaults, toned to Orbit. Handles are anchors for the fixed arrows only. */
.designer .vue-flow__handle { opacity: 0; pointer-events: none; }
.designer .vue-flow__node-step { border: 0; background: transparent; padding: 0; }
.designer .designer-edge .vue-flow__edge-path { stroke: var(--color-slate-400); stroke-width: 2; }
.designer .designer-edge--unused .vue-flow__edge-path { stroke: var(--color-slate-300); stroke-dasharray: 6 6; }
.designer .vue-flow__controls { box-shadow: 0 1px 3px rgb(15 23 42 / 0.12); border-radius: 0.75rem; overflow: hidden; }
</style>
