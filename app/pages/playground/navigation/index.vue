<!--
  NAVIGATION PLAYGROUND (exploration only). Switch between four navigation concepts and see the
  same sample workspace under each, on desktop and phone at once. Each frame is a real page at a
  real viewport size, so breakpoints, menus and motion behave as they would in Orbit.
-->
<script setup lang="ts">
import { type ConceptKey, type Place, concepts, placeHref } from '~/playground/sample'

type View = 'both' | 'desktop' | 'phone'
const route = useRoute()
const router = useRouter()
const keys = Object.keys(concepts) as ConceptKey[]
const concept = ref<ConceptKey>(keys.includes(route.query.concept as ConceptKey) ? (route.query.concept as ConceptKey) : 'a')
const view = ref<View>((['both', 'desktop', 'phone'] as const).find((v) => v === route.query.view) ?? 'both')
const notes = ref(true)
const c = computed(() => concepts[concept.value])
useHead({ title: 'Navigation playground · Orbit', meta: [{ name: 'robots', content: 'noindex' }] })

// The frames navigate on their own; when the concept or view changes they reopen at the
// place you were last looking at, so you compare the same page under each concept.
const lastPlace = ref<Place>('home')
const src = ref(placeHref(concept.value, 'home'))
watch([concept, view], () => {
  src.value = placeHref(concept.value, lastPlace.value)
  router.replace({ query: { concept: concept.value, view: view.value } })
})
function onMessage(event: MessageEvent) {
  if (event.origin === window.location.origin && event.data?.type === 'orbit-nav-playground') lastPlace.value = event.data.place
}
function onKey(event: KeyboardEvent) {
  if (event.target instanceof HTMLInputElement || event.metaKey || event.ctrlKey || event.altKey) return
  const k = keys[Number(event.key) - 1]
  if (k) concept.value = k
}
onMounted(() => {
  window.addEventListener('message', onMessage)
  window.addEventListener('keydown', onKey)
})
onBeforeUnmount(() => {
  window.removeEventListener('message', onMessage)
  window.removeEventListener('keydown', onKey)
})

const views: { key: View; label: string }[] = [
  { key: 'both', label: 'Both' },
  { key: 'desktop', label: 'Desktop' },
  { key: 'phone', label: 'Phone' },
]
</script>

<template>
  <div class="flex h-dvh flex-col bg-slate-100">
    <header class="shrink-0 border-b border-slate-200 bg-white">
      <div class="flex flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 sm:px-6">
        <div class="flex items-center gap-2.5">
          <OrbitSymbol class="size-6" />
          <p class="font-semibold tracking-tight text-slate-900">Navigation playground</p>
          <span class="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 ring-1 ring-amber-200 ring-inset">Exploration · sample data · nothing is saved</span>
        </div>

        <div role="tablist" aria-label="Concept" class="flex flex-wrap gap-1 rounded-2xl bg-slate-100 p-1">
          <button
            v-for="(k, i) in keys" :key="k"
            type="button" role="tab"
            :aria-selected="concept === k"
            :title="`Press ${i + 1}`"
            class="flex items-center gap-2 rounded-xl px-3 py-1.5 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
            :class="concept === k ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'"
            @click="concept = k"
          >
            <span
              class="grid size-5 place-items-center rounded-md text-[11px] font-semibold"
              :class="concept === k ? 'bg-accent-600 text-white' : 'bg-slate-200 text-slate-600'"
            >{{ concepts[k].letter }}</span>
            {{ concepts[k].name }}
          </button>
        </div>

        <div class="ml-auto flex items-center gap-3">
          <div role="radiogroup" aria-label="Show" class="flex gap-1 rounded-xl bg-slate-100 p-1 text-sm font-medium">
            <button
              v-for="v in views" :key="v.key"
              type="button" role="radio"
              :aria-checked="view === v.key"
              class="rounded-lg px-3 py-1 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
              :class="view === v.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'"
              @click="view = v.key"
            >{{ v.label }}</button>
          </div>
          <button type="button" class="link text-sm" :aria-expanded="notes" @click="notes = !notes">{{ notes ? 'Hide notes' : 'Notes' }}</button>
          <a :href="src" target="_blank" rel="noopener" class="link text-sm">Open on its own ↗</a>
        </div>
      </div>

      <div v-if="notes" class="grid gap-x-8 gap-y-3 border-t border-slate-100 px-4 py-3 text-sm sm:px-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <div>
          <p class="text-slate-700"><span class="font-semibold text-slate-900">{{ c.letter }} · {{ c.name }}.</span> {{ c.idea }}</p>
          <p class="mt-1.5 text-slate-500"><span class="font-medium text-accent-700">Arrival:</span> {{ c.arrival }}</p>
        </div>
        <ul class="flex flex-col gap-1 text-slate-600">
          <li v-for="g in c.gains" :key="g" class="flex gap-2"><span class="text-emerald-600" aria-hidden="true">+</span><span><span class="sr-only">Gain: </span>{{ g }}</span></li>
        </ul>
        <ul class="flex flex-col gap-1 text-slate-600">
          <li v-for="g in c.costs" :key="g" class="flex gap-2"><span class="text-slate-400" aria-hidden="true">−</span><span><span class="sr-only">Cost: </span>{{ g }}</span></li>
        </ul>
      </div>
    </header>

    <main class="flex min-h-0 flex-1 gap-6 p-4 sm:p-6">
      <PlaygroundFrame v-if="view === 'desktop'" :src="src" :title="`${c.name}, desktop`" class="flex-1" />
      <template v-else-if="view === 'both'">
        <PlaygroundFrame :src="src" :title="`${c.name}, desktop`" :width="1280" :height="800" device="desktop" class="flex-[3]" />
        <PlaygroundFrame :src="src" :title="`${c.name}, phone`" :width="390" :height="844" device="phone" class="flex-1" />
      </template>
      <PlaygroundFrame v-else :src="src" :title="`${c.name}, phone`" :width="390" :height="844" device="phone" class="flex-1" />
    </main>
  </div>
</template>
