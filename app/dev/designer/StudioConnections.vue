<script setup lang="ts">
// Mapping Studio (Phase 4.5B): the lines between the input and the output. One SVG laid over the
// workspace, measured from the rows themselves, so a line is always where its rows are: redrawn when
// anything changes size, when an object folds or unfolds, and when the draft changes. Lines are only
// what the draft depends on (studio.ts, connections), never a suggestion. Not interactive, and hidden
// from assistive technology: every row already says in words what it reads.
//
//   value     solid       a value is made from it (each of an expression's arguments too)
//   copy      solid, wide the whole value is copied from it
//   presence  dashed      a built object is made only when it's present: a condition, not a value
//
// A source inside a folded object is drawn to that object, with an open end: folded, not hidden.
// Likewise an output place inside a folded built object: drawn to that object, with an open end.
// Only when the two trees are side by side; stacked (narrow screens), there are no lines at all.
//
// Calm by default: with many lines and nothing selected, every line is drawn, quietly; selecting a
// property lights its own lines and makes the rest much quieter, never gone. `all` draws every line
// at full strength. Only how lines look: which lines exist is the draft's, and nothing here changes it.
import type { PropertyPath } from '#shared/features/definitions'
import { type Connection, type LinkKind, isWithin } from './studio'

const props = withDefaults(defineProps<{ connections: readonly Connection[]; selected: PropertyPath | null; all?: boolean }>(), { all: false })

interface Drawn { readonly key: string; readonly kind: LinkKind; readonly d: string; readonly x1: number; readonly y1: number; readonly x2: number; readonly y2: number; readonly lit: boolean; readonly folded: boolean; readonly foldedTo: boolean }
/** From how many lines the overview is drawn quietly. */
const MANY = 12
/** How strongly a line is drawn: lit, at rest, or quietened while another property is selected. */
const strength = (l: Drawn) => {
  if (props.all || l.lit) return 1
  if (props.selected) return 0.12
  return props.connections.length > MANY ? 0.4 : 0.9
}
const svg = ref<SVGSVGElement>()
const drawn = ref<Drawn[]>([])
const join = (path: PropertyPath) => path.join(' › ')

function measure() {
  const host = svg.value?.parentElement
  const input = host?.querySelector<HTMLElement>('[data-studio-input]')
  const output = host?.querySelector<HTMLElement>('[data-studio-output]')
  if (!host || !input || !output) return (drawn.value = [])
  const box = host.getBoundingClientRect()
  const left = input.getBoundingClientRect()
  const right = output.getBoundingClientRect()
  // Side by side, with room between them: otherwise nothing is drawn.
  if (!left.width || !right.width || right.left - left.right < 24) return (drawn.value = [])
  const x1 = left.right - box.left
  const x2 = right.left - box.left
  const middle = (el: Element) => { const r = el.getBoundingClientRect(); return r.top + r.height / 2 - box.top }
  const seen = new Map<string, Drawn>()
  for (const c of props.connections) {
    // The source's row, or the nearest row that holds it when it's folded away.
    let from: Element | null = null
    let at = c.from.length
    if (!at) from = input.querySelector('[data-input-root]')
    for (; at > 0 && !from; at--) from = input.querySelector(`[data-input-row="${CSS.escape(join(c.from.slice(0, at)))}"]`)
    // The output place's row, or the nearest built object that holds it when it's folded away.
    let to: Element | null = null
    let end = c.to.length
    for (; end > 0 && !to; end--) to = output.querySelector(`[data-output-anchor="${CSS.escape(join(c.to.slice(0, end)))}"]`)
    if (!from || !to) continue
    const folded = c.from.length > 0 && at + 1 < c.from.length
    const foldedTo = end + 1 < c.to.length
    const y1 = middle(from)
    const y2 = middle(to)
    const bend = (x2 - x1) / 2
    const lit = !!props.selected && isWithin(c.to, props.selected)
    const key = `${folded ? `${join(c.from.slice(0, at + 1))}…` : c.key}>${foldedTo ? `${join(c.to.slice(0, end + 1))}…` : join(c.to)}:${c.kind}`
    const line: Drawn = { key, kind: c.kind, d: `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`, x1, y1, x2, y2, lit, folded, foldedTo }
    // Several sources folded into one object: one line, lit if any of them is.
    const before = seen.get(key)
    seen.set(key, before ? { ...before, lit: before.lit || lit } : line)
  }
  // The selected property's lines on top.
  drawn.value = [...seen.values()].sort((a, b) => Number(a.lit) - Number(b.lit))
}

let frame = 0
const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure) }
let resize: ResizeObserver | undefined
let mutation: MutationObserver | undefined
onMounted(() => {
  const host = svg.value!.parentElement!
  resize = new ResizeObserver(schedule)
  resize.observe(host)
  mutation = new MutationObserver(schedule)
  for (const el of host.querySelectorAll('[data-studio-input], [data-studio-output]')) {
    resize.observe(el)
    // Folding and unfolding, and rows coming and going.
    mutation.observe(el, { childList: true, subtree: true })
  }
  document.fonts?.ready.then(schedule)
  schedule()
})
onBeforeUnmount(() => { resize?.disconnect(); mutation?.disconnect(); cancelAnimationFrame(frame) })
watch(() => [props.connections, props.selected], () => nextTick(schedule))
</script>

<template>
  <svg ref="svg" class="pointer-events-none absolute inset-0 z-10 h-full w-full overflow-visible max-lg:hidden" aria-hidden="true" focusable="false" data-studio-connections>
    <g v-for="l in drawn" :key="l.key" :class="l.lit ? 'text-accent-500' : 'text-slate-400'" :opacity="strength(l)" :data-connection="l.kind" :data-lit="l.lit || undefined" :data-folded="l.folded || undefined" :data-folded-to="l.foldedTo || undefined" :data-strength="strength(l)">
      <path :d="l.d" fill="none" stroke="currentColor" :stroke-width="l.kind === 'copy' ? 3 : 1.5" :stroke-dasharray="l.kind === 'presence' ? '5 4' : undefined" stroke-linecap="round" />
      <circle :cx="l.x1" :cy="l.y1" r="3.5" :fill="l.folded ? 'white' : 'currentColor'" stroke="currentColor" stroke-width="1.5" />
      <circle :cx="l.x2" :cy="l.y2" r="3" :fill="l.foldedTo ? 'white' : 'currentColor'" stroke="currentColor" stroke-width="1.5" />
    </g>
  </svg>
</template>
