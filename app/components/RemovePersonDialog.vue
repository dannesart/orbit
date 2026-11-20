<!--
  The one confirmation before removing someone from a workspace: who, what it means (no access to
  this workspace; their Orbit account is untouched), and that they can be invited again.
-->
<script setup lang="ts">
const props = defineProps<{ person: { name: string | null } | null; workspaceName: string; busy: boolean }>()
const emit = defineEmits<{ confirm: []; cancel: [] }>()
const dialog = useTemplateRef<HTMLDialogElement>('dialog')
const cancelButton = useTemplateRef<HTMLButtonElement>('cancelButton')
const name = computed(() => props.person?.name ?? 'this person')

watch(() => props.person, async (person) => {
  if (person) {
    dialog.value?.showModal()
    await nextTick()
    cancelButton.value?.focus() // the safe choice first
  } else {
    dialog.value?.close()
  }
})

function onCancel(event: Event) {
  event.preventDefault() // Escape: the page decides (not while the removal is with the server)
  if (!props.busy) emit('cancel')
}
</script>

<template>
  <dialog
    ref="dialog"
    aria-labelledby="remove-title"
    aria-describedby="remove-what"
    class="mx-auto mt-[12vh] w-[calc(100%-2rem)] max-w-md rounded-3xl border border-slate-200/80 bg-white p-0 text-left text-slate-800 shadow-xl shadow-slate-900/10 backdrop:bg-slate-900/20 backdrop:backdrop-blur-[2px] sm:my-auto"
    @cancel="onCancel"
  >
    <div class="animate-rise p-6">
      <h2 id="remove-title" class="text-lg font-semibold tracking-tight text-balance text-slate-900">Remove {{ name }} from {{ workspaceName }}?</h2>
      <p id="remove-what" class="mt-2 text-sm text-pretty text-slate-600">
        They’ll lose access to {{ workspaceName }} right away. Their Orbit account isn’t affected,
        and you can invite them again later.
      </p>
      <div class="mt-6 flex items-center justify-end gap-5">
        <button ref="cancelButton" type="button" class="link px-1 py-2" :disabled="busy" @click="emit('cancel')">Cancel</button>
        <button type="button" class="btn-primary w-auto px-6" :disabled="busy" @click="emit('confirm')">
          <Spinner v-if="busy" />
          {{ busy ? 'Removing…' : 'Remove' }}
        </button>
      </div>
    </div>
  </dialog>
</template>
