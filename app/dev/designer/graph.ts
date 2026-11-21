// The canvas's fixed graph. The order of execution lives here, in EXECUTION_ORDER, and nowhere
// else: a node's position is only where it is drawn. Dragging changes positions; it never
// changes the order, the numbering or the connections, and it never reaches runExperiment.
// Types only from @xyflow/vue, so this file (and its tests) never load the canvas library.
import type { Edge, EdgeMarker, Node, XYPosition } from '@xyflow/vue'

export const EXECUTION_ORDER = ['record', 'console-in', 'transform', 'console-out'] as const
export type StepId = (typeof EXECUTION_ORDER)[number]

/** Left to right, as the chain runs. Only a starting picture. */
export const INITIAL_POSITIONS: Readonly<Record<StepId, XYPosition>> = Object.freeze({
  'record': { x: 0, y: 0 },
  'console-in': { x: 320, y: 0 },
  'transform': { x: 640, y: 0 },
  'console-out': { x: 1020, y: 0 },
})

/** What a node's badge says: Record A starts the chain; the Features are steps 1 to 3. */
export const stepBadge = (id: StepId) => (id === 'record' ? 'Start' : String(EXECUTION_ORDER.indexOf(id)))

const TITLES: Record<StepId, string> = { 'record': 'Record A', 'console-in': 'Console', 'transform': 'Transform', 'console-out': 'Console' }
export const stepTitle = (id: StepId) => TITLES[id]

/** Nodes may be dragged and selected; never deleted, connected or reordered. */
export function initialNodes(): Node[] {
  return EXECUTION_ORDER.map((id) => ({
    id,
    type: 'step',
    position: { ...INITIAL_POSITIONS[id] },
    data: {},
    deletable: false,
    connectable: false,
    ariaLabel: id === 'record' ? 'Record A, where the chain starts' : `Step ${stepBadge(id)}, ${stepTitle(id)}`,
  }))
}

/** Back to the starting picture, keeping which node is selected. */
export const resetPositions = (nodes: readonly Node[]): Node[] =>
  nodes.map((n) => ({ ...n, position: { ...INITIAL_POSITIONS[n.id as StepId] } }))

/**
 * The three fixed connections, from EXECUTION_ORDER alone. `invoked` says which of the three
 * Features the shown run actually invoked: a connection into a step that was never invoked is
 * drawn dashed, because nothing travelled along it.
 */
export function fixedEdges(invoked: readonly [boolean, boolean, boolean]): Edge[] {
  const arrow = { type: 'arrowclosed', width: 18, height: 18 } as EdgeMarker
  return EXECUTION_ORDER.slice(1).map((target, i) => {
    const source = EXECUTION_ORDER[i]!
    const ran = invoked[i]!
    return {
      id: `${source}->${target}`,
      source,
      target,
      markerEnd: arrow,
      selectable: false,
      deletable: false,
      reconnectable: false,
      focusable: false,
      class: ran ? 'designer-edge' : 'designer-edge designer-edge--unused',
      ariaLabel: ran ? `${stepTitle(source)} hands on to ${stepTitle(target)}` : `${stepTitle(target)} was not invoked in this run`,
    }
  })
}
