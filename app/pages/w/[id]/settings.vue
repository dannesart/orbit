<script setup lang="ts">
const route = useRoute()
const { workspace: ws, isAdmin, save } = await useWorkspace(String(route.params.id))
useHead({ title: () => `Settings · ${ws.value.name} · Orbit` })

const name = ref(ws.value.name)
const description = ref(ws.value.description ?? '')
const errors = reactive<{ name?: string; description?: string }>({})
const saving = ref(false)
const status = ref('')

// Compare tidied values, so stray spaces don't count as a change.
const tidy = (s: string) => s.trim().replace(/\s+/g, ' ')
const changes = computed(() => {
  const next: { name?: string; description?: string | null } = {}
  if (tidy(name.value) !== ws.value.name) next.name = name.value
  if (tidy(description.value) !== (ws.value.description ?? '')) next.description = tidy(description.value) || null
  return next
})
const dirty = computed(() => Object.keys(changes.value).length > 0)
const remaining = computed(() => 280 - [...description.value].length)

async function submit() {
  errors.name = errors.description = undefined
  status.value = ''
  if (!tidy(name.value)) {
    errors.name = 'Give your workspace a name.'
    return
  }
  saving.value = true
  try {
    const saved = await save(changes.value)
    name.value = saved.name
    description.value = saved.description ?? ''
    status.value = 'Saved.'
  } catch (e: any) {
    const field = e?.data?.data?.field as 'name' | 'description' | undefined
    const message = e?.data?.statusMessage || 'That didn’t save. Please try again.'
    if (field) errors[field] = message
    else status.value = message
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="min-h-dvh">
    <WorkspaceHeader :workspace="ws" />

    <main class="mx-auto max-w-xl px-4 pt-10 pb-20 sm:px-6 sm:pt-14">
      <NuxtLink :to="`/w/${ws.id}`" class="link inline-flex items-center gap-1.5 text-sm">
        <svg viewBox="0 0 16 16" class="size-3.5" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 4 6 8l4 4" /></svg>
        Back to {{ ws.name }}
      </NuxtLink>

      <section class="mt-6 animate-rise rounded-3xl border border-slate-200/80 bg-white p-8 shadow-sm">
        <h1 class="text-2xl font-semibold tracking-tight text-slate-900">Workspace settings</h1>

        <form v-if="isAdmin" class="mt-8 flex flex-col" novalidate @submit.prevent="submit">
          <label for="ws-name" class="text-sm font-medium text-slate-700">Name</label>
          <input
            id="ws-name"
            v-model="name"
            type="text"
            maxlength="64"
            autocomplete="off"
            :aria-invalid="!!errors.name"
            aria-describedby="ws-name-hint"
            class="field"
            @input="errors.name = undefined; status = ''"
          >
          <p id="ws-name-hint" class="mt-2 min-h-5 text-sm text-red-700" aria-live="polite">{{ errors.name }}</p>

          <label for="ws-purpose" class="mt-4 text-sm font-medium text-slate-700">
            What’s this place for? <span class="font-normal text-slate-500">Optional</span>
          </label>
          <input
            id="ws-purpose"
            v-model="description"
            type="text"
            maxlength="280"
            autocomplete="off"
            placeholder="e.g. Planning the spring launch"
            :aria-invalid="!!errors.description"
            aria-describedby="ws-purpose-hint"
            class="field"
            @input="errors.description = undefined; status = ''"
          >
          <p id="ws-purpose-hint" class="mt-2 min-h-5 text-sm" :class="errors.description ? 'text-red-700' : 'text-slate-500'" aria-live="polite">
            {{ errors.description || (remaining <= 40 ? `${remaining} characters left` : (ws.description ? 'Leave it empty to remove it.' : '')) }}
          </p>

          <div class="mt-6 flex items-center gap-4">
            <button type="submit" :disabled="saving || !dirty" class="btn-primary w-auto px-6" :class="{ 'disabled:cursor-default': !saving }">
              <Spinner v-if="saving" />
              {{ saving ? 'Saving…' : 'Save' }}
            </button>
            <p class="text-sm text-slate-500" aria-live="polite">{{ status }}</p>
          </div>
        </form>

        <div v-else class="mt-6">
          <p class="text-slate-500">Only this workspace’s admins can change these.</p>
          <dl class="mt-6 flex flex-col gap-5">
            <div>
              <dt class="text-sm font-medium text-slate-700">Name</dt>
              <dd class="mt-1 text-slate-900">{{ ws.name }}</dd>
            </div>
            <div>
              <dt class="text-sm font-medium text-slate-700">What’s this place for?</dt>
              <dd class="mt-1" :class="ws.description ? 'text-slate-900' : 'text-slate-500'">
                {{ ws.description ?? 'Nobody has said yet.' }}
              </dd>
            </div>
          </dl>
        </div>
      </section>
    </main>
  </div>
</template>
