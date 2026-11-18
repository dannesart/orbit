<!--
  Playground: one concept, one place, at real size. The comparison page shows this in frames,
  so phone widths trigger the real responsive layout; it also works opened on its own.
-->
<script setup lang="ts">
import { type ConceptKey, type Place, concepts, places, useSampleWorkspaces } from '~/playground/sample'

definePageMeta({
  // One page per concept: moving between places updates it in place, so the navigation stays
  // mounted and its moon can glide (a new page per place would replace it on every move).
  key: (route) => String(route.params.concept),
  // Checked on every navigation, not just the first load; anything else is a 404.
  validate: (route) => String(route.params.concept) in concepts
    && ['', 'people', 'settings'].includes(String(route.params.place ?? '')),
})

const route = useRoute()
const concept = computed(() => route.params.concept as ConceptKey)
const place = computed(() => ((route.params.place as string) || 'home') as Place)

const { current } = useSampleWorkspaces()
const floating = computed(() => concept.value === 'e1' || concept.value === 'e2' || concept.value === 'e3')
const railVariant = computed(() => ({ e1: 'edge', e2: 'companion' } as const)[concept.value as 'e1' | 'e2'] ?? 'frame')
// E3 steps aside into the bottom pill if content would reach its rail; keep the pill's space then.
const crowded = useState('pg-e3-crowded', () => false)
// E: let the page reach under the phone's safe areas, so the pill can clear them itself.
useHead(() => (floating.value
  ? { meta: [{ name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' }] }
  : {}))
const label = computed(() => places.find((p) => p.key === place.value)!.label)
useHead({
  title: () => `${place.value === 'home' ? current.value.name : `${label.value} · ${current.value.name}`} · ${concepts[concept.value].letter} · Playground`,
  meta: [{ name: 'robots', content: 'noindex' }],
})

// Tell the comparison page where this frame is, so switching concept keeps the same place.
watch(place, (p) => {
  if (import.meta.client && window.parent !== window) {
    window.parent.postMessage({ type: 'orbit-nav-playground', place: p }, window.location.origin)
  }
}, { immediate: true })
</script>

<template>
  <div class="min-h-dvh">
    <PlaygroundHeader :concept="concept" :place="place" />

    <div :class="concept === 'c' ? 'flex' : ''">
      <PlaygroundNavRail v-if="concept === 'c'" :place="place" />
      <main class="min-w-0 flex-1" :class="{ 'pb-24': concept === 'b', 'relative pb-[calc(env(safe-area-inset-bottom)+6rem)]': floating, 'lg:pb-0': floating && !(concept === 'e3' && crowded) }">
        <PlaygroundNavFloatingRail v-if="floating" :concept="concept" :variant="railVariant" :place="place" />
        <PlaygroundArrival v-if="place === 'home'" :key="current.id" :concept="concept" />
        <PlaygroundPeople v-else-if="place === 'people'" />
        <PlaygroundSettings v-else />
      </main>
    </div>

    <PlaygroundNavFloat v-if="concept === 'b'" :place="place" />
  </div>
</template>
