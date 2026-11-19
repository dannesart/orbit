<script setup lang="ts">
import type { WorkspaceView } from '~~/server/utils/workspaces'

defineProps<{ workspace: Pick<WorkspaceView, 'id' | 'name' | 'description'> }>()
</script>

<template>
  <!-- z-20: backdrop-blur creates a stacking context; keep the menus above the page. -->
  <header class="relative z-20 border-b border-slate-200/70 bg-white/70 backdrop-blur">
    <!-- orbit-frame: the frame the workspace navigation rail is anchored to (main.css). -->
    <div class="orbit-frame flex h-16 items-center justify-between gap-4">
      <div class="flex min-w-0 items-center gap-3">
        <OrbitMark />
        <span class="text-slate-300" aria-hidden="true">/</span>
        <WorkspaceMenu :workspace="workspace" />
      </div>
      <IdentityMenu class="shrink-0" />
    </div>
  </header>
</template>
