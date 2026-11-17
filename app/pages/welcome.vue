<script setup lang="ts">
useHead({ title: 'Orbit' })

const route = useRoute()
const account = useAccount()
// Same question, also used to change an existing name (from the account menu).
const changing = Boolean(account.value?.name)
const back = typeof route.query.back === 'string' && /^\/(?!\/)/.test(route.query.back) ? route.query.back : '/'
const name = ref(account.value?.name ?? '')
const error = ref('')
const saving = ref(false)
const input = useTemplateRef<HTMLInputElement>('input')
onMounted(() => (changing ? input.value?.select() : input.value?.focus()))

async function save() {
  error.value = ''
  if (!name.value.trim()) {
    error.value = 'Tell us what to call you.'
    return
  }
  saving.value = true
  try {
    account.value = await $fetch<SignedInAccount>('/api/me', { method: 'PUT', body: { name: name.value } })
    await navigateTo(back, { replace: true })
  } catch (e: any) {
    error.value = e?.data?.statusMessage || 'Something went wrong. Please try again.'
    saving.value = false
  }
}
</script>

<template>
  <OrbitStage>
    <form novalidate @submit.prevent="save">
      <div class="mb-6 flex justify-center">
        <WorkspaceAvatar :name="name" class="size-16 rounded-full text-2xl" />
      </div>

      <h1 class="text-center text-2xl font-semibold tracking-tight text-slate-900">
        <label for="name">What should we call you?</label>
      </h1>
      <p id="name-hint" class="mt-2 text-center text-slate-500">
        {{ changing ? 'Change it whenever you like.' : 'That’s all we need for now.' }}
      </p>

      <input
        id="name"
        ref="input"
        v-model="name"
        type="text"
        maxlength="80"
        autocomplete="name"
        autocapitalize="words"
        spellcheck="false"
        :aria-invalid="!!error"
        aria-describedby="name-hint name-error"
        class="field mt-8 text-center text-lg"
        placeholder="e.g. Captain Stardust"
        @input="error = ''"
      >
      <p id="name-error" class="mt-2 min-h-5 text-center text-sm text-red-700" aria-live="polite">{{ error }}</p>

      <button type="submit" :disabled="saving" class="btn-primary mt-4">
        <Spinner v-if="saving" />
        {{ saving ? 'Saving…' : changing ? 'Save' : 'Continue' }}
      </button>
      <p v-if="changing" class="mt-4 text-center text-sm">
        <NuxtLink :to="back" class="link">Never mind</NuxtLink>
      </p>
    </form>
  </OrbitStage>
</template>
