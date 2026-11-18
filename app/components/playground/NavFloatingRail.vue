<!--
  Playground · E · The Floating Rail: C's icons and labels on B's glass, with a pink moon that
  glides to where you are. From lg up, a small vertical rail:
    edge      (E1) floats near the left edge of the window, vertically centred;
    companion (E2) floats just outside the content column, level with the top of the page,
              then rests near the top as you scroll;
    frame     (E3) sits in Orbit's frame: the header's own bounded content area, directly
              beneath the logo, so it stays put whatever the page's layout. If any page content
              would reach it, it steps aside into the bottom pill rather than overlap.
  Below lg, the same places in a bottom pill that clears the safe area.
  E2's column is the 36rem width People and Settings use, so its rail never moves between places.
-->
<script setup lang="ts">
import { type ConceptKey, type Place, frame, placeHref, places } from '~/playground/sample'

const props = defineProps<{ concept: ConceptKey; variant: 'edge' | 'companion' | 'frame'; place: Place }>()
const index = computed(() => places.findIndex((p) => p.key === props.place))
const ease = 'ease-[cubic-bezier(0.22,0.8,0.24,1)]'

// E3 only: does any of the page's own content reach into the rail's lane? The check reads the
// rendered page, so it holds for any layout (narrow card, wide page, centred Arrival) without
// knowing which one it is. Decorative, aria-hidden elements (the faint orbit rings) don't count.
const crowded = useState('pg-e3-crowded', () => false)
const lane = useTemplateRef<HTMLElement>('lane')
const CLEARANCE = 24
function measure() {
  const el = lane.value
  if (props.variant !== 'frame' || !el) return
  const rail = el.querySelector('ul')?.getBoundingClientRect()
  if (!rail?.width) return void (crowded.value = false) // below lg: the pill is in charge anyway
  let left = Infinity
  for (const node of el.closest('main')!.querySelectorAll('h1, h2, p, form, section, ul, li, input, button, a')) {
    if (el.contains(node) || node.closest('nav, [aria-hidden="true"]')) continue
    const r = node.getBoundingClientRect()
    if (r.width && r.height) left = Math.min(left, r.left)
  }
  crowded.value = left < rail.right + CLEARANCE
}
let frameId = 0
const schedule = () => { cancelAnimationFrame(frameId); frameId = requestAnimationFrame(measure) }
let observer: MutationObserver | undefined
onMounted(() => {
  if (props.variant !== 'frame') return
  schedule()
  window.addEventListener('resize', schedule)
  observer = new MutationObserver(schedule)
  observer.observe(lane.value!.closest('main')!, { subtree: true, childList: true, attributes: true, attributeFilter: ['style', 'class'] })
})
onBeforeUnmount(() => {
  window.removeEventListener('resize', schedule)
  observer?.disconnect()
  cancelAnimationFrame(frameId)
})
watch(() => props.place, () => nextTick(schedule))
</script>

<template>
  <!-- Wide screens: the rail -->
  <div
    v-if="variant !== 'frame'"
    :class="variant === 'companion'
      ? 'pointer-events-none absolute inset-y-0 right-[calc(50%+18rem+2.5rem)] z-10 hidden pt-14 lg:block'
      : 'fixed top-1/2 left-6 z-20 hidden -translate-y-1/2 lg:block'"
  >
    <nav aria-label="Workspace" class="animate-[rail-in_0.7s_cubic-bezier(0.2,0.7,0.2,1)_0.35s_both]" :class="variant === 'companion' ? 'pointer-events-auto sticky top-6' : ''">
      <PlaygroundRailList :concept="concept" :place="place" />
    </nav>
  </div>

  <!-- E3: a lane made of the header's own frame, so the rail starts exactly where the logo does.
       Kept in layout (just invisible) when crowded, so it can tell when there is room again. -->
  <div v-else ref="lane" class="pointer-events-none absolute inset-0 z-10 hidden lg:block" :class="{ invisible: crowded }">
    <div class="h-full pt-14" :class="[frame.gutter, frame.width]">
      <nav aria-label="Workspace" class="pointer-events-auto sticky top-6 w-fit animate-[rail-in_0.7s_cubic-bezier(0.2,0.7,0.2,1)_0.35s_both]">
        <PlaygroundRailList :concept="concept" :place="place" />
      </nav>
    </div>
  </div>

  <!-- Phones and narrow windows (and E3 when crowded): the same places in a bottom pill, clear of the safe area -->
  <nav
    aria-label="Workspace"
    class="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] z-20 flex animate-[pill-in_0.6s_cubic-bezier(0.2,0.7,0.2,1)_0.35s_both] justify-center px-4"
    :class="variant === 'frame' && crowded ? '' : 'lg:hidden'"
  >
    <ul class="relative grid grid-cols-3 rounded-full border border-white/80 bg-white/75 p-1 shadow-lg shadow-slate-900/[0.08] ring-1 ring-slate-900/5 backdrop-blur-md">
      <li
        aria-hidden="true"
        class="pointer-events-none absolute inset-y-1 left-1 w-[calc((100%-0.5rem)/3)] rounded-full bg-accent-50/90 ring-1 ring-accent-200/60 transition-transform duration-500"
        :class="ease"
        :style="{ transform: `translateX(${index * 100}%)` }"
      >
        <span class="absolute top-1.5 right-3 size-1.5 rounded-full bg-accent-400" />
      </li>
      <li v-for="p in places" :key="p.key" class="relative">
        <NuxtLink
          :to="placeHref(concept, p.key)"
          :aria-current="p.key === place ? 'page' : undefined"
          class="flex min-h-12 min-w-24 flex-col items-center justify-center gap-0.5 rounded-full px-5 py-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
          :class="p.key === place ? 'text-accent-700' : 'text-slate-500 hover:text-slate-800'"
        >
          <PlaygroundPlaceIcon :place="p.key" class="size-4" />
          {{ p.label }}
        </NuxtLink>
      </li>
    </ul>
  </nav>
</template>

<style>
/* Arrives once, after the page has settled; with reduced motion it is simply there. */
@keyframes rail-in {
  from { opacity: 0; transform: translateX(-6px); }
  to { opacity: 1; transform: none; }
}
@keyframes pill-in {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: none; }
}
</style>
