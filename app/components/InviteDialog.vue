<!--
  Inviting someone: an email address and a role, one action, then the link to share. Only shown
  to people the server says may invite (`roles` is the workspace's invitationRoles); the Steward
  choice appears only when the server offers it. Orbit sends no email: the link is shared by hand.
-->
<script setup lang="ts">
import type { Role } from '~~/server/utils/workspaces'

const props = defineProps<{ workspaceId: string; roles: Role[] }>()
const emit = defineEmits<{ created: [] }>()

const editor = createInvitationEditor({
  roles: () => props.roles,
  create: (request) => $fetch<{ id: string }>(`/api/workspaces/${props.workspaceId}/invitations`, { method: 'POST', body: request }),
  origin: () => window.location.origin,
})
const { open, email, role, roles, error, saving, link, invited } = editor
const dialog = useTemplateRef<HTMLDialogElement>('dialog')
const input = useTemplateRef<HTMLInputElement>('input')
const opener = useTemplateRef<HTMLButtonElement>('opener')
const copied = ref<boolean | null>(null)

watch(open, async (isOpen) => {
  if (isOpen) {
    dialog.value?.showModal()
    await nextTick()
    input.value?.focus()
  } else {
    dialog.value?.close()
    await nextTick()
    opener.value?.focus()
  }
})

async function submit() {
  copied.value = null
  if (await editor.submit()) emit('created')
  else if (error.value) input.value?.focus()
}
async function copy() {
  copied.value = await copyText(link.value!, navigator.clipboard)
}
async function another() {
  editor.again()
  copied.value = null
  await nextTick()
  input.value?.focus()
}

function onCancel(event: Event) {
  if (saving.value) event.preventDefault()
}
function onClose() {
  if (open.value && !editor.cancel()) dialog.value?.showModal()
}
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
  <div>
    <button ref="opener" type="button" aria-haspopup="dialog" class="btn-primary w-auto px-5 py-2.5 text-sm" @click="editor.start()">
      Invite someone
    </button>

    <dialog
      ref="dialog"
      aria-labelledby="invite-title"
      class="mx-auto mt-[12vh] w-[calc(100%-2rem)] max-w-md rounded-3xl border border-slate-200/80 bg-white p-0 text-left text-slate-800 shadow-xl shadow-slate-900/10 backdrop:bg-slate-900/20 backdrop:backdrop-blur-[2px] sm:my-auto"
      @cancel="onCancel"
      @close="onClose"
      @pointerdown="onPointerDown"
      @click="onClick"
    >
      <!--
        Someone else's address, never your own: no autofill or suggestions. There is no standard
        autocomplete token for another person's email, so this gives browsers every standard signal
        (off on the form and the field, a name that isn't "email") rather than any trick. Extensions
        such as password managers decide for themselves.
      -->
      <form v-if="!link" class="animate-rise p-6" novalidate autocomplete="off" @submit.prevent="submit">
        <h2 id="invite-title" class="text-lg font-semibold tracking-tight text-slate-900">Invite someone</h2>

        <label for="invite-email" class="mt-4 block text-sm font-medium text-slate-700">Their email address</label>
        <input
          id="invite-email"
          ref="input"
          v-model="email"
          name="invitee"
          type="email"
          inputmode="email"
          autocomplete="off"
          autocapitalize="none"
          spellcheck="false"
          placeholder="name@example.com"
          :readonly="saving"
          :aria-invalid="!!error"
          aria-describedby="invite-hint"
          class="field"
          @input="error = ''"
        >

        <fieldset v-if="roles.length > 1" class="mt-5">
          <legend class="text-sm font-medium text-slate-700">They’ll join as</legend>
          <div class="mt-2 grid gap-2">
            <label v-for="option in roles" :key="option" class="flex cursor-pointer gap-3 rounded-xl border border-slate-200 px-4 py-3 has-checked:border-accent-500 has-checked:bg-accent-50/40">
              <input v-model="role" type="radio" name="invite-role" :value="option" class="mt-1 accent-accent-600">
              <span>
                <span class="block font-medium text-slate-900">{{ roleName(option) }}</span>
                <span class="block text-sm text-slate-500">{{ option === 'admin' ? 'Belongs and takes part, and helps look after this place.' : 'Belongs here and takes part.' }}</span>
              </span>
            </label>
          </div>
        </fieldset>
        <p v-else class="mt-4 text-sm text-slate-500">They’ll join as a Member.</p>

        <p id="invite-hint" class="mt-3 min-h-5 text-sm text-red-700" aria-live="polite">{{ error }}</p>
        <div class="mt-3 flex items-center justify-end gap-5">
          <button type="button" class="link px-1 py-2" :disabled="saving" @click="editor.cancel()">Cancel</button>
          <button type="submit" :disabled="saving" class="btn-primary w-auto px-6">
            <Spinner v-if="saving" />
            {{ saving ? 'Creating…' : 'Create invitation' }}
          </button>
        </div>
      </form>

      <div v-else class="animate-rise p-6">
        <h2 id="invite-title" class="text-lg font-semibold tracking-tight text-slate-900">Invitation created</h2>
        <p class="mt-2 text-sm text-pretty text-slate-600">
          Share this link with <span class="font-medium text-slate-800">{{ invited }}</span> yourself; Orbit doesn’t send it.
          Only they can accept it, signed in with that address. It expires in 14 days.
        </p>
        <div class="mt-4 flex gap-2">
          <input :value="link" readonly aria-label="Invitation link" class="field mt-0 min-w-0 flex-1 text-sm" @focus="($event.target as HTMLInputElement).select()">
          <button type="button" class="btn-primary w-auto shrink-0 px-4 text-sm" @click="copy">Copy</button>
        </div>
        <p class="mt-2 min-h-5 text-sm" :class="copied === false ? 'text-red-700' : 'text-slate-500'" aria-live="polite">
          {{ copied === true ? 'Copied.' : copied === false ? 'Couldn’t copy. Select the link and copy it yourself.' : '' }}
        </p>
        <div class="mt-3 flex items-center justify-end gap-5">
          <button type="button" class="link px-1 py-2" @click="another">Invite someone else</button>
          <button type="button" class="btn-primary w-auto px-6" @click="editor.cancel()">Done</button>
        </div>
      </div>
    </dialog>
  </div>
</template>
