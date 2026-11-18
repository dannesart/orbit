<!--
  Orbit's one way to create a workspace: the first one (from the home page, once Orbit has
  confirmed there are none) and any after it (from the workspace menu, at /new).
-->
<script setup lang="ts">
import type { WorkspaceView } from '~~/server/utils/workspaces'

defineProps<{ another?: boolean }>()

const name = ref('')
const error = ref('')
const saving = ref(false)
const input = useTemplateRef<HTMLInputElement>('input')
onMounted(() => input.value?.focus())

async function create() {
  error.value = ''
  if (!name.value.trim()) {
    error.value = 'Give your workspace a name.'
    return
  }
  saving.value = true
  try {
    const workspace = await $fetch<WorkspaceView>('/api/workspaces', {
      method: 'POST',
      body: { name: name.value },
    })
    await navigateTo(`/w/${workspace.id}?welcome=1`)
  } catch (e: any) {
    error.value = e?.data?.statusMessage || 'Something went wrong. Please try again.'
    saving.value = false
  }
}
</script>

<template>
  <form novalidate @submit.prevent="create">
    <div class="mb-6 flex justify-center">
      <WorkspaceAvatar :name="name" class="size-16 text-2xl" />
    </div>

    <h1 class="text-center text-2xl font-semibold tracking-tight text-slate-900">
      {{ another ? 'Create another workspace' : 'Create your workspace' }}
    </h1>
    <p class="mx-auto mt-2 max-w-xs text-center text-balance text-slate-500">
      <template v-if="another">A place of its own, with its own people and purpose. All it needs to begin is a name.</template>
      <template v-else>A workspace is a shared home for your team. All it needs to begin is a name.</template>
    </p>

    <label for="workspace-name" class="mt-8 block text-sm font-medium text-slate-700">
      Workspace name
    </label>
    <input
      id="workspace-name"
      ref="input"
      v-model="name"
      type="text"
      maxlength="64"
      autocomplete="off"
      placeholder="e.g. Northwind Studio"
      :aria-invalid="!!error"
      aria-describedby="workspace-name-hint"
      class="field"
      @input="error = ''"
    >
    <p
      id="workspace-name-hint"
      class="mt-2 min-h-5 text-sm"
      :class="error ? 'text-red-700' : 'text-slate-400'"
      aria-live="polite"
    >
      {{ error || 'Your company, team or project.' }}
    </p>

    <button type="submit" :disabled="saving" class="btn-primary mt-4">
      <Spinner v-if="saving" />
      {{ saving ? 'Creating…' : 'Create workspace' }}
    </button>
  </form>
</template>
