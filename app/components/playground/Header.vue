<!--
  Playground: Orbit's real header (logo, workspace pill, account), plus what each concept adds.
  A: the Quiet Line as a second row inside the header. C: a menu button for the rail's phone
  drawer. D: the places in the workspace menu, and the current place named after the pill.
-->
<script setup lang="ts">
import { type ConceptKey, type Place, frame, placeHref, places } from '~/playground/sample'

const props = defineProps<{ concept: ConceptKey; place: Place }>()
const drawer = useState('pg-drawer', () => false)
const here = computed(() => places.find((p) => p.key === props.place)!)
</script>

<template>
  <header class="relative z-20 border-b border-slate-200/70 bg-white/70 backdrop-blur">
    <div class="flex h-16 items-center justify-between gap-4" :class="[frame.gutter, concept === 'c' ? '' : frame.width]">
      <div class="flex min-w-0 items-center gap-3">
        <button
          v-if="concept === 'c'"
          type="button"
          class="-ml-1.5 grid size-9 shrink-0 place-items-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 md:hidden"
          aria-label="Open navigation"
          :aria-expanded="drawer"
          @click="drawer = true"
        >
          <svg viewBox="0 0 16 16" class="size-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h7" /></svg>
        </button>
        <OrbitMark class="shrink-0" />
        <span class="text-slate-300" aria-hidden="true">/</span>
        <PlaygroundWorkspaceMenu :concept="concept" :place="place" :places="concept === 'd'" />
        <template v-if="concept === 'd' && place !== 'home'">
          <span class="text-slate-300" aria-hidden="true">/</span>
          <span class="flex shrink-0 items-center gap-1.5 text-sm font-medium text-slate-900" aria-current="page">
            <PlaygroundPlaceIcon :place="place" class="size-4 text-accent-600" />
            {{ here.label }}
          </span>
        </template>
      </div>
      <PlaygroundIdentityMenu class="shrink-0" />
    </div>

    <!-- A · The Quiet Line -->
    <nav v-if="concept === 'a'" aria-label="Workspace" :class="[frame.gutter, frame.width]">
      <ul class="-mb-px flex gap-7">
        <li v-for="p in places" :key="p.key">
          <NuxtLink
            :to="placeHref(concept, p.key)"
            :aria-current="p.key === place ? 'page' : undefined"
            class="block border-b-2 pt-1 pb-2.5 text-sm font-medium transition focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
            :class="p.key === place ? 'border-accent-500 text-slate-900' : 'border-transparent text-slate-500 hover:border-slate-200 hover:text-slate-800'"
          >
            {{ p.label }}
          </NuxtLink>
        </li>
      </ul>
    </nav>
  </header>
</template>
