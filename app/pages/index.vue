<script setup lang="ts">
import type { WorkspaceView } from '~~/server/utils/workspaces'

const account = useAccount()
const lastWorkspace = useLastWorkspace()
const { data: workspaces, error: loadError, refresh } = await useFetch<WorkspaceView[]>('/api/workspaces')

// Returning people go back to the workspace they were last in on this device, if they still
// belong to it; otherwise to their most recent one. Only workspaces the server just listed
// as theirs are candidates, so a remembered id can never lead anywhere else.
const destination = () => pickWorkspace(workspaces.value ?? [], lastWorkspace.value)

if (loadError.value?.statusCode === 401) {
  account.value = null
  throw createError({ statusCode: 401, statusMessage: 'Signed out', fatal: true })
}
if (workspaces.value?.length) {
  await navigateTo(`/w/${destination()!.id}`, { replace: true })
}

// Creating a workspace is only offered after Orbit has actually confirmed there are none.
// Any failure to load is shown as a failure, never as an empty list.
const confirmedEmpty = computed(() => !loadError.value && Array.isArray(workspaces.value) && workspaces.value.length === 0)
const retrying = ref(false)
const retryNote = ref('')

async function retry() {
  retrying.value = true
  retryNote.value = ''
  await refresh()
  retrying.value = false
  if (loadError.value?.statusCode === 401) {
    account.value = null
    await navigateTo('/sign-in')
  } else if (workspaces.value?.length) {
    await navigateTo(`/w/${destination()!.id}`, { replace: true })
  } else if (!confirmedEmpty.value) {
    retryNote.value = 'Still no luck. Give it a moment and try again.'
  }
}
</script>

<template>
  <OrbitStage>
    <section v-if="!confirmedEmpty" class="text-center" aria-labelledby="load-failed">
      <h1 id="load-failed" class="text-2xl font-semibold tracking-tight text-slate-900">
        We couldn’t reach your workspaces
      </h1>
      <p class="mx-auto mt-2 max-w-xs text-balance text-slate-500">
        Orbit couldn’t load them just now. Nothing was created or changed.
      </p>
      <button type="button" :disabled="retrying" class="btn-primary mt-8" @click="retry">
        <Spinner v-if="retrying" />
        {{ retrying ? 'Trying again…' : 'Try again' }}
      </button>
      <p class="mt-3 min-h-5 text-sm text-slate-500" aria-live="polite">{{ retryNote }}</p>
    </section>

    <CreateWorkspaceForm v-else />

    <template #footer>
      <p v-if="confirmedEmpty">You’ll be its administrator. Nothing else to set up.</p>
      <p class="mt-2">
        Signed in as <span class="font-medium text-slate-500">{{ account?.email }}</span> ·
        <button type="button" class="link text-sm" @click="signOut">Sign out</button>
      </p>
    </template>
  </OrbitStage>
</template>
