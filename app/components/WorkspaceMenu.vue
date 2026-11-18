<!--
  The workspace in the header: its avatar and name, opening a small identity card for the
  place you're in, with what you can do here beneath it. Everything shown comes from the
  page's own useWorkspace() state, so a renamed workspace or new purpose appears at once.
  Room for "other workspaces" later: a section between the identity and the actions.
-->
<script setup lang="ts">
import type { WorkspaceView } from '~~/server/utils/workspaces'

const props = defineProps<{ workspace: Pick<WorkspaceView, 'id' | 'name' | 'description' | 'role'> }>()
const { open, root, trigger, menu, toggle, onKeydown } = useMenu()
const ids = useId()
// Same page for everyone; only admins can change things there, so members are told what they will find.
const settingsLabel = computed(() => (props.workspace.role === 'admin' ? 'Workspace settings' : 'About this workspace'))

function goToSettings() {
  open.value = false
  navigateTo(`/w/${props.workspace.id}/settings`)
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

        <button
          type="button" role="menuitem"
          class="group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-slate-700 transition outline-none hover:bg-accent-50 hover:text-accent-700 focus-visible:bg-accent-50 focus-visible:text-accent-700"
          @click="goToSettings"
        >
          <svg
            viewBox="0 0 16 16" class="size-4 shrink-0 text-slate-400 transition group-hover:text-accent-600 group-focus-visible:text-accent-600"
            fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"
          >
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
          {{ settingsLabel }}
        </button>
      </div>
    </Transition>
  </div>
</template>
