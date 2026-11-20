<script setup lang="ts">
// Everyone who belongs here. Everyone belongs equally; responsibilities differ, so roles are
// shown quietly and alike beside each name, and nobody is ranked by them. Those the server
// says may invite (invitationRoles) can invite, and see the pending invitations they look after.
// Loading, "out of reach" and failures are handled by the workspace layout (pages/w/[id].vue).
import type { ListedInvitation } from '~~/server/utils/invitations'

const { workspace: ws, refresh: refreshWorkspace } = useCurrentWorkspace()
useHead({ title: () => `People · ${ws.value.name} · Orbit` })

const people = computed(() => sortPeople(ws.value.members))
const together = computed(() =>
  people.value.length === 1 ? 'Just you, for now.' : `${people.value.length} people belong here.`,
)
const mayInvite = computed(() => ws.value.invitationRoles.length > 0)

// Pending invitations, only for those who look after this workspace (the API refuses anyone else).
const { data: invitations, refresh } = await useFetch<ListedInvitation[]>(() => `/api/workspaces/${ws.value.id}/invitations`, {
  key: `invitations:${ws.value.id}`,
  immediate: ws.value.canManage,
  default: () => [],
})
const pending = computed(() => (invitations.value ?? []).filter((i) => i.status === 'pending'))

const notice = ref<{ id: string; text: string; failed?: boolean } | null>(null)
async function copyLink(invitation: ListedInvitation) {
  const ok = await copyText(invitationLink(window.location.origin, invitation.id), navigator.clipboard)
  notice.value = { id: invitation.id, text: ok ? 'Link copied.' : invitationLink(window.location.origin, invitation.id), failed: !ok }
}
const revoking = ref<string | null>(null)
async function revoke(invitation: ListedInvitation) {
  if (revoking.value) return
  revoking.value = invitation.id
  try {
    await $fetch(`/api/invitations/${invitation.id}/revoke`, { method: 'POST' })
  } catch (e: any) {
    notice.value = { id: invitation.id, text: e?.data?.statusMessage || 'That didn’t work. Please try again.', failed: true }
  } finally {
    await refresh()
    revoking.value = null
  }
}

// Changing someone's place here: offered only where the server's `actions` say so (PersonMenu),
// confirmed by the server before anything changes, then everything is loaded again as it is now
// (a removal also withdraws that person's pending invitations here).
const members = createMemberActions({
  workspaceId: () => ws.value.id,
  workspaceName: () => ws.value.name,
  send: (request) => $fetch(request.path, { method: request.method, body: request.body }),
  refresh: () => Promise.all([refreshWorkspace(), ws.value.canManage ? refresh() : null]),
})
const { busy, removing, notice: memberNotice } = members
// Rows keep one width for the role label, whether or not that person has a menu.
const anyActions = computed(() => people.value.some((p) => p.actions.length > 0))
</script>

<template>
  <main class="mx-auto max-w-xl px-4 pt-10 pb-20 sm:px-6 sm:pt-14">
    <section class="animate-rise rounded-3xl border border-slate-200/80 bg-white p-8 shadow-sm" aria-labelledby="people">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 id="people" class="text-2xl font-semibold tracking-tight text-slate-900">People</h1>
          <p class="mt-2 text-slate-500">{{ together }}</p>
        </div>
        <InviteDialog v-if="mayInvite" :workspace-id="ws.id" :roles="ws.invitationRoles" @created="refresh()" />
      </div>

      <ul class="mt-6 flex flex-col divide-y divide-slate-100">
        <li v-for="person in people" :key="person.id" class="flex items-center gap-3.5 py-3.5">
          <WorkspaceAvatar :name="person.name ?? '?'" class="size-10 shrink-0 rounded-full text-sm" />
          <p class="min-w-0 flex-1 truncate">
            <span :class="person.name ? 'font-medium text-slate-900' : 'text-slate-500'">{{ person.name ?? 'No name yet' }}</span>
            <span v-if="person.you" class="ml-1.5 text-sm text-slate-500">(you)</span>
          </p>
          <span class="shrink-0 text-sm text-slate-500">{{ standingOf(person) }}</span>
          <PersonMenu
            v-if="person.actions.length"
            :name="person.name"
            :actions="person.actions"
            :busy="busy === person.id"
            @choose="(action) => members.choose(person, action)"
          />
          <span v-else-if="anyActions" class="size-8 shrink-0" aria-hidden="true" />
        </li>
      </ul>
      <p v-if="memberNotice" class="mt-3 text-sm text-pretty" :class="memberNotice.problem ? 'text-slate-700' : 'text-slate-500'" role="status">
        {{ memberNotice.text }}
      </p>

      <p class="mt-6 border-t border-slate-100 pt-5 text-sm/6 text-pretty text-slate-500">
        Everyone here belongs equally. The <span class="font-medium text-slate-700">owner</span> is ultimately responsible for {{ ws.name }},
        <span class="font-medium text-slate-700">stewards</span> help look after it, and everyone takes part.
      </p>
    </section>

    <section
      v-if="ws.canManage"
      class="animate-rise mt-6 rounded-3xl border border-slate-200/80 bg-white p-8 shadow-sm [animation-delay:120ms]"
      aria-labelledby="pending"
    >
      <h2 id="pending" class="text-lg font-semibold tracking-tight text-slate-900">Invited</h2>
      <p v-if="pending.length === 0" class="mt-2 text-sm text-slate-500">No open invitations.</p>
      <ul v-else class="mt-4 flex flex-col divide-y divide-slate-100">
        <li v-for="invitation in pending" :key="invitation.id" class="py-3.5">
          <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
            <!-- The whole address stays readable on a phone: its own line, actions below it. -->
            <p class="w-full min-w-0 [overflow-wrap:anywhere] sm:w-auto sm:flex-1">
              <span class="font-medium text-slate-900">{{ invitation.email }}</span>
              <span class="ml-2 text-sm text-slate-500">{{ roleName(invitation.role) }}</span>
            </p>
            <div class="flex shrink-0 items-center gap-4 text-sm">
              <button type="button" class="link" @click="copyLink(invitation)">Copy link</button>
              <button v-if="invitation.revocable" type="button" class="link" :disabled="revoking === invitation.id" @click="revoke(invitation)">
                {{ revoking === invitation.id ? 'Withdrawing…' : 'Withdraw' }}
              </button>
            </div>
          </div>
          <p v-if="!invitation.acceptable" class="mt-1 text-sm text-slate-500">Can no longer be accepted as offered.</p>
          <p
            v-if="notice?.id === invitation.id"
            class="mt-1 text-sm break-all"
            :class="notice.failed ? 'text-slate-700 select-all' : 'text-slate-500'"
            aria-live="polite"
          >
            {{ notice.text }}
          </p>
        </li>
      </ul>
    </section>

    <RemovePersonDialog
      v-if="anyActions"
      :person="removing"
      :workspace-name="ws.name"
      :busy="!!busy"
      @confirm="members.confirmRemoval()"
      @cancel="members.cancelRemoval()"
    />
  </main>
</template>
