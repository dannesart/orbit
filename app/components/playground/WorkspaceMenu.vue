<!--
  Playground copy of the real WorkspaceMenu: same markup and behaviour, sample data instead of
  the API. With `places` (concept D) the menu also carries Home, People and Settings.
  Choosing another workspace switches the sample; "Create a workspace" does nothing here.
-->
<script setup lang="ts">
import { type ConceptKey, type Place, placeHref, places as allPlaces, useSampleWorkspaces } from '~/playground/sample'

const props = defineProps<{ concept: ConceptKey; place: Place; places?: boolean }>()
const { all, current, currentId } = useSampleWorkspaces()
const { open, root, trigger, menu, close, toggle, onKeydown } = useMenu()
const ids = useId()
const yours = computed(() => [...all.value].sort((a, b) => a.name.localeCompare(b.name)))

function goTo(place: Place) {
  open.value = false
  navigateTo(placeHref(props.concept, place))
}

function choose(id: string) {
  if (id === currentId.value) return close()
  currentId.value = id
  goTo('home')
}
</script>

<template>
  <div ref="root" class="flex min-w-0 sm:relative">
    <button
      ref="trigger"
      type="button"
      aria-haspopup="menu"
      :aria-expanded="open"
      :aria-label="`${current.name}, workspace menu`"
      class="flex min-w-0 items-center gap-2.5 rounded-full border bg-white py-1 pr-3 pl-1 text-sm font-medium text-slate-700 transition hover:border-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
      :class="open ? 'border-slate-300' : 'border-slate-200'"
      @click="toggle"
    >
      <WorkspaceAvatar :name="current.name" class="size-7 shrink-0 rounded-full text-xs" />
      <span class="max-w-48 truncate">{{ current.name }}</span>
      <svg
        viewBox="0 0 16 16" class="size-3.5 shrink-0 text-slate-400 transition-transform duration-200"
        :class="{ 'rotate-180': open }"
        fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"
      >
        <path d="m4 6 4 4 4-4" />
      </svg>
    </button>

    <Transition
      enter-from-class="opacity-0 -translate-y-1" leave-to-class="opacity-0 -translate-y-1"
      enter-active-class="transition duration-150" leave-active-class="transition duration-100"
    >
      <div
        v-if="open"
        ref="menu"
        role="menu"
        :aria-labelledby="`${ids}-name`"
        class="absolute inset-x-4 top-full z-30 mt-2 overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5 shadow-lg shadow-slate-900/5 sm:inset-x-auto sm:left-0 sm:w-80"
        @keydown="onKeydown"
      >
        <div class="flex gap-3.5 px-3 pt-3 pb-3.5">
          <WorkspaceAvatar :name="current.name" class="size-11 shrink-0 text-lg" />
          <div class="min-w-0 flex-1 self-center">
            <p :id="`${ids}-name`" class="line-clamp-2 font-semibold tracking-tight break-words text-slate-900">{{ current.name }}</p>
            <p v-if="current.description" class="mt-1 line-clamp-3 text-sm/5 text-pretty break-words text-slate-500">{{ current.description }}</p>
          </div>
        </div>

        <div class="mx-1.5 mb-1.5 border-t border-slate-100" role="separator" />

        <!-- Concept D: the places of this workspace, where you are marked. -->
        <div v-if="places" role="group" aria-label="Places in this workspace">
          <MenuItem
            v-for="p in allPlaces" :key="p.key"
            :aria-current="p.key === place ? 'page' : undefined"
            @click="goTo(p.key)"
          >
            <template #icon><PlaygroundPlaceIcon :place="p.key" :class="p.key === place ? 'text-accent-600' : ''" /></template>
            <span class="flex-1">{{ p.label }}</span>
            <span v-if="p.key === place" class="size-1.5 rounded-full bg-accent-500" aria-hidden="true" />
          </MenuItem>
        </div>
        <MenuItem v-else @click="goTo('settings')">
          <template #icon><PlaygroundPlaceIcon place="settings" /></template>
          Workspace settings
        </MenuItem>

        <div class="mx-1.5 my-1.5 border-t border-slate-100" role="separator" />

        <p class="px-3 pt-1.5 pb-1 text-xs font-medium tracking-wide text-slate-400 uppercase" aria-hidden="true">Your workspaces</p>
        <div role="group" aria-label="Your workspaces">
          <MenuItem v-for="w in yours" :key="w.id" @click="choose(w.id)">
            <WorkspaceAvatar :name="w.name" class="size-6 shrink-0 rounded-full text-[11px]" />
            <span class="min-w-0 flex-1 truncate">{{ w.name }}</span>
            <template v-if="w.id === currentId">
              <span class="sr-only">(current workspace)</span>
              <svg viewBox="0 0 16 16" class="size-4 shrink-0 text-accent-600" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="m3.5 8.5 3 3 6-7" />
              </svg>
            </template>
          </MenuItem>
        </div>

        <MenuItem @click="close()">
          <span class="grid size-6 shrink-0 place-items-center rounded-full border border-dashed border-slate-300 text-slate-400 transition group-hover:border-accent-300 group-hover:text-accent-600" aria-hidden="true">
            <svg viewBox="0 0 16 16" class="size-3.5" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"><path d="M8 3.5v9M3.5 8h9" /></svg>
          </span>
          Create a workspace
        </MenuItem>
      </div>
    </Transition>
  </div>
</template>
