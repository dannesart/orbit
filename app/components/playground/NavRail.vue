<!--
  Playground · C · The Workspace Rail: a slim vertical rail from md up; on phones the same
  places in a drawer opened from the header's menu button.
-->
<script setup lang="ts">
import { type Place, placeHref, places, useSampleWorkspaces } from '~/playground/sample'

defineProps<{ place: Place }>()
const drawer = useState('pg-drawer', () => false)
const { current } = useSampleWorkspaces()
const route = useRoute()
watch(() => route.fullPath, () => { drawer.value = false })
// Focus moves into the drawer when it opens, and back to the menu button when it closes.
const closer = useTemplateRef<HTMLButtonElement>('closer')
watch(drawer, async (open) => {
  await nextTick()
  if (open) closer.value?.focus()
  else document.querySelector<HTMLButtonElement>('[aria-label="Open navigation"]')?.focus()
})

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') drawer.value = false
}
</script>

<template>
  <nav aria-label="Workspace" class="sticky top-0 hidden h-[calc(100dvh-4rem)] w-22 shrink-0 border-r border-slate-200/70 bg-white/50 md:block">
    <ul class="flex flex-col items-center gap-1 pt-5">
      <li v-for="p in places" :key="p.key" class="w-full px-2">
        <NuxtLink
          :to="placeHref('c', p.key)"
          :aria-current="p.key === place ? 'page' : undefined"
          class="group relative flex flex-col items-center gap-1 rounded-xl py-2 text-[11px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
          :class="p.key === place ? 'text-slate-900' : 'text-slate-500 hover:text-slate-800'"
        >
          <span v-if="p.key === place" class="absolute top-2.5 -left-2 h-6 w-[3px] rounded-r-full bg-accent-500" aria-hidden="true" />
          <span
            class="grid size-10 place-items-center rounded-xl transition"
            :class="p.key === place ? 'bg-accent-50 text-accent-600 ring-1 ring-accent-200/70' : 'text-slate-400 group-hover:bg-slate-100 group-hover:text-slate-600'"
          >
            <PlaygroundPlaceIcon :place="p.key" class="size-[18px]" />
          </span>
          {{ p.label }}
        </NuxtLink>
      </li>
    </ul>
  </nav>

  <!-- Phones: the rail becomes a drawer. -->
  <Teleport to="body">
    <Transition enter-from-class="opacity-0" leave-to-class="opacity-0" enter-active-class="transition duration-200" leave-active-class="transition duration-150">
      <div v-if="drawer" class="fixed inset-0 z-40 bg-slate-900/20 md:hidden" aria-hidden="true" @click="drawer = false" />
    </Transition>
    <Transition enter-from-class="-translate-x-full" leave-to-class="-translate-x-full" enter-active-class="transition duration-300 ease-out" leave-active-class="transition duration-200 ease-in">
      <div
        v-if="drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
        class="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col bg-white shadow-2xl shadow-slate-900/20 md:hidden"
        @keydown="onKeydown"
      >
        <div class="flex h-16 items-center justify-between border-b border-slate-100 px-4">
          <OrbitMark />
          <button
            type="button"
            class="grid size-9 place-items-center rounded-full text-slate-500 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
            aria-label="Close navigation"
            ref="closer"
            @click="drawer = false"
          >
            <svg viewBox="0 0 16 16" class="size-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8" /></svg>
          </button>
        </div>
        <div class="flex items-center gap-3 px-5 pt-5 pb-3">
          <WorkspaceAvatar :name="current.name" class="size-9 shrink-0 rounded-xl text-sm" />
          <p class="min-w-0 truncate font-semibold tracking-tight text-slate-900">{{ current.name }}</p>
        </div>
        <ul class="flex flex-col gap-0.5 px-3">
          <li v-for="p in places" :key="p.key">
            <NuxtLink
              :to="placeHref('c', p.key)"
              :aria-current="p.key === place ? 'page' : undefined"
              class="flex items-center gap-3 rounded-xl px-3 py-3 font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
              :class="p.key === place ? 'bg-accent-50 text-accent-700' : 'text-slate-700 hover:bg-slate-50'"
            >
              <PlaygroundPlaceIcon :place="p.key" class="size-[18px]" :class="p.key === place ? 'text-accent-600' : 'text-slate-400'" />
              {{ p.label }}
            </NuxtLink>
          </li>
        </ul>
      </div>
    </Transition>
  </Teleport>
</template>
