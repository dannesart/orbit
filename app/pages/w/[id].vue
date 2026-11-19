<!--
  The workspace layout: everything under /w/:id (Arrival, People, Settings) renders inside it.
  It loads the workspace once and shares it with those pages (useCurrentWorkspace), and keeps
  the header and the navigation mounted while you move between them, so the navigation's moon
  glides instead of starting over. Moving to another workspace starts a fresh layout.

  Loading, "out of reach" and failures are decided here, by useWorkspace, exactly as each page
  decided them before: signed out → sign-in, not a member → 404, anything else → honest 503.
-->
<script setup lang="ts">
const route = useRoute()
const context = await useWorkspace(String(route.params.id))
provideCurrentWorkspace(context)
const { workspace: ws, canManage } = context

// Let workspace pages reach under a phone's safe areas, so the bottom pill can clear them itself.
useHead({ meta: [{ name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' }] })
</script>

<template>
  <div class="min-h-dvh">
    <WorkspaceHeader :workspace="ws" />
    <div class="workspace-stage relative">
      <WorkspaceNav variant="rail" :workspace-id="ws.id" :can-manage="canManage" />
      <NuxtPage />
      <WorkspaceNav variant="pill" :workspace-id="ws.id" :can-manage="canManage" />
    </div>
  </div>
</template>
