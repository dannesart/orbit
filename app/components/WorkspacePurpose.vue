<!--
  "What's this place for?" on the workspace itself: a thought someone gives their Orbit.
  Everyone sees it once it exists; admins can add, edit or remove it in place, any time.
  Never a prompt to complete: members see nothing until there is something to see.
-->
<script setup lang="ts">
const props = defineProps<{
  description: string | null
  editable: boolean
  save: (changes: { description: string | null }) => Promise<unknown>
}>()

const MAX = 280
const editing = ref(false)
const draft = ref('')
const error = ref('')
const saving = ref(false)
const input = useTemplateRef<HTMLInputElement>('input')
const opener = useTemplateRef<HTMLButtonElement>('opener')
const remaining = computed(() => MAX - [...draft.value].length)

async function startEditing() {
  draft.value = props.description ?? ''
  error.value = ''
  editing.value = true
  await nextTick()
  input.value?.select()
}

async function stopEditing() {
  editing.value = false
  await nextTick()
  opener.value?.focus()
}

async function submit(description: string | null) {
  error.value = ''
  saving.value = true
  try {
    await props.save({ description })
    await stopEditing()
  } catch (e: any) {
    error.value = e?.data?.statusMessage || 'That didn’t save. Please try again.'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="mt-3 flex w-full max-w-md flex-col items-center">
    <form v-if="editing" class="flex w-full flex-col items-center gap-2" novalidate @submit.prevent="submit(draft)" @keydown.esc.prevent="stopEditing">
      <label for="purpose" class="text-sm font-medium text-slate-700">What’s this place for?</label>
      <input
        id="purpose"
        ref="input"
        v-model="draft"
        type="text"
        :maxlength="MAX"
        placeholder="e.g. Planning the spring launch"
        :aria-invalid="!!error"
        aria-describedby="purpose-hint"
        class="field mt-0 text-center"
        @input="error = ''"
      >
      <p id="purpose-hint" class="min-h-5 text-sm" :class="error ? 'text-red-700' : 'text-slate-500'" aria-live="polite">
        {{ error || (remaining <= 40 ? `${remaining} characters left` : '') }}
      </p>
      <div class="flex items-center gap-4 text-sm">
        <button
          type="submit"
          :disabled="saving || !draft.trim()"
          class="rounded-lg bg-accent-600 px-4 py-2 font-medium text-white transition hover:bg-accent-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-2 disabled:opacity-60"
        >
          {{ saving ? 'Saving…' : 'Save' }}
        </button>
        <button type="button" class="link" :disabled="saving" @click="stopEditing">Cancel</button>
        <button v-if="description" type="button" class="link" :disabled="saving" @click="submit(null)">Remove</button>
      </div>
    </form>

    <p v-else-if="description" class="animate-rise text-balance text-slate-600 [animation-delay:250ms]">
      {{ description }}
      <button
        v-if="editable"
        ref="opener"
        type="button"
        aria-label="Edit what this place is for"
        class="ml-1 inline-grid size-7 place-items-center rounded-full align-middle text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
        @click="startEditing"
      >
        <svg viewBox="0 0 16 16" class="size-3.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M11 2.5 13.5 5 6 12.5 3 13l.5-3L11 2.5Z" />
        </svg>
      </button>
    </p>

    <button
      v-else-if="editable"
      ref="opener"
      type="button"
      class="animate-rise rounded-full px-3 py-1 text-sm text-slate-500 transition [animation-delay:250ms] hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
      @click="startEditing"
    >
      What’s this place for?
    </button>
  </div>
</template>
