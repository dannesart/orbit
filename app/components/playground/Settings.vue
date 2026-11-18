<!--
  Playground: the workspace settings page as the owner sees it, without its "Back to" link.
  Saving changes only the sample in this browser tab, so you can watch the header follow.
-->
<script setup lang="ts">
import { useSampleWorkspaces } from '~/playground/sample'

const { current: ws } = useSampleWorkspaces()
const name = ref(ws.value.name)
const description = ref(ws.value.description ?? '')
const status = ref('')
const error = ref('')
watch(() => ws.value.id, () => {
  name.value = ws.value.name
  description.value = ws.value.description ?? ''
})

const tidy = (s: string) => s.trim().replace(/\s+/g, ' ')
const dirty = computed(() => tidy(name.value) !== ws.value.name || tidy(description.value) !== (ws.value.description ?? ''))

function submit() {
  status.value = ''
  if (!tidy(name.value)) return (error.value = 'Give your workspace a name.')
  ws.value.name = tidy(name.value)
  ws.value.description = tidy(description.value) || null
  name.value = ws.value.name
  description.value = ws.value.description ?? ''
  status.value = 'Saved in this playground only.'
}
</script>

<template>
  <div class="mx-auto max-w-xl px-4 pt-10 pb-20 sm:px-6 sm:pt-14">
    <section class="animate-rise rounded-3xl border border-slate-200/80 bg-white p-8 shadow-sm">
      <h1 class="text-2xl font-semibold tracking-tight text-slate-900">Workspace settings</h1>

      <form class="mt-8 flex flex-col" novalidate @submit.prevent="submit">
        <label for="ws-name" class="text-sm font-medium text-slate-700">Name</label>
        <input
          id="ws-name" v-model="name" type="text" maxlength="64" autocomplete="off"
          :aria-invalid="!!error" aria-describedby="ws-name-hint" class="field"
          @input="error = ''; status = ''"
        >
        <p id="ws-name-hint" class="mt-2 min-h-5 text-sm text-red-700" aria-live="polite">{{ error }}</p>

        <label for="ws-purpose" class="mt-4 text-sm font-medium text-slate-700">
          What’s this place for? <span class="font-normal text-slate-500">Optional</span>
        </label>
        <input
          id="ws-purpose" v-model="description" type="text" maxlength="280" autocomplete="off"
          placeholder="e.g. Planning the spring launch" class="field" @input="status = ''"
        >
        <p class="mt-2 min-h-5 text-sm text-slate-500">{{ ws.description ? 'Leave it empty to remove it.' : '' }}</p>

        <div class="mt-6 flex items-center gap-4">
          <button type="submit" :disabled="!dirty" class="btn-primary w-auto px-6 disabled:cursor-default">Save</button>
          <p class="text-sm text-slate-500" aria-live="polite">{{ status }}</p>
        </div>
      </form>
    </section>
  </div>
</template>
