<script setup lang="ts">
// Experiment #2: the Feature playground's chain on a canvas. Disposable: it exists to find out
// whether a spatial view makes Orbit better, not to become the workflow designer.
// Experiment #5: the same Designer in Orbit's own design language: a floating toolbar, a floating
// inspector for understanding a step. Editing the Transform's Mapping is Mapping Studio's.
//
// Development and Deploy Previews only (registered by nuxt.config.ts, like /dev/features). It runs
// the same in-memory experiment as the list playground: same fixtures, same boundary (invoke), same
// editors. Nothing is fetched, saved or logged, and the layout isn't kept either.
//
// Experiment #8: the arrows mean something. Connections (flow.ts) decide which steps run and in
// what order; they're made, moved and removed on the canvas, and checked against the Features'
// own contracts. Positions are only where nodes are drawn.
import {
  Background, type Connection as FlowConnection, type ConnectEndEvent, ControlButton, Controls, type EdgeReconnectEndEvent,
  type EdgeChangeset, type EdgeReconnectEvent, Panel, VueFlow, type Node, type Padding, type VueFlowInstance,
} from '@xyflow/vue'
import '@xyflow/vue/dist/style.css'
import type { Data, DefinitionRef } from '#shared/features/definitions'
import type { FeatureRef } from '#shared/features/features'
import {
  A1, CONSOLES, DEFINITIONS, INITIAL_DATA, PINS, RECORD_ID, TRANSFORMS, WORKSPACE, type Step,
  definitionLabel, featureKey, featureVersionWords, outcomeLabel, parseRecordData, shapeOf,
} from '../features/experiment'
import RunResult from './RunResult.vue'
import DesignerToolbar from './DesignerToolbar.vue'
import LeaveDialog from './LeaveDialog.vue'
import { draftLoses, workAtRisk } from './session'
import { appliedPreview, applyDraft, transformView } from './view'
import { lastWorkspace, shelfOf } from '../definitions/store'
import { DESIGNER_WORKSPACE, designerWorkspace, offeredIn, placeIn, requestedOutput, runsIn as workspaceIn } from '../definitions/designer'
import FeatureVersions, { type VersionChoice } from './FeatureVersions.vue'
import MappingStudio from './MappingStudio.vue'
import type { AppliedPreview, StudioOpening } from './studio'
import TransformInspector from './TransformInspector.vue'
import StepNode, { type StepView } from './StepNode.vue'
import { drawEdges, initialNodes, nodeLabel, resetPositions } from './graph'
import {
  type Connection, type Contracts, type FeatureStep, type FlowRun, INITIAL_CONNECTIONS, INITIAL_STEP_FEATURES, type StepFeatures, type StepId, checkConnection, connectionKey,
  connectionProblems, flowOutcome, pathOf, runFlow, stepBadge, stepTitle,
} from './flow'
import { summarize } from './summary'
import { READING, readingOf } from './reading'
import { reconcile } from './switching'
import {
  type ApplyContext, type Configuration, type RunRecord, type TransformDraft, allDefinitions, draftFrom, findMapping, inputIn, scopeOf,
  initialConfiguration, labelOf, outputOf,
} from './config'

// The page's title follows where you are (Mapping Studio, below).

// --- The experiment's state: as on the list playground (FeaturePlayground.vue), except that the
// Transform's configuration (its output Definition and its Mapping) is edited as a draft and only
// Apply makes versions (Experiments #3 and #4) ---
const pinKey = ref('a1')
const recordText = ref(JSON.stringify(INITIAL_DATA, null, 2))
// The exact Feature version each step invokes (featureKey). Each changes only when someone picks another.
const stepFeatures = ref<Record<FeatureStep, string>>({ ...INITIAL_STEP_FEATURES })
const consoleOf = (key: string) => CONSOLES.find((c) => featureKey(c.feature) === key)!
const transformOf = (key: string) => TRANSFORMS.find((t) => featureKey(t.feature) === key)!
const features = computed<StepFeatures>(() => ({
  'console-in': consoleOf(stepFeatures.value['console-in']).feature,
  'transform': transformOf(stepFeatures.value.transform).feature,
  'console-out': consoleOf(stepFeatures.value['console-out']).feature,
}))
const featureWords = (step: FeatureStep) => (step === 'transform' ? transformOf(stepFeatures.value.transform) : consoleOf(stepFeatures.value[step])).label
// Experiment #7: the workspace this Designer works in (when opened from one of its pages in this
// tab), and the Definition versions it may use besides its samples: those made there, and those
// Orbit provides. Fixed for this visit; Definitions are made in their own place, not here.
const workspace = designerWorkspace(safeDestination(useRoute().query.back), lastWorkspace())
provide(DESIGNER_WORKSPACE, workspace)
const offered = offeredIn(workspace, workspace ? shelfOf(workspace.id).made : [])
const runsIn = workspaceIn(workspace)
const requested = requestedOutput(useRoute().query.output, offered)
const config = shallowRef<Configuration>(initialConfiguration(offered))
/** The design's connections: which step hands on to which. Only Record A's path runs. */
const connections = shallowRef<readonly Connection[]>(INITIAL_CONNECTIONS)
const shown = shallowRef<FlowRun>({ path: [], steps: {} })
const runs = shallowRef<RunRecord[]>([])
const ranWith = ref('')
const runNumber = ref(0)

