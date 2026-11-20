<script setup lang="ts">
// Behind an invitation's link. Anyone holding it sees the public preview (the workspace's name
// and the offered role, nothing else); only the person it was addressed to, signed in with that
// address, can accept or decline it. What each visitor sees is arrivalOf (utils/invitations.ts).
import type { InvitationPreview, RecipientInvitation } from '~~/server/utils/invitations'
import type { Role } from '~~/server/utils/workspaces'

useHead({
  title: 'Your invitation · Orbit',
  meta: [{ name: 'robots', content: 'noindex' }, { name: 'referrer', content: 'no-referrer' }],
})

const route = useRoute()
const id = String(route.params.id)
const account = useAccount()
const signedIn = computed(() => !!account.value)

const { data: preview } = await useFetch<InvitationPreview>(`/api/invitations/${encodeURIComponent(id)}/preview`, { key: `invitation-preview:${id}` })
// The recipient's own view: only exists for the account the invitation was addressed to.
const { data: invitation, refresh } = await useFetch<RecipientInvitation>(`/api/invitations/${encodeURIComponent(id)}`, {
  key: `invitation:${id}`,
  immediate: signedIn.value,
})

const arrival = computed(() => arrivalOf({ signedIn: signedIn.value, preview: preview.value ?? null, invitation: signedIn.value ? invitation.value ?? null : null }))
const workspaceName = computed(() => {
  const a = arrival.value
  return 'preview' in a ? a.preview.workspaceName : 'invitation' in a ? a.invitation.workspace.name : ''
})
const role = computed<Role | null>(() => {
  const a = arrival.value
  return 'preview' in a ? a.preview.role : 'invitation' in a ? a.invitation.role : null
})

const busy = ref<'accept' | 'decline' | null>(null)
const error = ref('')

async function accept() {
  if (busy.value) return
  busy.value = 'accept'
  error.value = ''
  try {
    const result = await $fetch<{ workspaceId: string; joined: boolean; role: Role }>(`/api/invitations/${encodeURIComponent(id)}/accept`, { method: 'POST' })
    clearNuxtData(`workspace:${result.workspaceId}`) // load it fresh: you're in it now
    await navigateTo(`/w/${result.workspaceId}/people`)
  } catch (e: any) {
    error.value = e?.data?.statusMessage || 'That didn’t work. Please try again.'
    await refresh() // show what's true now (e.g. withdrawn meanwhile)
  } finally {
    busy.value = null
  }
}

async function decline() {
  if (busy.value) return
  busy.value = 'decline'
  error.value = ''
  try {
    await $fetch(`/api/invitations/${encodeURIComponent(id)}/decline`, { method: 'POST' })
  } catch (e: any) {
    error.value = e?.data?.statusMessage || 'That didn’t work. Please try again.'
  } finally {
    await refresh()
    busy.value = null
  }
}

/** Signed in with another address: sign out, then sign in again, coming back here. */
async function switchAccount() {
  await $fetch('/api/auth/sign-out', { method: 'POST' })
  account.value = null
  clearNuxtData()
  await navigateTo(signInPath(`/invitations/${id}`))
}

const answeredMessage = computed(() => {
  const a = arrival.value
  if (a.kind !== 'answered') return ''
  return {
    accepted: `You’ve accepted this invitation, so you belong to ${a.invitation.workspace.name}.`,
    declined: 'You declined this invitation.',
    revoked: 'This invitation was withdrawn.',
    expired: 'This invitation has expired.',
    pending: '',
  }[a.invitation.status]
})
</script>

<template>
  <OrbitStage>
    <div v-if="arrival.kind === 'unavailable'" class="text-center">
      <h1 class="text-2xl font-semibold tracking-tight text-slate-900">This invitation isn’t available</h1>
      <p class="mx-auto mt-2 max-w-xs text-balance text-slate-500">
        It may have expired or been withdrawn, or the link may be incomplete.
        <template v-if="!signedIn">If it was sent to you, sign in to see what happened.</template>
      </p>
      <NuxtLink v-if="!signedIn" :to="signInPath(`/invitations/${id}`)" class="btn-primary mt-8">Sign in</NuxtLink>
      <NuxtLink v-else to="/" class="link mt-6 inline-block">Go to Orbit</NuxtLink>
    </div>

    <div v-else class="text-center">
      <h1 class="text-2xl font-semibold tracking-tight text-balance text-slate-900">{{ arrivalTitle(arrival, workspaceName) }}</h1>
      <!-- The role, and what it means, wherever there is still a choice to make; the same words before and after signing in. -->
      <p v-if="role && (arrival.kind === 'sign_in' || arrival.kind === 'answer')" class="mx-auto mt-3 max-w-sm text-balance text-slate-500">
        as a <span class="font-medium text-slate-700">{{ roleName(role) }}</span>. {{ roleMeaning[role] }}
      </p>
      <p v-else-if="role && arrival.kind === 'someone_else'" class="mt-3 text-slate-500">
        as a <span class="font-medium text-slate-700">{{ roleName(role) }}</span>
      </p>

      <template v-if="arrival.kind === 'sign_in'">
        <NuxtLink :to="signInPath(`/invitations/${id}`)" class="btn-primary mt-8">Continue</NuxtLink>
        <p class="mt-4 text-sm text-pretty text-slate-500">
          Sign in, or create your account, with the email address this invitation was sent to.
        </p>
      </template>

      <template v-else-if="arrival.kind === 'answer'">
        <button type="button" class="btn-primary mt-8" :disabled="!!busy" @click="accept">
          <Spinner v-if="busy === 'accept'" />
          {{ busy === 'accept' ? 'Joining…' : 'Accept' }}
        </button>
        <button type="button" class="link mt-4 px-1 py-2" :disabled="!!busy" @click="decline">
          {{ busy === 'decline' ? 'Declining…' : 'Decline' }}
        </button>
      </template>

      <template v-else-if="arrival.kind === 'no_longer_valid'">
        <p class="mt-8 text-sm text-pretty text-slate-600">
          This invitation can no longer be accepted as it was offered. You can decline it to close it.
        </p>
        <button type="button" class="link mt-4 px-1 py-2" :disabled="!!busy" @click="decline">Decline</button>
      </template>

      <template v-else-if="arrival.kind === 'answered'">
        <p class="mt-8 text-pretty text-slate-600">{{ answeredMessage }}</p>
        <NuxtLink
          v-if="arrival.invitation.status === 'accepted'"
          :to="`/w/${arrival.invitation.workspace.id}`"
          class="btn-primary mt-6"
        >
          Open {{ arrival.invitation.workspace.name }}
        </NuxtLink>
        <NuxtLink v-else to="/" class="link mt-6 inline-block">Go to Orbit</NuxtLink>
      </template>

      <template v-else-if="arrival.kind === 'someone_else'">
        <p class="mt-8 text-sm text-pretty text-slate-600">
          This invitation was sent to a different email address than the one you’re signed in with
          <template v-if="account?.email">({{ account.email }})</template>.
          Sign in with the address it was sent to.
        </p>
        <button type="button" class="btn-primary mt-6" @click="switchAccount">Sign in with another address</button>
      </template>

      <p class="mt-4 min-h-5 text-sm text-red-700" aria-live="polite">{{ error }}</p>
    </div>
  </OrbitStage>
</template>
