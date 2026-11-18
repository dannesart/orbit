<!--
  Playground: one concept, one place, at real size. The comparison page shows this in frames,
  so phone widths trigger the real responsive layout; it also works opened on its own.
-->
<script setup lang="ts">
import { type ConceptKey, type Place, concepts, places, useSampleWorkspaces } from '~/playground/sample'

const route = useRoute()
const concept = computed(() => route.params.concept as ConceptKey)
const place = computed(() => ((route.params.place as string) || 'home') as Place)
if (!(concept.value in concepts) || !places.some((p) => p.key === place.value)) {
  throw createError({ statusCode: 404, statusMessage: 'No such playground page', fatal: true })
}

const { current } = useSampleWorkspaces()
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
      <main class="min-w-0 flex-1" :class="concept === 'b' ? 'pb-24' : ''">
        <PlaygroundArrival v-if="place === 'home'" :key="current.id" :concept="concept" />
        <PlaygroundPeople v-else-if="place === 'people'" />
        <PlaygroundSettings v-else />
      </main>
    </div>

    <PlaygroundNavFloat v-if="concept === 'b'" :place="place" />
  </div>
</template>
