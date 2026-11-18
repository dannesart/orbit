<!-- Playground · E: the glass rail itself (shared by E1, E2 and E3), with its gliding pink moon. -->
<script setup lang="ts">
import { type ConceptKey, type Place, placeHref, places } from '~/playground/sample'

const props = defineProps<{ concept: ConceptKey; place: Place }>()
const index = computed(() => places.findIndex((p) => p.key === props.place))
</script>

<template>
  <ul class="relative flex flex-col rounded-[1.75rem] border border-white/80 bg-white/70 p-1.5 shadow-lg shadow-slate-900/[0.06] ring-1 ring-slate-900/5 backdrop-blur-md">
    <li
      aria-hidden="true"
      class="pointer-events-none absolute inset-x-1.5 top-1.5 h-15 rounded-[1.375rem] bg-accent-50/90 ring-1 ring-accent-200/60 transition-transform duration-500 ease-[cubic-bezier(0.22,0.8,0.24,1)]"
      :style="{ transform: `translateY(${index * 100}%)` }"
    >
      <span class="absolute top-2 right-2.5 size-1.5 rounded-full bg-accent-400" />
    </li>
    <li v-for="p in places" :key="p.key" class="relative">
      <NuxtLink
        :to="placeHref(concept, p.key)"
        :aria-current="p.key === place ? 'page' : undefined"
        class="flex h-15 w-16 flex-col items-center justify-center gap-1 rounded-[1.375rem] text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
        :class="p.key === place ? 'text-accent-700' : 'text-slate-500 hover:text-slate-800'"
      >
        <PlaygroundPlaceIcon :place="p.key" class="size-[18px]" />
        {{ p.label }}
      </NuxtLink>
    </li>
  </ul>
</template>
