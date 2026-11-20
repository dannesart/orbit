<!--
  The one confirmation before handing someone ownership: who (as People shows them), which
  workspace, and what changes for both of them, including the invitations that are withdrawn.
  Nothing is sent until Transfer ownership is pressed; Cancel, focused first, sends nothing.
-->
<script setup lang="ts">
import type { Role } from '~~/server/utils/workspaces'

const props = defineProps<{ person: { name: string | null; role: Role } | null; workspaceName: string; busy: boolean }>()
const emit = defineEmits<{ confirm: []; cancel: [] }>()
const dialog = useTemplateRef<HTMLDialogElement>('dialog')
const cancelButton = useTemplateRef<HTMLButtonElement>('cancelButton')
// Kept while the dialog closes, so its words don't change under the closing animation.
const copy = ref<ReturnType<typeof transferCopy> | null>(null)

watch(() => props.person, async (person) => {
  if (person) {
    copy.value = transferCopy(person, props.workspaceName)
    dialog.value?.showModal()
    await nextTick()
    cancelButton.value?.focus() // the safe choice first
  } else {
    dialog.value?.close()
  }
})

function onCancel(event: Event) {
  event.preventDefault() // Escape: the page decides (not while the transfer is with the server)
  if (!props.busy) emit('cancel')
}
</script>

<template>
  <dialog
    ref="dialog"
    aria-labelledby="transfer-title"
    aria-describedby="transfer-who transfer-what"
    class="mx-auto mt-[12vh] w-[calc(100%-2rem)] max-w-md rounded-3xl border border-slate-200/80 bg-white p-0 text-left text-slate-800 shadow-xl shadow-slate-900/10 backdrop:bg-slate-900/20 backdrop:backdrop-blur-[2px] sm:my-auto"
    @cancel="onCancel"
  >
    <div v-if="copy" class="animate-rise p-6">
      <h2 id="transfer-title" class="text-lg font-semibold tracking-tight text-balance text-slate-900">{{ copy.title }}</h2>
      <p id="transfer-who" class="mt-2 text-sm text-pretty text-slate-600">{{ copy.who }}</p>
      <ul id="transfer-what" class="mt-3 flex list-disc flex-col gap-1.5 pl-5 text-sm text-pretty text-slate-600 marker:text-slate-300">
        <li v-for="point in copy.points" :key="point">{{ point }}</li>
      </ul>
      <div class="mt-6 flex items-center justify-end gap-5">
        <button ref="cancelButton" type="button" class="link px-1 py-2" :disabled="busy" @click="emit('cancel')">Cancel</button>
        <button type="button" class="btn-primary w-auto px-6" :disabled="busy" @click="emit('confirm')">
          <Spinner v-if="busy" />
          {{ busy ? 'Transferring…' : 'Transfer ownership' }}
        </button>
      </div>
    </div>
  </dialog>
</template>