const pin = computed(() => PINS.find((p) => p.key === pinKey.value)!)
const parsed = computed(() => parseRecordData(recordText.value))
const appliedMapping = computed(() => findMapping(config.value, config.value.mapping)!)
const label = (ref: DefinitionRef) => labelOf(config.value, ref)
/**
 * Exactly the version named, as a run in this workspace resolves it (scopeOf: the boundary's own
 * resolver, over the versions runs here use). Apply, the preview and runs all resolve this way.
 */
const scope = computed(() => scopeOf(config.value, runsIn))
const resolve = (ref: DefinitionRef) => scope.value.resolve(ref)
/** The contracts connections are judged by: Record A's pinned Definition and the applied Mapping's. */
const contracts = computed<Contracts>(() => ({
  record: pin.value.ref,
  transform: { reads: appliedMapping.value.from, makes: appliedMapping.value.to },
  definitions: allDefinitions(config.value),
  label,
  features: features.value,
  featureLabel: featureWords,
}))
const path = computed(() => pathOf(connections.value))
const problems = computed(() => connectionProblems(connections.value, contracts.value))
// What a run depends on. The draft isn't part of it: runs use the applied versions.
const snapshot = computed(() => JSON.stringify([pinKey.value, recordText.value, stepFeatures.value, config.value.mapping, connections.value.map(connectionKey)]))
const stale = computed(() => snapshot.value !== ranWith.value)

// --- The draft: edited freely, previewed, and only applied on purpose ---
// "Use in the Designer" asks for one exact version: it starts as the draft's output, unapplied.
const draft = shallowRef<TransformDraft>(requested ? requestedDraft(requested) : draftFrom(config.value))
/** The requested version as the draft's output, with only the mappings that fit it (switching.ts). */
function requestedDraft(output: DefinitionRef): TransformDraft {
  const next: TransformDraft = { ...draftFrom(config.value), use: 'catalogue', catalogue: output }
  // At setup, before the review exists: read as the step's Transform version reads.
  return reconcile(next, inputIn(next, scope.value).definition, outputOf(config.value, next, scope.value).definition, readingOf(features.value.transform, resolve))
}
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
/**
 * Whether the draft may be applied, and why not: the one authoritative assessment (config.ts), made
 * with the Transform version this step invokes. Every surface's review, problems and Apply
 * availability come from it, and Apply itself enforces it again (applyConfiguration).
 */
const step = computed<ApplyContext>(() => ({ feature: features.value.transform, workspaceId: runsIn }))
/** Everything the inspector and Mapping Studio show, derived in one place (view.ts). */
const view = computed(() => transformView(config.value, draft.value, step.value, recordText.value))
const assessment = computed(() => view.value.assessment)
const target = computed(() => view.value.target)
const structure = computed(() => view.value.structure)
/** What the draft reads: Definition A · v1 unless another was chosen in Structure. */
const input = computed(() => view.value.input)
// Review, preview and the source picker follow the Transform version this step invokes.
provide(READING, computed(() => view.value.reading))
const example = computed(() => view.value.example)
const review = computed(() => view.value.review)
const output = computed(() => view.value.output)
/**
 * The applied Mapping, previewed the same way with the same Record A (Mapping Studio's Preview
 * shows it beside the draft's). A preview, never a run: runs are what made the evidence.
 */
const applied = computed<AppliedPreview>(() => appliedPreview(config.value, step.value, recordText.value))
const plan = computed(() => view.value.plan)
/** What the step's Transform version refuses of the complete draft (its pre-run check), in words. */
const boundary = computed(() => view.value.boundary)
/**
 * Apply, from every surface: the authoritative operation decides (view.ts, applyDraft), with the same
 * assessment every surface shows. A refused draft changes nothing: the applied configuration, its
 * versions and the draft stay as they are.
 */
function apply() {
  const next = applyDraft(config.value, draft.value, step.value)
  if (!next) return
  config.value = next.config
  setDraft(next.draft, false)
}

// Discard and Start over reset the draft on purpose. When that would lose work someone wrote
// (session.ts, draftLoses), they ask first, with the same dialog as leaving; otherwise they just
// happen. Either way the draft's reset can be undone.
interface Reset { readonly title: string; readonly intro: string; readonly confirm: string; readonly losing: readonly string[]; readonly act: () => void }
const resetting = shallowRef<Reset | null>(null)
function resetAfterAsking(reset: Reset) {
  if (reset.losing.length) resetting.value = reset
  else reset.act()
}
function confirmReset() {
  const act = resetting.value?.act
  resetting.value = null
  act?.()
}
function discard() {
  const to = draftFrom(config.value)
  resetAfterAsking({
    title: 'Discard your changes?', intro: 'The Transform goes back to what’s applied. Discarding forgets:', confirm: 'Discard',
    losing: draftLoses(draft.value, to, config.value.mappings), act: () => setDraft(to, false),
  })
}

/** A run needs something to run: Record A has to hand on to a step. */
const canRun = computed(() => !('error' in parsed.value) && path.value.length > 1)
function run() {
  const record = parsed.value
  if ('error' in record || !canRun.value) return
  // Runs use the applied versions only. Running never makes one (only apply does). What runs is
  // Record A's path through the connections, and nothing else on the canvas.
  const applied = config.value
  shown.value = runFlow(
    placeIn({
      definitions: allDefinitions(applied),
      records: [{ id: RECORD_ID, workspaceId: WORKSPACE, definition: pin.value.ref, data: record.data as Data }],
      mappings: applied.mappings,
    }, runsIn),
    connections.value,
    { features: features.value, mapping: applied.mapping, workspaceId: runsIn },
  )
  ranWith.value = snapshot.value
  runNumber.value++
  const evidence = shown.value.steps.transform?.evidence
  const used = evidence?.mapping ? findMapping(applied, evidence.mapping) : null
  runs.value = [...runs.value, Object.freeze({ number: runNumber.value, outcome: evidence?.outcome ?? null, feature: evidence?.feature ?? null, mapping: evidence?.mapping ?? null, output: used?.to ?? null, path: shown.value.path })]
}

