// The canvas's picture of the flow (Experiment #8): nodes where they're drawn and the connections
// (flow.ts) as arrows. A node's position is only where it is drawn: dragging changes positions,
// never connections, numbering or what runs. Types only from @xyflow/vue, so this file (and its
// tests) never load the canvas library.
import type { Edge, EdgeMarker, Node, XYPosition } from '@xyflow/vue'
import { type Connection, type FlowRun, STEPS, type StepId, connectionKey, stepBadge, stepTitle } from './flow'

/** Left to right, as the playground starts. Only a starting picture. */
export const INITIAL_POSITIONS: Readonly<Record<StepId, XYPosition>> = Object.freeze({
  'record': { x: 0, y: 0 },
  'console-in': { x: 320, y: 0 },
  'transform': { x: 640, y: 0 },
  'console-out': { x: 1020, y: 0 },
})

/** What a node is called for assistive technology: its place on the path, or that it has none. */
export function nodeLabel(id: StepId, path: readonly StepId[]): string {
  if (id === 'record') return 'Record A, where the flow starts'
  const badge = stepBadge(id, path)
  return badge === '–' ? `${stepTitle(id)}, not connected to the flow` : `Step ${badge}, ${stepTitle(id)}`
}

/** Nodes may be dragged, selected and connected; never deleted. */
export function initialNodes(path: readonly StepId[]): Node[] {
  return STEPS.map((id) => ({
    id,
    type: 'step',
    position: { ...INITIAL_POSITIONS[id] },
    data: {},
    deletable: false,
    ariaLabel: nodeLabel(id, path),
  }))
}

/** Back to the starting picture, keeping which node is selected. */
export const resetPositions = (nodes: readonly Node[]): Node[] =>
  nodes.map((n) => ({ ...n, position: { ...INITIAL_POSITIONS[n.id as StepId] } }))

/**
 * The connections as arrows. One the contracts can't accept is drawn as a problem; one nothing
 * travelled along in the shown run (it wasn't on that run's path, or its target wasn't invoked)
 * is dashed. Each can be selected, deleted or moved by its end.
 */
export function drawEdges(connections: readonly Connection[], shown: FlowRun, problems: ReadonlyMap<string, string>): Edge[] {
  const arrow = { type: 'arrowclosed', width: 18, height: 18 } as EdgeMarker
  return connections.map((c) => {
    const key = connectionKey(c)
    const at = shown.path.indexOf(c.source)
    const travelled = at >= 0 && shown.path[at + 1] === c.target && c.target !== 'record' && !!shown.steps[c.target]
    const problem = problems.get(key)
    const said = `${stepTitle(c.source)} hands on to ${stepTitle(c.target)}`
    return {
      id: key,
      source: c.source,
      target: c.target,
      markerEnd: arrow,
      deletable: true,
      reconnectable: true,
      // Reachable with Tab, to select (Enter) and remove (Delete). The library's own camel-cased
      // tabIndex does nothing on an SVG element, so the attribute is given as SVG spells it.
      domAttributes: { tabindex: 0 },
      class: problem ? 'designer-edge designer-edge--problem' : travelled ? 'designer-edge' : 'designer-edge designer-edge--unused',
      ariaLabel: problem ? `${said}. ${problem}` : travelled ? said : `${said}. Nothing travelled along it in the shown run`,
    }
  })
}
