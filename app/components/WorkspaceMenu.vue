<!--
  The workspace in the header: its avatar and name, opening a small identity card for the
  place you're in, with what you can do here beneath it. The current workspace always comes
  from the page's own useWorkspace() state, so a renamed workspace or new purpose appears at
  once. Below that, the other workspaces you belong to, and a way to create another.
-->
<script setup lang="ts">
import type { WorkspaceView } from '~~/server/utils/workspaces'

const props = defineProps<{ workspace: Pick<WorkspaceView, 'id' | 'name' | 'description' | 'role'> }>()
const { open, root, trigger, menu, show, close, toggle, onKeydown } = useMenu()
const ids = useId()
const settingsLabel = computed(() => settingsTitle(props.workspace.role))

// Every workspace you belong to. Lazy, so it never holds up the page; while it loads, or if it
// fails, the menu still works for the workspace you're in, and a failure says so.
const { data: workspaces, error: listError, status: listStatus, refresh } =
  useFetch<WorkspaceView[]>('/api/workspaces', { lazy: true })
const yours = computed(() =>
  (workspaces.value ?? [])
    .map((w) => (w.id === props.workspace.id ? { ...w, name: props.workspace.name } : w))
    .sort((a, b) => a.name.localeCompare(b.name)),
)
// With only one, the card above already is the list.
const switchable = computed(() => yours.value.length > 1)

function goTo(path: string) {
  open.value = false
  navigateTo(path)
}

function choose(id: string) {
  if (id === props.workspace.id) close()
  else goTo(`/w/${id}`)
}

async function retry() {
  await refresh()
  await show()
}
</script>

<template>
  <!-- On phones the card spans the header (positioned against it); from sm up it hangs from the pill. -->
  <div ref="root" class="flex min-w-0 sm:relative">
    <button
      ref="trigger"
      type="button"
      aria-haspopup="menu"
      :aria-expanded="open"
      :aria-label="`${workspace.name}, workspace menu`"
      class="flex min-w-0 items-center gap-2.5 rounded-full border bg-white py-1 pr-3 pl-1 text-sm font-medium text-slate-700 transition hover:border-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
      :class="open ? 'border-slate-300' : 'border-slate-200'"
      @click="toggle"
    >
      <WorkspaceAvatar :name="workspace.name" class="size-7 shrink-0 rounded-full text-xs" />
      <span class="max-w-48 truncate">{{ workspace.name }}</span>
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
      <!-- Focus lands on the first action, so the name and purpose are announced with the menu itself. -->
      <div
        v-if="open"
        ref="menu"
        role="menu"
        :aria-labelledby="`${ids}-name`"
        :aria-describedby="workspace.description ? `${ids}-purpose` : undefined"
        class="absolute inset-x-4 top-full z-10 mt-2 overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5 shadow-lg shadow-slate-900/5 sm:inset-x-auto sm:left-0 sm:w-80"
        @keydown="onKeydown"
      >
        <div class="flex gap-3.5 px-3 pt-3 pb-3.5">
          <WorkspaceAvatar :name="workspace.name" class="size-11 shrink-0 text-lg" />
          <div class="min-w-0 flex-1 self-center">
            <p :id="`${ids}-name`" class="line-clamp-2 font-semibold tracking-tight break-words text-slate-900">
              {{ workspace.name }}
            </p>
            <p
              v-if="workspace.description"
              :id="`${ids}-purpose`"
              class="mt-1 line-clamp-3 text-sm/5 text-pretty break-words text-slate-500"
            >
              {{ workspace.description }}
            </p>
          </div>
        </div>

        <div class="mx-1.5 mb-1.5 border-t border-slate-100" role="separator" />

        <MenuItem @click="goTo(`/w/${workspace.id}/settings`)">
          <template #icon>
            <svg viewBox="0 0 16 16" class="size-4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
              <template v-if="workspace.role === 'admin'">
                <path d="M2.5 4.5h6M12.5 4.5h1M2.5 11.5h1M7.5 11.5h6" />
                <circle cx="10.5" cy="4.5" r="1.75" />
                <circle cx="5.5" cy="11.5" r="1.75" />
              </template>
              <template v-else>
                <circle cx="8" cy="8" r="5.75" />
                <path d="M8 7.25v3.5M8 5.25v.01" />
              </template>
            </svg>
          </template>
          {{ settingsLabel }}
        </MenuItem>

        <div class="mx-1.5 my-1.5 border-t border-slate-100" role="separator" />

        <template v-if="switchable">
          <p class="px-3 pt-1.5 pb-1 text-xs font-medium tracking-wide text-slate-400 uppercase" aria-hidden="true">
            Your workspaces
          </p>
          <div role="group" aria-label="Your workspaces" class="max-h-60 overflow-y-auto">
            <MenuItem v-for="w in yours" :key="w.id" @click="choose(w.id)">
              <WorkspaceAvatar :name="w.name" class="size-6 shrink-0 rounded-full text-[11px]" />
              <span class="min-w-0 flex-1 truncate">{{ w.name }}</span>
              <template v-if="w.id === workspace.id">
                <span class="sr-only">(current workspace)</span>
                <svg
                  viewBox="0 0 16 16" class="size-4 shrink-0 text-accent-600"
                  fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"
                >
                  <path d="m3.5 8.5 3 3 6-7" />
                </svg>
              </template>
            </MenuItem>
          </div>
        </template>
        <MenuItem v-else-if="listError && listStatus !== 'pending'" @click="retry">
          <template #icon>
            <svg viewBox="0 0 16 16" class="size-4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M13.5 8A5.5 5.5 0 1 1 11.9 4.1M13.5 2.5v2.75h-2.75" />
            </svg>
          </template>
          <span>Couldn’t load your other workspaces. <span class="underline underline-offset-2">Try again</span></span>
        </MenuItem>

        <MenuItem @click="goTo('/new')">
          <span class="grid size-6 shrink-0 place-items-center rounded-full border border-dashed border-slate-300 text-slate-400 transition group-hover:border-accent-300 group-hover:text-accent-600 group-focus-visible:border-accent-300 group-focus-visible:text-accent-600" aria-hidden="true">
            <svg viewBox="0 0 16 16" class="size-3.5" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round">
              <path d="M8 3.5v9M3.5 8h9" />
            </svg>
          </span>
          Create a workspace
        </MenuItem>
      </div>
    </Transition>
  </div>
</template>