const connectionsChanged = computed(() => connections.value.map(connectionKey).join() !== INITIAL_CONNECTIONS.map(connectionKey).join())
function startOver() {
  const to = { ...draftFrom(initialConfiguration(offered)), local: draft.value.local }
  const record = recordText.value !== JSON.stringify(INITIAL_DATA, null, 2) || pinKey.value !== 'a1' ? ['Your edits to Record A'] : []
  const versions = JSON.stringify(stepFeatures.value) !== JSON.stringify(INITIAL_STEP_FEATURES) ? ['The Feature versions you chose for its steps'] : []
  resetAfterAsking({
    title: 'Start over?', intro: 'Record A, the Console, the connections and the Transform’s draft go back to how they started. Applied versions stay. Starting over forgets:', confirm: 'Start over',
    losing: [...record, ...versions, ...(connectionsChanged.value ? ['Your connections'] : []), ...draftLoses(draft.value, to)],
    act: () => {
      pinKey.value = 'a1'
      recordText.value = JSON.stringify(INITIAL_DATA, null, 2)
      stepFeatures.value = { ...INITIAL_STEP_FEATURES }
      connections.value = INITIAL_CONNECTIONS
      setDraft(to, false)
    },
  })
}

run()

// --- The canvas ---
const nodes = ref<Node[]>(initialNodes(path.value))
const flow = shallowRef<VueFlowInstance>()
/** The arrow that's selected (to remove with Delete), kept here: the arrows are drawn from the connections. */
const selectedEdge = ref<string | null>(null)
const edges = computed(() => drawEdges(connections.value, shown.value, problems.value).map((e) => ({ ...e, selected: e.id === selectedEdge.value })))
// A node's name says its place on the path, which follows the connections.
watch(path, (p) => (nodes.value = nodes.value.map((n) => ({ ...n, ariaLabel: nodeLabel(n.id as StepId, p) }))))

// Connecting, moving a connection's end, and disconnecting. Each is checked (flow.ts) before it
// changes anything; a refusal says why, briefly, where the hint sits. Nothing else changes: no
// contract, Mapping or configuration is touched by connecting or disconnecting.
const refusal = ref<string | null>(null)
let refusalTimer: ReturnType<typeof setTimeout> | undefined
function refuse(reason: string) {
  refusal.value = reason
  clearTimeout(refusalTimer)
  refusalTimer = setTimeout(() => (refusal.value = null), 6000)
}
onBeforeUnmount(() => clearTimeout(refusalTimer))
const connecting = ref(false)
/**
 * How forgiving a grab is, kept about the same on screen at any zoom (the canvas library measures
 * in canvas units, which shrink as you zoom out): a dot answers about 32px around it, and a dragged
 * connection snaps to a dot within ~32px. An arrow's end answers up to ~36px out from where it meets
 * its step, but never more than 40 canvas units, so the two ends of an arrow between steps at their
 * usual spacing (80 apart) never overlap.
 */
const zoom = ref(1)
const grip = computed(() => {
  const z = zoom.value
  return {
    dot: Math.min(30, Math.max(6, (32 / z - 6) / 2)),
    arrowEnd: Math.min(20, Math.max(14, 18 / z)),
    snap: Math.min(80, Math.max(28, 32 / z)),
  }
})
/** The connection whose end is being moved, if any: it doesn't count against its own new place. */
let moving: Connection | undefined
const asConnection = (c: { source: string; target: string }): Connection => ({ source: c.source as StepId, target: c.target as StepId })
const verdict = (c: Connection) => checkConnection(connections.value, c, contracts.value, moving)
/**
 * For the canvas library, which also asks about the arrows it's given: an existing connection is
 * always drawn (one that stopped fitting is drawn as a problem, never hidden); a new one must fit.
 */
const isValidConnection = (c: { source: string; target: string }) =>
  connections.value.some((x) => connectionKey(x) === connectionKey(asConnection(c))) || verdict(asConnection(c)).ok

function connect(c: FlowConnection) {
  const candidate = asConnection(c)
  if (connections.value.some((x) => connectionKey(x) === connectionKey(candidate))) return
  const result = verdict(candidate)
  if (result.ok) connections.value = [...connections.value, candidate]
  else refuse(result.reason)
}
/** The step under where a gesture ended, if any (a drop anywhere on a step counts, not only on its dot). */
function stepAt(event: MouseEvent | TouchEvent): StepId | undefined {
  const point = 'changedTouches' in event ? event.changedTouches[0] : event
  if (!point) return undefined
  return document.elementFromPoint(point.clientX, point.clientY)?.closest<HTMLElement>('.vue-flow__node')?.dataset.id as StepId | undefined
}
/**
 * A connection dropped on a step: made if it fits (when it wasn't already), or refused with why.
 * The library also ends a moved arrow's end here, just before reconnectEnd. That one is left to
 * reconnectEnd: taken here as well, the connection being moved would be added a second time.
 */
