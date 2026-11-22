<!--
  Experiment #7: a workspace's Definitions. Only in `nuxt dev` and Netlify Deploy Previews
  (registered as a child of pages/w/[id].vue by nuxt.config.ts; production has no such route).
  Reached from the Workflows place: no navigation item of its own.

  Two groups, never mixed: what's made in this workspace (this tab's memory only), and what's
  available to it (Orbit-provided samples, read-only). Another workspace's Definitions are never
  shown, in any form. The page says plainly how long anything made here lasts.

    /w/:id/definitions            the overview
    /w/:id/definitions?new        making a new Definition
    /w/:id/definitions?d=…&v=…    one Definition, at one version
-->
<script setup lang="ts">
import { ORBIT_DESCRIPTIONS, ORBIT_PROVIDED } from './model'
import { enterWorkspace, shelfHasWork, shelfOf } from './store'
import DefinitionCreate from './DefinitionCreate.vue'
import DefinitionDetail from './DefinitionDetail.vue'

const { workspace: ws } = useCurrentWorkspace()
const route = useRoute()
const context = computed(() => ({ id: ws.value.id, name: ws.value.name }))

const mode = computed<'overview' | 'new' | 'definition'>(() => ('new' in route.query ? 'new' : typeof route.query.d === 'string' ? 'definition' : 'overview'))
const selected = computed(() => (typeof route.query.d === 'string' ? route.query.d : ''))
const version = computed(() => {
  const v = Number(route.query.v)
  return Number.isInteger(v) && v > 0 ? v : null
})
useHead({ title: () => `Definitions · ${ws.value.name} · Orbit` })

// The shelf is read in the browser only: the server never sees what's made here.
const ready = ref(false)
onMounted(() => {
  enterWorkspace(context.value)
  ready.value = true
})
const made = computed(() => (ready.value ? shelfOf(ws.value.id).made : []))
const creating = computed(() => (ready.value ? shelfOf(ws.value.id).creating : null))

// A reload or closing the tab ends everything made here: the browser asks first, only if there's any.
function onBeforeUnload(event: BeforeUnloadEvent) {
  if (!shelfHasWork(ws.value.id)) return
  event.preventDefault()
  event.returnValue = ''
}
onMounted(() => window.addEventListener('beforeunload', onBeforeUnload))
onBeforeUnmount(() => window.removeEventListener('beforeunload', onBeforeUnload))

const open = (id: string) => ({ query: { d: id } })
const card = 'group flex flex-col rounded-2xl bg-white p-4 ring-1 ring-slate-200 transition hover:ring-accent-300 hover:shadow-md hover:shadow-accent-900/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500'
const count = (n: number) => (n === 1 ? '1 property' : `${n} properties`)
</script>

<template>
  <main class="mx-auto max-w-2xl px-4 pt-10 pb-20 sm:px-6 sm:pt-14">
    <ClientOnly>
      <DefinitionCreate v-if="mode === 'new'" :workspace="context" @created="navigateTo({ query: { d: $event } }, { replace: true })" @cancel="navigateTo({ query: {} })" />
      <DefinitionDetail v-else-if="mode === 'definition'" :key="selected" :workspace="context" :id="selected" :version="version" />
      <template #fallback>
        <p v-if="mode !== 'overview'" class="text-sm text-slate-500">Loading…</p>
      </template>
    </ClientOnly>

    <div v-if="mode === 'overview'" class="flex flex-col gap-4">
      <section class="animate-rise rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm sm:p-8" aria-labelledby="definitions">
        <p class="text-xs font-semibold tracking-wide text-accent-700 uppercase">Experiment · previews only</p>
        <h1 id="definitions" class="mt-2 text-2xl font-semibold tracking-tight text-slate-900">Definitions</h1>
        <p class="mt-2 text-slate-600">
          A Definition describes one kind of information, such as a person or an invoice: what it’s called, what it means and what it contains.
          It holds no information itself. A Person Definition says what every person’s information contains, without anyone in it.
        </p>
        <p class="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600 ring-1 ring-slate-200/70">
          Anything made here stays in this browser tab, for {{ ws.name }} only, until you reload or close it. Nothing is saved, and nobody else sees it.
        </p>
      </section>

      <section class="animate-rise rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm sm:p-8" aria-labelledby="made-heading">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="made-heading" class="text-base font-semibold text-slate-900">Made in {{ ws.name }}</h2>
            <p class="text-sm text-slate-500">{{ ws.name }}’s own. Made and changed here.</p>
          </div>
          <NuxtLink :to="{ query: { new: null } }" class="btn-primary w-auto rounded-full px-4 py-2 text-sm">
            {{ creating ? 'Continue the new Definition' : 'New Definition' }}
          </NuxtLink>
        </div>
        <ul v-if="made.length" class="mt-4 grid gap-2 sm:grid-cols-2">
          <li v-for="d in made" :key="d.id">
            <NuxtLink :to="open(d.id)" :class="card">
              <span class="font-medium text-slate-900 group-hover:text-accent-800">{{ d.name }}</span>
              <span v-if="d.description" class="mt-0.5 line-clamp-2 text-sm text-slate-600">{{ d.description }}</span>
              <span class="mt-2 text-xs text-slate-500">
                Version {{ d.versions.length }} · {{ count(d.versions.at(-1)!.fields.length) }}<template v-if="shelfOf(ws.id).evolving[d.id]"> · a draft of version {{ d.versions.length + 1 }}</template>
              </span>
            </NuxtLink>
          </li>
        </ul>
        <p v-else class="mt-4 rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500">
          Nothing is made in {{ ws.name }} in this tab.
        </p>
      </section>

      <section class="animate-rise rounded-3xl border border-slate-200/80 bg-white/70 p-6 shadow-sm sm:p-8" aria-labelledby="available-heading">
        <h2 id="available-heading" class="text-base font-semibold text-slate-900">Available to {{ ws.name }}</h2>
        <p class="text-sm text-slate-500">Provided by Orbit. {{ ws.name }} can use them, not change them. These are samples that exist only in this preview.</p>
        <ul class="mt-4 grid gap-2 sm:grid-cols-2">
          <li v-for="d in ORBIT_PROVIDED" :key="d.id">
            <NuxtLink :to="open(d.id)" :class="[card, 'bg-slate-50/80']">
              <span class="flex items-center gap-2">
                <span class="font-medium text-slate-900 group-hover:text-accent-800">{{ d.name }}</span>
                <span class="rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-slate-500 ring-1 ring-slate-200">Orbit · sample</span>
              </span>
              <span class="mt-0.5 text-sm text-slate-600">{{ ORBIT_DESCRIPTIONS[d.id] }}</span>
              <span class="mt-2 text-xs text-slate-500">Version {{ d.version }} · {{ count(d.fields.length) }} · read-only</span>
            </NuxtLink>
          </li>
        </ul>
      </section>
    </div>
  </main>
</template>
