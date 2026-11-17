<script setup lang="ts">
import type { WorkspaceView } from '~~/server/utils/workspaces'

const { data: workspaces } = await useFetch<WorkspaceView[]>('/api/workspaces')

// Returning users go straight to their most recent workspace.
if (workspaces.value?.length) {
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
  <main class="relative grid min-h-dvh place-items-center overflow-hidden px-4 py-12">
    <!-- Ambient orbit rings -->
    <div class="pointer-events-none absolute inset-0 grid place-items-center" aria-hidden="true">
      <div class="absolute size-120 rounded-full bg-indigo-200/40 blur-3xl" />
      <div class="absolute size-152 rounded-full border border-indigo-100" />
      <div class="absolute size-224 rounded-full border border-indigo-100/70" />
      <div class="absolute size-152 animate-orbit">
        <span class="absolute -top-1.5 left-1/2 size-3 rounded-full bg-indigo-300" />
      </div>
      <div class="absolute size-224 animate-orbit [animation-direction:reverse] [animation-duration:40s]">
        <span class="absolute top-1/2 -left-1 size-2 rounded-full bg-violet-300" />
      </div>
    </div>

    <div class="relative w-full max-w-md animate-rise">
      <div class="mb-10 flex justify-center">
        <OrbitMark class="text-lg" />
      </div>

      <form
        class="rounded-3xl border border-white bg-white/80 p-8 shadow-xl shadow-indigo-900/5 backdrop-blur"
        novalidate
        @submit.prevent="create"
      >
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
          class="mt-2 block w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 shadow-xs outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 aria-invalid:border-rose-300 aria-invalid:focus:ring-rose-100"
          @input="error = ''"
        >
        <p
          id="workspace-name-hint"
          class="mt-2 min-h-5 text-sm"
          :class="error ? 'text-rose-600' : 'text-slate-400'"
          aria-live="polite"
        >
          {{ error || 'Your company, team or project.' }}
        </p>

        <button
          type="submit"
          :disabled="saving"
          class="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 font-medium text-white shadow-sm shadow-indigo-600/30 transition hover:bg-indigo-500 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-200 active:scale-[0.99] disabled:cursor-wait disabled:opacity-70"
        >
          <svg v-if="saving" class="size-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-opacity=".3" stroke-width="3" />
            <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" stroke-width="3" stroke-linecap="round" />
          </svg>
          {{ saving ? 'Creating…' : 'Create workspace' }}
        </button>
      </form>

      <p class="mt-6 text-center text-sm text-slate-400">
        You’ll be its administrator. Nothing else to set up.
      </p>
    </div>
  </main>
</template>
