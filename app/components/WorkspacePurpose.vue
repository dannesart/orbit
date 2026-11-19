<!--
  "What's this place for?" on the workspace itself: a thought someone gives their Orbit.
  Everyone sees it once it exists; the owner and stewards can change it any time, in a small
  dialog that leaves Arrival exactly as it is. Never a prompt to complete: members see nothing
  until there is something to see.
-->
<script setup lang="ts">
const props = defineProps<{
  description: string | null
  editable: boolean
  save: (changes: { description: string | null }) => Promise<unknown>
}>()

const editor = createPurposeEditor({ current: () => props.description, save: (changes) => props.save(changes) })
const { open, draft, error, saving, remaining } = editor
const dialog = useTemplateRef<HTMLDialogElement>('dialog')
const input = useTemplateRef<HTMLInputElement>('input')
const opener = useTemplateRef<HTMLButtonElement>('opener')

// The dialog element follows the editor. On close, focus returns to whichever opener is now on
// the page: the pencil, or "What's this place for?" once the purpose has been cleared.
watch(open, async (isOpen) => {
  if (isOpen) {
    dialog.value?.showModal()
    await nextTick()
    input.value?.select()
  } else {
    dialog.value?.close()
    await nextTick()
    opener.value?.focus()
  }
})

// Save disables its button while saving; if the save fails, focus goes back to what was typed.
async function submit() {
  if (!(await editor.submit()) && error.value) input.value?.focus()
}

// Escape: the browser closes the dialog itself, unless a save is in flight.
function onCancel(event: Event) {
  if (saving.value) event.preventDefault()
}
// However the dialog closed, the editor agrees, or the dialog reopens to show the save's outcome.
function onClose() {
  if (open.value && !editor.cancel()) dialog.value?.showModal()
}
// The backdrop is the dialog element itself (its content fills it). Only a press that also began
// there dismisses, so selecting text and releasing outside the panel doesn't.
let pressedBackdrop = false
function onPointerDown(event: PointerEvent) {
  pressedBackdrop = event.target === dialog.value
}
function onClick(event: MouseEvent) {
  if (pressedBackdrop && event.target === dialog.value) editor.cancel()
  pressedBackdrop = false
}
</script>

<template>
  <div class="mt-3 flex w-full max-w-md flex-col items-center">
    <p v-if="description" class="animate-rise text-balance text-slate-600 [animation-delay:250ms]">
      {{ description }}
      <button
        v-if="editable"
        ref="opener"
        type="button"
        aria-haspopup="dialog"
        aria-label="Edit what this place is for"
        class="ml-1 inline-grid size-7 place-items-center rounded-full align-middle text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
        @click="editor.start()"
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
      aria-haspopup="dialog"
      class="animate-rise rounded-full px-3 py-1 text-sm text-slate-500 transition [animation-delay:250ms] hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
      @click="editor.start()"
    >
      What’s this place for?
    </button>

    <dialog
      v-if="editable"
      ref="dialog"
      aria-labelledby="purpose-title"
      class="mx-auto mt-[12vh] w-[calc(100%-2rem)] max-w-md rounded-3xl p-0 border border-slate-200/80 bg-white text-left text-slate-800 shadow-xl shadow-slate-900/10 backdrop:bg-slate-900/20 backdrop:backdrop-blur-[2px] sm:my-auto"
      @cancel="onCancel"
      @close="onClose"
      @pointerdown="onPointerDown"
      @click="onClick"
    >
      <form class="animate-rise p-6" novalidate @submit.prevent="submit">
        <h2 id="purpose-title" class="text-lg font-semibold tracking-tight text-slate-900">What’s this place for?</h2>
        <input
          id="purpose"
          ref="input"
          v-model="draft"
          type="text"
          :maxlength="PURPOSE_MAX"
          :readonly="saving"
          autocomplete="off"
          placeholder="e.g. Planning the spring launch"
          aria-labelledby="purpose-title"
          :aria-invalid="!!error"
          aria-describedby="purpose-hint"
          class="field mt-4"
          @input="error = ''"
        >
        <p id="purpose-hint" class="mt-2 min-h-5 text-sm" :class="error ? 'text-red-700' : 'text-slate-500'" aria-live="polite">
          {{ error || (remaining <= 40 ? `${remaining} characters left` : (description ? 'Leave it empty to remove it.' : '')) }}
        </p>
        <div class="mt-5 flex items-center justify-end gap-5">
          <button type="button" class="link px-1 py-2" :disabled="saving" @click="editor.cancel()">Cancel</button>
          <button type="submit" :disabled="saving" class="btn-primary w-auto px-6">
            <Spinner v-if="saving" />
            {{ saving ? 'Saving…' : 'Save' }}
          </button>
        </div>
      </form>
    </dialog>
  </div>
</template>