function connectEnd({ event, connectionState }: ConnectEndEvent) {
  connecting.value = false
  if (moving) return
  if (connectionState.isValid || !connectionState.fromNode || !event) return
  const from = connectionState.fromNode.id as StepId
  const to = (connectionState.toNode?.id as StepId | undefined) ?? stepAt(event)
  if (!to || to === from) return
  const candidate = connectionState.fromHandle?.type === 'target' ? { source: to, target: from } : { source: from, target: to }
  const result = verdict(candidate)
  if (result.ok) connections.value = [...connections.value, candidate]
  else refuse(result.reason)
}
function reconnectStart(edge: { source: string; target: string }) {
  moving = asConnection(edge)
  connecting.value = true
}
function reconnect({ edge, connection }: EdgeReconnectEvent) {
  const old = asConnection(edge)
  const next = asConnection(connection)
  const result = verdict(next)
  if (!result.ok) return refuse(result.reason)
  connections.value = connections.value.map((c) => (connectionKey(c) === connectionKey(old) ? next : c))
}
/** Dropped away from any step: the connection is removed. Dropped on one that can't take it: kept, and why. */
function reconnectEnd({ event, edge, connectionState }: EdgeReconnectEndEvent) {
  const old = moving
  moving = undefined
  connecting.value = false
  if (connectionState.isValid || !old) return
  const to = (connectionState.toNode?.id as StepId | undefined) ?? (event ? stepAt(event) : undefined)
  if (!to) return disconnect([edge])
  if (to === old.source || to === old.target) return
  const keepSource = connectionState.fromHandle?.type === 'source'
  const next = keepSource ? { source: old.source, target: to } : { source: to, target: old.target }
  const result = checkConnection(connections.value, next, contracts.value, old)
  if (result.ok) connections.value = connections.value.map((c) => (connectionKey(c) === connectionKey(old) ? next : c))
  else refuse(result.reason)
}
function disconnect(removed: readonly { id: string }[]) {
  const ids = new Set(removed.map((e) => e.id))
  connections.value = connections.value.filter((c) => !ids.has(connectionKey(c)))
  if (selectedEdge.value && ids.has(selectedEdge.value)) selectedEdge.value = null
}
/** From the keyboard: Tab to an arrow, then Delete (or Backspace) removes it. */
function deleteFocusedArrow(event: KeyboardEvent) {
  if (event.key !== 'Delete' && event.key !== 'Backspace') return
  const arrow = (event.target as Element | null)?.closest?.('.vue-flow__edge')
  const id = arrow?.getAttribute('data-id')
  if (!id) return
  event.preventDefault()
  disconnect([{ id }])
  // Focus stays where you were: on the step the arrow came from.
  const source = id.split('->')[0]
  nextTick(() => document.querySelector<HTMLElement>(`.vue-flow__node[data-id="${source}"]`)?.focus())
}
onMounted(() => document.addEventListener('keydown', deleteFocusedArrow))
onBeforeUnmount(() => document.removeEventListener('keydown', deleteFocusedArrow))
/** Selecting an arrow, and removing it (Delete or Backspace once it's selected). */
function edgesChange(changeset: EdgeChangeset) {
  const changes = changeset.toArray()
  for (const c of changes) {
    if (c.type === 'select') selectedEdge.value = c.selected ? c.id : selectedEdge.value === c.id ? null : selectedEdge.value
  }
  const removed = changes.filter((c) => c.type === 'remove')
  if (removed.length) disconnect(removed)
}

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

/** The shown run's result for a node: null for Record A, and for a step that run didn't invoke. */
const stepOf = (id: StepId): Step => (id === 'record' ? null : shown.value.steps[id] ?? null)
/** What a step receives that its contract can't accept, from the connection into it. */
const problemInto = (id: StepId) => {
  const into = connections.value.find((c) => c.target === id)
  return (into && problems.value.get(connectionKey(into))) ?? null
}

const views = computed<Record<StepId, StepView>>(() => {
  const outcome = (id: StepId): StepView['outcome'] => {
    const step = stepOf(id)
    if (!step) return { label: 'Not invoked', tone: 'none' }
    const kind = step.evidence.outcome.kind
    return { label: outcomeLabel(step.evidence.outcome), tone: kind === 'succeeded' ? 'ok' : kind === 'failed' ? 'bad' : 'warn' }
  }
  const misbehaving = (step: FeatureStep) => !features.value[step].id.startsWith('orbit.')
  const mapping = summarize(appliedMapping.value.properties)
  const p = path.value
  return {
    'record': {
      badge: stepBadge('record', p), kind: 'Record · in memory', title: stepTitle('record'),
      lines: [definitionLabel(pin.value.ref), recordFields.value],
      more: 0, note: pinKey.value === 'a1' ? null : 'Pinned to a different Definition', problem: null, outcome: null, stale: false,
    },
    'console-in': {
      badge: stepBadge('console-in', p), kind: `Feature · ${featureWords('console-in')}`, title: stepTitle('console-in'),
      lines: ['Shows what arrives and passes it on, unchanged'], more: 0,
      note: misbehaving('console-in') ? 'Misbehaving on purpose' : null, problem: problemInto('console-in'), outcome: outcome('console-in'), stale: stale.value,
    },
    'transform': {
      badge: stepBadge('transform', p), kind: `Feature · ${featureWords('transform')} · Mapping v${config.value.mapping.version}`, title: stepTitle('transform'),
      lines: [`${label(appliedMapping.value.from)} → ${label(config.value.output)}`, ...(mapping.lines.length ? mapping.lines : ['Makes nothing yet'])], more: mapping.more,
      note: plan.value.changes ? 'Unapplied changes. Runs use the applied versions' : null, problem: problemInto('transform'), outcome: outcome('transform'), stale: stale.value,
    },
    'console-out': {
      badge: stepBadge('console-out', p), kind: `Feature · ${featureWords('console-out')}`, title: stepTitle('console-out'),
      lines: ['Shows what arrives and passes it on, unchanged'], more: 0, note: misbehaving('console-out') ? 'Misbehaving on purpose' : null, problem: problemInto('console-out'), outcome: outcome('console-out'), stale: stale.value,
    },
  }
})

