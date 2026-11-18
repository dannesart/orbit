import type { Role, WorkspaceDetail, WorkspaceView } from '~~/server/utils/workspaces'

/** The settings page is the same for everyone, but only admins can change things there. */
export const settingsTitle = (role: Role) => (role === 'admin' ? 'Workspace settings' : 'About this workspace')

/**
 * The current workspace, shared by every page and component that shows it, under one key:
 * after an edit, `save()` updates it in place, so the header, title and arrival all follow.
 */
export async function useWorkspace(id: string) {
  const account = useAccount()
  const last = useLastWorkspace() // composables before the first await, while Nuxt's context is set
  const key = `workspace:${id}`
  const { data, error } = await useFetch<WorkspaceDetail>(`/api/workspaces/${id}`, { key })

  if (error.value?.statusCode === 401) {
    account.value = null
    throw createError({ statusCode: 401, statusMessage: 'Signed out', fatal: true })
  }
  // "Out of reach" only when the API confirms it; any other failure is reported as one
  // (error.vue offers a Try again that reloads the same page).
  if (error.value?.statusCode === 404) {
    throw createError({ statusCode: 404, statusMessage: 'Workspace not found', fatal: true })
  }
  if (error.value || !data.value) {
    throw createError({ statusCode: 503, statusMessage: 'Workspace unavailable', fatal: true })
  }

  // You made it in, so this is where `/` brings you back to on this device.
  if (last.value !== id) last.value = id

  const workspace = computed(() => data.value!)

  /** Send only the fields that change; the server checks the caller is an admin. */
  async function save(changes: { name?: string; description?: string | null }) {
    const updated = await $fetch<WorkspaceView>(`/api/workspaces/${id}`, { method: 'PATCH', body: changes })
    data.value = { ...data.value!, ...updated }
    return updated
  }

  return { workspace, isAdmin: computed(() => data.value?.role === 'admin'), save }
}
