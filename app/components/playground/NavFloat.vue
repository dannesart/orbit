<!-- Playground · B · The Floating Orbit: a glass pill at the bottom; its pink moon glides to where you are. -->
<script setup lang="ts">
import { type Place, placeHref, places } from '~/playground/sample'

const props = defineProps<{ place: Place }>()
const index = computed(() => places.findIndex((p) => p.key === props.place))
</script>

<template>
  <nav
    aria-label="Workspace"
    class="fixed inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] z-20 flex justify-center px-4 sm:bottom-6"
  >
    <ul class="relative grid grid-cols-3 rounded-full border border-white/80 bg-white/75 p-1 shadow-xl shadow-slate-900/10 ring-1 ring-slate-900/5 backdrop-blur-md">
      <!-- The moon -->
      <li
        aria-hidden="true"
        class="pointer-events-none absolute inset-y-1 left-1 w-[calc((100%-0.5rem)/3)] rounded-full bg-accent-50 ring-1 ring-accent-200/70 transition-transform duration-500 ease-[cubic-bezier(0.22,0.8,0.24,1)]"
        :style="{ transform: `translateX(${index * 100}%)` }"
      >
        <span class="absolute top-1.5 right-2.5 size-1.5 rounded-full bg-accent-400" />
      </li>
      <li v-for="p in places" :key="p.key" class="relative">
        <NuxtLink
          :to="placeHref('b', p.key)"
          :aria-current="p.key === place ? 'page' : undefined"
          class="flex min-w-24 flex-col items-center gap-0.5 rounded-full px-5 py-2 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 sm:min-w-28 sm:flex-row sm:justify-center sm:gap-2 sm:text-sm"
          :class="p.key === place ? 'text-accent-700' : 'text-slate-500 hover:text-slate-800'"
        >
          <PlaygroundPlaceIcon :place="p.key" class="size-4" />
          {{ p.label }}
        </NuxtLink>
      </li>
    </ul>
  </nav>
</template>