// --- The inspector ---
// It floats over the canvas, so opening or closing it never resizes it and never moves a node.
// The one deliberate exception: a step you select that would sit underneath is brought into view
// by panning, without zooming, on wide screens; on phones, where it's a sheet, the selected step is
// fitted above the sheet. Nothing is edited in it: editing the Transform is Mapping Studio's.

// --- Mapping Studio (Phase 4.5A) ---
// Its own view, over the Designer rather than instead of it: this page stays as it is underneath
// (the canvas, positions, connections, Feature versions, runs and the draft), so going there and
// back loses nothing and applies nothing. Where you are is in the address (?studio=mapping), so the
// browser's Back returns to the canvas too. Leaving Orbit from the Studio is guarded as from here.
const route = useRoute()
const router = useRouter()
const studio = computed(() => route.query.studio === 'mapping')
useHead({ title: () => (studio.value ? 'Mapping Studio (experiment) · Orbit' : 'Spatial designer (experiment) · Orbit') })
let pushed = false
/** Where the Studio opens (a segment, or a property's editor), and the inspector row it was opened from. */
const studioStart = shallowRef<StudioOpening | null>(null)
let studioOrigin: string | null = null
function openStudio(at: StudioOpening | null = null) {
  studioStart.value = at
  studioOrigin = at?.property ?? null
  pushed = true
  router.push({ query: { ...route.query, studio: 'mapping' } })
}
function closeStudio() {
  if (pushed) {
    pushed = false
    return router.back()
  }
  const { studio: _, ...rest } = route.query
  router.replace({ query: rest })
}
// Back on the canvas: focus returns to where the Studio was opened from (a property's row, or the pencil).
watch(studio, (open) => {
  if (open) return
  nextTick(() => {
    const row = studioOrigin === null ? null : document.querySelector<HTMLElement>(`[data-property-row="${CSS.escape(studioOrigin)}"]`)
    ;(row ?? document.querySelector<HTMLElement>('[data-edit-mapping]'))?.focus()
  })
})
/** Cancel discards the draft on purpose (asking first when that loses work), then returns. */
function cancelStudio() {
  const to = draftFrom(config.value)
  resetAfterAsking({
    title: 'Cancel your changes?', intro: 'The Mapping goes back to what’s applied. Cancelling forgets:', confirm: 'Discard changes',
    losing: draftLoses(draft.value, to, config.value.mappings), act: () => { setDraft(to, false); closeStudio() },
  })
}
const inspector = ref<HTMLElement>()
function closeInspector() {
  const id = selectedId.value
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
  if (!id) return
  if (small()) nextTick(() => requestAnimationFrame(() => fit()))
  else nextTick(() => reveal(id))
})
const panelTitle = computed(() => (selectedId.value ? views.value[selectedId.value] : null))
const runLabel = computed(() => `Run ${runNumber.value}${stale.value ? ' · the setup has changed since' : ''}`)
const descriptions: Record<StepId, string> = {
  'record': workspace
    ? `The in-memory Record the flow starts from: sample data, placed in ${workspace.name} for this tab’s runs only.`
    : 'The in-memory Record the flow starts from.',
  'console-in': 'Shows what arrives, and passes it on unchanged.',
  'transform': 'Builds a new Value, property by property, from the one it receives.',
  'console-out': 'Shows what arrives, and passes it on unchanged.',
}
/** The shown run as a whole, never better than it went: it stopped where a step didn't succeed. */
const runWords = computed(() => {
  const outcome = flowOutcome(shown.value)
  if (outcome.kind === 'stopped') return `Run ${runNumber.value} stopped at ${stepTitle(outcome.at)}`
  if (outcome.kind === 'nothing') return `Nothing ran in run ${runNumber.value}`
  return `Up to date · run ${runNumber.value}`
})
const toolbarStatus = computed(() => {
  if ('error' in parsed.value) return 'Fix Record A’s data to run'
  if (path.value.length < 2) return 'Connect Record A to a step to run'
  return stale.value ? `Changed since run ${runNumber.value}` : runWords.value
})
const showHint = ref(true)
// Where "back" goes: the place you came from (the workspace's Workflows place), when it's a path
// within Orbit (safeDestination; it grants nothing, the page is authorized as usual), else Orbit.
const back = computed(() => safeDestination(useRoute().query.back))

