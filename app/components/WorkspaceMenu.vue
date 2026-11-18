<!-- The workspace pill in the header: its avatar and name, opening a small menu. -->
<script setup lang="ts">
import type { WorkspaceView } from '~~/server/utils/workspaces'

const props = defineProps<{ workspace: Pick<WorkspaceView, 'id' | 'name'> }>()
const { open, root, trigger, menu, toggle, onKeydown } = useMenu()

function goToSettings() {
  open.value = false
  navigateTo(`/w/${props.workspace.id}/settings`)
}
</script>

<template>
  <div ref="root" class="relative min-w-0">
    <button
      ref="trigger"
      type="button"
      aria-haspopup="menu"
      :aria-expanded="open"
      :aria-label="`${workspace.name}, workspace menu`"
      class="flex min-w-0 items-center gap-2.5 rounded-full border border-slate-200 bg-white py-1 pr-3 pl-1 text-sm font-medium text-slate-700 transition hover:border-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
      @click="toggle"
    >
      <WorkspaceAvatar :name="workspace.name" class="size-7 rounded-full text-xs" />
      <span class="max-w-48 truncate">{{ workspace.name }}</span>
      <svg viewBox="0 0 16 16" class="size-3.5 shrink-0 text-slate-400" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
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
        :aria-label="`${workspace.name}, workspace`"
        class="absolute left-0 z-10 mt-2 w-60 overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5 shadow-lg shadow-slate-900/5"
        @keydown="onKeydown"
      >
        <button
          type="button" role="menuitem"
          class="w-full rounded-xl px-3 py-2 text-left text-sm text-slate-700 transition outline-none hover:bg-slate-50 focus-visible:bg-slate-100"
          @click="goToSettings"
        >
          Workspace settings
        </button>
      </div>
    </Transition>
  </div>
</template>
