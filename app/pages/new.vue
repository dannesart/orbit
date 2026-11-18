<script setup lang="ts">
// Reached from the workspace menu. Creating doesn't need the membership list, so this page
// works the same whether you belong to one workspace, many, or none.
useHead({ title: 'New workspace · Orbit' })
</script>

<template>
  <OrbitStage>
    <CreateWorkspaceForm another />

    <template #footer>
      <p>A new place for you and your people. Your other workspaces stay just as they are.</p>
      <p class="mt-2">
        <NuxtLink to="/" class="link text-sm">Never mind, take me back</NuxtLink>
      </p>
    </template>
  </OrbitStage>
</template>