// --- Leaving ---
// Everything here lives in memory only, applied versions included. Leaving with work in it asks
// first (Stay in Designer / Leave and discard); an untouched playground just leaves. One guard
// covers every way out inside Orbit (the back action, List view, the browser's back button); a
// reload or closing the tab gets the browser's own question, only when there's work to lose.
const START = { pinKey: 'a1', recordText: JSON.stringify(INITIAL_DATA, null, 2), features: INITIAL_STEP_FEATURES } as const
const atRisk = computed(() => [
  ...workAtRisk({ pinKey: pinKey.value, recordText: recordText.value, features: stepFeatures.value, config: config.value, unapplied: plan.value.changes }, START),
  ...(connectionsChanged.value ? ['Your connections'] : []),
])
const leaving = ref<string | null>(null)
let discardConfirmed = false
onBeforeRouteLeave((to) => {
  if (discardConfirmed || !atRisk.value.length) return true
  leaving.value = to.fullPath
  return false
})
function stay() {
  leaving.value = null
  nextTick(() => document.querySelector<HTMLElement>('header a')?.focus())
}
function leave() {
  const to = leaving.value
  discardConfirmed = true
  leaving.value = null
  if (to) navigateTo(to)
}
function onBeforeUnload(event: BeforeUnloadEvent) {
  if (discardConfirmed || !atRisk.value.length) return
  event.preventDefault()
  event.returnValue = ''
}
onMounted(() => window.addEventListener('beforeunload', onBeforeUnload))
// Arriving with a requested version: Mapping Studio's General, where that choice shows.
onMounted(() => {
  if (requested) nextTick(() => { select('transform'); openStudio({ segment: 'general' }) })
  // Arriving in Mapping Studio: the Transform is what it's about, so that's where the way back leads.
  if (studio.value) nextTick(() => select('transform'))
})
onBeforeUnmount(() => window.removeEventListener('beforeunload', onBeforeUnload))

// --- Feature versions: a development-only control (FeatureVersions.vue), apart from the inspectors.
// A step's version changes only when someone pins another there; nothing upgrades on its own.
const versionsOpen = ref(false)
const option = (c: { feature: FeatureRef; label: string }) => ({ key: featureKey(c.feature), label: c.label })
const consoleGroups = [
  { label: 'Orbit', options: CONSOLES.filter((c) => c.feature.id.startsWith('orbit.')).map(option) },
  { label: 'Misbehaving on purpose', options: CONSOLES.filter((c) => !c.feature.id.startsWith('orbit.')).map(option) },
]
const versionChoices = computed<VersionChoice[]>(() => (['console-in', 'transform', 'console-out'] as const).map((id) => ({
  step: id,
  name: `Step ${stepBadge(id, path.value)} · ${stepTitle(id)}`,
  groups: id === 'transform' ? [{ label: 'Orbit', options: TRANSFORMS.map(option) }] : consoleGroups,
})))
function pinVersion(step: string, key: string) {
  stepFeatures.value = { ...stepFeatures.value, [step as FeatureStep]: key }
}
const control = 'rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-xs outline-none transition focus:border-accent-500 focus:ring-2 focus:ring-accent-100'
</script>

