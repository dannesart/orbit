<!--
  Experiment #7: a workspace's Definitions. Only in `nuxt dev` and Netlify Deploy Previews
  (registered as a child of pages/w/[id].vue by nuxt.config.ts; production has no such route).
  Its own place in the workspace navigation, after Workflows (which use Definitions, not own them).

  A catalogue across the workspace's width, in two groups never mixed: the workspace's own (this
  tab's memory only) and those provided by Orbit (samples, read-only). Another workspace's
  Definitions are never shown, in any form. One short notice says how long anything made here lasts.
  Choosing a Definition opens it in a floating inspector beside the catalogue (a sheet on phones).
  Making or changing one happens in its own view, on purpose: never inside the inspector.

    /w/:id/definitions               the catalogue
    /w/:id/definitions?new           making a new Definition
    /w/:id/definitions?d=…&v=…       the catalogue, with one Definition at one version in the inspector
    /w/:id/definitions?d=…&next      a draft of its next version
    /w/:id/definitions?d=…&about     its name and description
-->
<script setup lang="ts">
import { ORBIT_PROVIDED } from './model'
import { enterWorkspace, shelfHasWork, shelfOf } from './store'
import DefinitionEditor from './DefinitionEditor.vue'
import DefinitionInspector from './DefinitionInspector.vue'
import DefinitionTile from './DefinitionTile.vue'
import DefinitionsIcon from './DefinitionsIcon.vue'

const { workspace: ws } = useCurrentWorkspace()
const route = useRoute()
const router = useRouter()
const context = computed(() => ({ id: ws.value.id, name: ws.value.name }))

type Mode = 'catalogue' | 'new' | 'next' | 'about'
const selected = computed(() => (typeof route.query.d === 'string' ? route.query.d : ''))
const mode = computed<Mode>(() => ('new' in route.query ? 'new' : selected.value && 'next' in route.query ? 'next' : selected.value && 'about' in route.query ? 'about' : 'catalogue'))
const inspecting = computed(() => mode.value === 'catalogue' && !!selected.value)
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
const count = (n: number) => (n === 1 ? '1 property' : `${n} properties`)

// The version just made, for the inspector to say so once: forgotten as soon as you go elsewhere.
const created = ref<number | null>(null)
watch(() => route.fullPath, () => {
  if (version.value !== created.value || mode.value !== 'catalogue') created.value = null
}, { flush: 'post' })

/** Closing returns to the catalogue: back, when that's where you came from; otherwise in place. */
function closeInspector() {
  const back = window.history.state?.back
  if (back === route.path) router.back()
  else navigateTo({ query: {} }, { replace: true })
}
// Focus returns to the card the inspector was opened from.
watch(selected, (now, before) => {
  if (now || !before) return
  nextTick(() => document.querySelector<HTMLElement>(`[data-definition-card="${CSS.escape(before)}"]`)?.focus())
})

const card = 'group flex items-center gap-3 rounded-2xl border bg-white p-4 transition hover:shadow-md hover:shadow-slate-900/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500'
const cardState = (id: string) => (id === selected.value ? 'border-accent-300 ring-4 ring-accent-50' : 'border-slate-200/80 hover:border-slate-300')
const grid = 'mt-3 grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(15rem,1fr))]'
</script>

<template>
  <main v-if="mode !== 'catalogue'" class="px-4 pt-8 pb-20 sm:px-6 sm:pt-10 lg:px-0">
    <ClientOnly>
      <DefinitionEditor :key="`${selected}-${mode}`" :workspace="context" :id="selected" :part="mode" :version="version" @created="created = $event" />
      <template #fallback>
        <p class="text-sm text-slate-500">Loading…</p>
      </template>
    </ClientOnly>
  </main>

  <main v-else class="definitions-catalogue px-4 pt-8 pb-20 transition-[padding] sm:px-6 sm:pt-10 lg:px-0 lg:pb-12" :class="{ 'definitions-catalogue--inspecting': inspecting }">
    <div class="flex flex-wrap items-center justify-between gap-4">
      <h1 class="text-2xl font-semibold tracking-tight text-slate-900">Definitions</h1>
      <NuxtLink :to="{ query: { new: null } }" class="btn-primary inline-flex w-auto items-center gap-1.5 rounded-full px-4 py-2 text-sm">
        <DefinitionsIcon name="plus" class="size-4" />
        {{ creating ? 'Continue the new Definition' : 'New Definition' }}
      </NuxtLink>
    </div>
    <p class="mt-2 max-w-2xl text-xs text-slate-500">
      A preview experiment. Anything made here stays in this browser tab, for {{ ws.name }} only, until you reload or close it. Nothing is saved.
      Orbit’s are samples that exist only in this preview.
    </p>

    <section class="mt-8" aria-labelledby="own-heading">
      <h2 id="own-heading" class="text-sm font-semibold text-slate-900">Your workspace</h2>
      <ClientOnly>
        <ul v-if="made.length" :class="grid">
          <li v-for="d in made" :key="d.id">
            <NuxtLink :to="open(d.id)" :data-definition-card="d.id" :aria-current="d.id === selected ? 'true' : undefined" :class="[card, cardState(d.id)]">
              <DefinitionTile :appearance="d.appearance" />
              <span class="min-w-0 flex-1">
                <span class="block truncate font-medium text-slate-900">{{ d.name }}</span>
                <span class="block text-xs text-slate-500">Version {{ d.versions.length }} · {{ count(d.versions.at(-1)!.fields.length) }}</span>
              </span>
            </NuxtLink>
          </li>
        </ul>
        <!-- Nothing yet: an invitation, the size of a card, to make the first one. -->
        <ul v-else :class="grid">
          <li>
            <NuxtLink :to="{ query: { new: null } }" data-first-definition :class="[card, 'border-dashed border-slate-300 hover:border-accent-300']">
              <span class="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-50 text-accent-600">
                <DefinitionsIcon name="plus" class="size-5" />
              </span>
              <span class="min-w-0 flex-1">
                <span class="block font-medium text-slate-900">Create {{ ws.name }}’s first Definition</span>
                <span class="block text-xs text-slate-500">{{ creating ? 'Continue where you left off' : 'Name it, then add its properties' }}</span>
              </span>
            </NuxtLink>
          </li>
        </ul>
      </ClientOnly>
    </section>

    <section class="mt-10" aria-labelledby="orbit-heading">
      <h2 id="orbit-heading" class="text-sm font-semibold text-slate-900">Provided by Orbit</h2>
      <ul :class="grid">
        <li v-for="d in ORBIT_PROVIDED" :key="d.id">
          <NuxtLink :to="open(d.id)" :data-definition-card="d.id" :aria-current="d.id === selected ? 'true' : undefined" :class="[card, cardState(d.id)]">
            <DefinitionTile :appearance="null" />
            <span class="min-w-0 flex-1">
              <span class="flex items-center gap-1.5">
                <span class="truncate font-medium text-slate-900">{{ d.name }}</span>
                <DefinitionsIcon name="lock" class="size-3.5 shrink-0 text-slate-400" />
                <span class="sr-only">, read-only</span>
              </span>
              <span class="block text-xs text-slate-500">Version {{ d.version }} · {{ count(d.fields.length) }}</span>
            </span>
          </NuxtLink>
        </li>
      </ul>
    </section>

    <ClientOnly>
      <DefinitionInspector v-if="inspecting" :key="selected" :workspace="context" :id="selected" :version="version" :created="created" @close="closeInspector" />
    </ClientOnly>
  </main>
</template>

<style>
/* With the inspector open on wide screens, the catalogue makes room for it rather than hiding
   under it: the stage already keeps the frame's padding (and any centring gutter) on the right. */
@media (width >= 64rem) {
  .definitions-catalogue--inspecting {
    padding-right: max(1.5rem, calc(27rem - max(0px, (100vw - 80rem) / 2) - var(--frame-reserve, 0px)));
  }
}
</style>
