<script setup lang="ts">
import type { WorkspaceView } from '~~/server/utils/workspaces'

defineProps<{ workspace: Pick<WorkspaceView, 'id' | 'name' | 'description'> }>()
</script>

<template>
  <!-- z-20: backdrop-blur creates a stacking context; keep the menus above the page. -->
  <header class="relative z-20 border-b border-slate-200/70 bg-white/70 backdrop-blur">
    <div class="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
      <div class="flex min-w-0 items-center gap-3">
        <OrbitMark />
        <span class="text-slate-300" aria-hidden="true">/</span>
        <WorkspaceMenu :workspace="workspace" />
      </div>
      <IdentityMenu class="shrink-0" />
    </div>
  </header>
</template>