<template>
  <div class="designer relative h-dvh overflow-hidden bg-slate-50" :class="{ 'designer--connecting': connecting }" :style="{ '--designer-grip': `${grip.dot}px` }">
    <!-- Orbit's distant orbits, far behind the canvas; they never move. -->
    <div class="pointer-events-none absolute inset-0 grid place-items-center" aria-hidden="true">
      <div class="size-[56rem] rounded-full border border-accent-100/60" />
      <div class="absolute size-[36rem] rounded-full border border-accent-secondary-100/50" />
    </div>

    <DesignerToolbar
      :inert="studio || undefined"
      :back="back"
      :status="toolbarStatus"
      :attention="plan.changes ? 'Transform has unapplied changes' : null"
      :can-run="canRun"
      @run="run"
      @start-over="startOver"
      @versions="versionsOpen = true"
    />

    <div class="absolute inset-0" :inert="studio || undefined">
      <ClientOnly>
        <VueFlow
          v-model:nodes="nodes"
          :edges="edges"
          :is-valid-connection="isValidConnection"
          :connection-radius="grip.snap"
          :reconnect-radius="grip.arrowEnd"
          :delete-key-code="['Backspace', 'Delete']"
          :selection-key-code="null"
          :multi-selection-key-code="null"
          :node-drag-threshold="6"
          :zoom-on-double-click="false"
          :min-zoom="0.3"
          :max-zoom="1.75"
          fit-view
          :fit-view-options="FIT"
          aria-label="The flow, as a canvas"
          @init="flow = $event; zoom = $event.getViewport().zoom"
          @viewport-change="zoom = $event.zoom"
          @nodes-initialized="small() && fit()"
          @connect-start="connecting = true"
          @connect="connect"
          @connect-end="connectEnd"
          @reconnect-start="reconnectStart($event.edge)"
          @reconnect="reconnect"
          @reconnect-end="reconnectEnd"
          @edges-change="edgesChange"
        >
          <template #node-step="node">
            <StepNode :view="views[node.id as StepId]" :selected="node.selected" :start="node.id === 'record'" :hands-on="connections.some((c) => c.source === node.id)" />
          </template>
          <Background :gap="22" :size="1.2" pattern-color="#cbd5e1" />
          <Controls :show-interactive="false" position="bottom-left" :class="{ 'max-lg:hidden': selectedId }">
            <ControlButton title="Reset layout" aria-label="Reset layout" @click="resetLayout">
              <span aria-hidden="true" class="text-sm leading-none">↺</span>
            </ControlButton>
          </Controls>
          <!-- Why a connection wasn't made, briefly, where the hint sits; then it goes. -->
          <Panel position="bottom-center">
            <p role="status" aria-live="polite">
              <span v-if="refusal" class="flex items-center gap-2 rounded-full border border-red-200 bg-white/90 py-1.5 pr-1.5 pl-4 text-xs text-red-700 shadow-lg shadow-slate-900/[0.06] backdrop-blur-md">
                {{ refusal }}
                <button type="button" class="grid size-7 shrink-0 place-items-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700" aria-label="Dismiss" @click="refusal = null">✕</button>
              </span>
            </p>
            <p v-if="showHint && !refusal" class="flex items-center gap-2 rounded-full border border-white/80 bg-white/75 py-1.5 pr-1.5 pl-4 text-xs text-slate-600 shadow-lg shadow-slate-900/[0.06] ring-1 ring-slate-900/5 backdrop-blur-md" :class="{ 'max-lg:hidden': selectedId }">
              The arrows are the order. Drag from a dot to connect; drag an arrow’s end away to disconnect.
              <button type="button" class="grid size-7 shrink-0 place-items-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700" aria-label="Hide this hint" @click="showHint = false">✕</button>
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
      v-if="selectedId && panelTitle"
      ref="inspector"
      :inert="studio || undefined"
      data-floating-surface
      :aria-label="`${panelTitle.title}: inspector`"
      class="fixed inset-x-0 bottom-0 z-20 flex animate-rise flex-col overflow-hidden rounded-t-3xl border border-slate-200/80 bg-white shadow-2xl shadow-slate-900/15 lg:absolute lg:inset-x-auto lg:top-4 lg:right-4 lg:w-[26rem] lg:rounded-3xl lg:shadow-xl lg:shadow-slate-900/10"
      :class="selectedId === 'transform' ? 'max-h-[75dvh] lg:bottom-4 lg:max-h-none' : 'max-h-[60dvh] lg:max-h-[calc(100%-2rem)]'"
      @keydown.escape="closeInspector"
    >
      <div class="mx-auto mt-2 h-1 w-10 rounded-full bg-slate-200 lg:hidden" aria-hidden="true" />
      <!-- The Transform has its own compact header (TransformInspector); the other steps share this one. -->
      <div v-if="selectedId !== 'transform'" class="flex items-start gap-3 px-5 pt-3 pb-3 lg:pt-4">
        <span class="mt-0.5 flex h-7 min-w-7 items-center justify-center rounded-full bg-accent-600 px-2 text-xs font-semibold text-white" aria-hidden="true">{{ panelTitle.badge }}</span>
        <div class="min-w-0 flex-1">
          <h2 class="text-base leading-tight font-semibold text-slate-900">{{ panelTitle.title }}</h2>
          <p v-if="selectedId === 'record'" class="text-xs text-slate-500">Record · in memory</p>
          <p v-else class="text-xs text-slate-500" data-step-versions :title="stepFeatures[selectedId]">{{ featureVersionWords(features[selectedId]) }}</p>
          <p class="mt-1.5 text-xs text-slate-500">{{ descriptions[selectedId] }}</p>
        </div>
        <button type="button" class="grid size-10 shrink-0 place-items-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500" :aria-label="`Close the ${panelTitle.title} inspector`" @click="closeInspector">✕</button>
      </div>

      <TransformInspector
        v-if="selectedId === 'transform'"
        :badge="panelTitle.badge"
        :draft="draft"
        :config="config"
        :target="target"
        :plan="plan"
        :structure="structure"
        :review="review"
        :output="output"
        :example="example"
        :input="input"
        :can-undo="history.length > 0"
        :assessment="assessment"
        :step="stepOf('transform')"
        :stale="stale"
        :run-number="runNumber"
        :runs="runs"
        :feature="featureVersionWords(features.transform)"
        :feature-key="stepFeatures.transform"
        @apply="apply"
        @discard="discard"
        @undo="undo"
        @studio="openStudio"
        @close="closeInspector"
      />
      <div v-else class="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
        <section v-if="selectedId === 'record'" aria-labelledby="setup-heading" class="mb-5">
          <h3 id="setup-heading" class="text-sm font-semibold text-slate-900">Setup</h3>
          <p class="mt-0.5 text-xs text-slate-500">Changes take effect the next time you run.</p>

          <div class="mt-3">
            <label for="pin" class="block text-xs font-medium text-slate-600">Pinned to</label>
            <select id="pin" v-model="pinKey" :class="[control, 'mt-1 w-full']">
              <option v-for="p in PINS" :key="p.key" :value="p.key">{{ definitionLabel(p.ref) }}</option>
            </select>
            <p class="mt-1.5 text-xs text-slate-500">
              {{ pin.note }}
              <span class="font-mono text-slate-600">{{ shapeOf(DEFINITIONS.find((d) => d.id === pin.ref.id && d.version === pin.ref.version)!) }}</span>
            </p>
            <!-- Data only changes on purpose: an example is offered, never swapped in. -->
            <button v-if="pin.example && recordText !== JSON.stringify(pin.example, null, 2)" type="button" class="link mt-1.5 text-xs" data-use-example @click="recordText = JSON.stringify(pin.example, null, 2)">Use example data for {{ definitionLabel(pin.ref) }}</button>
            <label for="record-data" class="mt-4 block text-xs font-medium text-slate-600">Data</label>
            <textarea id="record-data" v-model="recordText" rows="5" spellcheck="false" autocomplete="off" :aria-invalid="'error' in parsed" aria-describedby="record-data-hint" class="field font-mono text-sm" />
            <p id="record-data-hint" class="mt-2 text-xs" :class="'error' in parsed ? 'text-red-700' : 'text-slate-500'" aria-live="polite">
              {{ 'error' in parsed ? parsed.error : 'Edit freely, even into something its Definition wouldn’t allow, to see what the boundary does.' }}
            </p>
          </div>

        </section>

        <!-- What happened: read-only, from an actual run. -->
        <section aria-labelledby="run-heading" class="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200/70">
          <div class="flex flex-wrap items-baseline justify-between gap-2">
            <h3 id="run-heading" class="text-sm font-semibold text-slate-900">What happened</h3>
            <p class="text-xs text-slate-500">{{ runLabel }}</p>
          </div>
          <p v-if="selectedId === 'record'" class="mt-2 text-sm text-slate-600">
            Record A isn’t a Feature, so it never runs.
            {{ shown.path.length > 1 ? `Step 1, ${stepTitle(shown.path[1]!)}, read it.` : 'Nothing read it: it wasn’t connected to a step.' }}
          </p>
          <RunResult v-else :step="stepOf(selectedId)" :stale="stale" pass-through :label="label" :resolve="resolve" />
        </section>
      </div>
    </aside>

    <!-- Mapping Studio: its own view, over the Designer, which stays as it is underneath -->
    <div v-if="studio" class="fixed inset-0 z-40 overflow-y-auto bg-slate-50" data-studio-view>
      <main class="mx-auto w-full max-w-[96rem] px-3 pt-4 pb-8 sm:px-6 sm:pt-6 lg:px-8 lg:pt-8">
        <MappingStudio
          :draft="draft"
          :config="config"
          :target="target"
          :plan="plan"
          :structure="structure"
          :review="review"
          :output="output"
          :example="example"
          :input="input"
          :can-undo="history.length > 0"
          :boundary="boundary"
          :assessment="assessment"
          :feature="featureWords('transform')"
          :applied="applied"
          :step="stepOf('transform')"
          :stale="stale"
          :run-number="runNumber"
          :runs="runs"
          :start="studioStart"
          @update:draft="setDraft"
          @apply="apply"
          @cancel="cancelStudio"
          @undo="undo"
          @back="closeStudio"
        />
      </main>
    </div>

    <FeatureVersions :open="versionsOpen" :choices="versionChoices" :pinned="stepFeatures" @pin="pinVersion" @close="versionsOpen = false" />
    <LeaveDialog :losing="leaving ? atRisk : null" @stay="stay" @leave="leave" />
    <LeaveDialog
      :losing="resetting?.losing ?? null"
      :title="resetting?.title"
      :intro="resetting?.intro"
      :confirm="resetting?.confirm"
      stay="Keep editing"
      @stay="resetting = null"
      @leave="confirmReset"
    />
  </div>
