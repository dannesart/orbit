<script setup lang="ts">
import type { WorkspaceView } from '~~/server/utils/workspaces'

const account = useAccount()
const { data: workspaces, error: loadError } = await useFetch<WorkspaceView[]>('/api/workspaces')

if (loadError.value?.statusCode === 401) {
  account.value = null
  throw createError({ statusCode: 401, statusMessage: 'Signed out', fatal: true })
}
if (workspaces.value?.length) {
  // Returning users go straight to their most recent workspace.
  await navigateTo(`/w/${workspaces.value[0]!.id}`, { replace: true })
}

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
  <OrbitStage>
    <form novalidate @submit.prevent="create">
      <div class="mb-6 flex justify-center">
        <WorkspaceAvatar :name="name" class="size-16 text-2xl" />
      </div>

      <h1 class="text-center text-2xl font-semibold tracking-tight text-slate-900">
        Create your workspace
      </h1>
      <p class="mx-auto mt-2 max-w-xs text-center text-balance text-slate-500">
        A workspace is a shared home for your team. All it needs to begin is a name.
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

    <template #footer>
      <p>You’ll be its administrator. Nothing else to set up.</p>
      <p class="mt-2">
        Signed in as <span class="font-medium text-slate-500">{{ account?.email }}</span> ·
        <button type="button" class="link text-sm" @click="signOut">Sign out</button>
      </p>
    </template>
  </OrbitStage>
</template>