</template>

<style>
/* The canvas library's defaults, toned to Orbit. Connection dots: small, shown where a connection
   can start (hovering or selecting a step) or end (while connecting), pink to act on, red where it
   can't connect. Each answers a ring around it, invisibly (--designer-grip, about 32px across on
   screen at any zoom), and nothing else does: the step's body moves the step. The library places
   each dot with `transform`, so a hovered dot grows by a ring (box-shadow), which can't move it. */
.designer .vue-flow__handle {
  width: 10px; height: 10px; border: 2px solid var(--color-accent-500); background: white;
  opacity: 0; transition: opacity 120ms, box-shadow 120ms;
}
.designer .vue-flow__handle::before { content: ''; position: absolute; inset: calc(-1 * var(--designer-grip, 13px)); border-radius: 9999px; }
.designer .vue-flow__node:hover .vue-flow__handle.connectablestart,
.designer .vue-flow__node.selected .vue-flow__handle.connectablestart,
.designer .vue-flow__node:focus-visible .vue-flow__handle.connectablestart,
.designer.designer--connecting .vue-flow__handle.connectionindicator,
.designer .vue-flow__handle.connectingfrom { opacity: 1; }
.designer .vue-flow__handle.connectionindicator:hover, .designer .vue-flow__handle.connectingto.valid { background: var(--color-accent-500); box-shadow: 0 0 0 3px var(--color-accent-100); }
.designer .vue-flow__handle.connectingto:not(.valid) { border-color: var(--color-red-500); }
/* An arrow's ends: grabbed to move or remove the connection (the library's invisible circles just
   beyond each end, sized by grip.arrowEnd). Pink while hovered or moving, like the dots. */
.designer .vue-flow__edgeupdater { cursor: crosshair; }
.designer .vue-flow__edge:has(.vue-flow__edgeupdater:hover) .vue-flow__edge-path,
.designer .vue-flow__edge.updating .vue-flow__edge-path { stroke: var(--color-accent-500); }
.designer .vue-flow__connection-path { stroke: var(--color-accent-400); stroke-width: 2; stroke-dasharray: 6 6; }
.designer .vue-flow__node-step { border: 0; background: transparent; padding: 0; }
.designer .designer-edge .vue-flow__edge-path { stroke: var(--color-slate-400); stroke-width: 2; }
.designer .designer-edge--unused .vue-flow__edge-path { stroke: var(--color-slate-300); stroke-dasharray: 6 6; }
.designer .designer-edge--problem .vue-flow__edge-path { stroke: var(--color-red-400); }
.designer .vue-flow__edge.selected .vue-flow__edge-path,
.designer .vue-flow__edge:focus-visible .vue-flow__edge-path { stroke: var(--color-accent-500); }
@media (pointer: coarse) {
  .designer .vue-flow__handle { width: 16px; height: 16px; }
}
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
