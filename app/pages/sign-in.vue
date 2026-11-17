<script setup lang="ts">
useHead({ title: 'Sign in · Orbit' })

const route = useRoute()
const linkProblems: Record<string, string> = {
  expired: 'That link has expired or was already used. Send yourself a new one.',
  browser: 'That link was requested in a different browser. Open it there, or send a new link from here.',
  invalid: 'That sign-in link didn’t work. If you asked for more than one, use the newest email — or send a new link.',
}
const linkProblem = computed(() => linkProblems[String(route.query.error)] ?? '')

const sentTo = ref('')
const email = ref('')
const error = ref('')
const busy = ref(false)
const cooldown = ref(0)
const emailInput = useTemplateRef<HTMLInputElement>('emailInput')
onMounted(() => emailInput.value?.focus())

let timer: ReturnType<typeof setInterval> | undefined
function startCooldown() {
  cooldown.value = 60
  clearInterval(timer)
  timer = setInterval(() => {
    if (--cooldown.value <= 0) clearInterval(timer)
  }, 1000)
}
onBeforeUnmount(() => clearInterval(timer))

async function sendLink() {
  error.value = ''
  if (!/^\S+@\S+\.\S+$/.test(email.value.trim())) {
    error.value = 'Enter your email address.'
    return
  }
  busy.value = true
  try {
    await $fetch('/api/auth/link', { method: 'POST', body: { email: email.value } })
    sentTo.value = email.value.trim().toLowerCase()
    startCooldown()
    if (route.query.error) navigateTo('/sign-in', { replace: true })
  } catch (e: any) {
    error.value = e?.data?.statusMessage || 'Something went wrong. Please try again.'
  } finally {
    busy.value = false
  }
}

function changeEmail() {
  sentTo.value = ''
  error.value = ''
  nextTick(() => emailInput.value?.focus())
}
</script>

<template>
  <OrbitStage>
    <form v-if="!sentTo" novalidate @submit.prevent="sendLink">
      <h1 class="text-center text-2xl font-semibold tracking-tight text-slate-900">Welcome to Orbit</h1>
      <p class="mx-auto mt-2 max-w-xs text-center text-balance text-slate-500">
        Sign in or get started with your email. We’ll send you a link — no password needed.
      </p>

      <p v-if="linkProblem" class="mt-6 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800" role="status">
        {{ linkProblem }}
      </p>

      <label for="email" class="mt-8 block text-sm font-medium text-slate-700">Email</label>
      <input
        id="email"
        ref="emailInput"
        v-model="email"
        type="email"
        autocomplete="email"
        inputmode="email"
        placeholder="you@company.com"
        :aria-invalid="!!error"
        aria-describedby="email-hint"
        class="field"
        @input="error = ''"
      >
      <p id="email-hint" class="mt-2 min-h-5 text-sm text-rose-600" aria-live="polite">{{ error }}</p>

      <button type="submit" :disabled="busy" class="btn-primary mt-4">
        <Spinner v-if="busy" />
        {{ busy ? 'Sending…' : 'Email me a sign-in link' }}
      </button>
    </form>

    <div v-else class="text-center">
      <div class="mb-6 flex justify-center">
        <span class="grid size-16 place-items-center rounded-2xl bg-indigo-50 text-indigo-600">
          <svg viewBox="0 0 24 24" class="size-7" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <path d="m3 7 9 6 9-6" />
          </svg>
        </span>
      </div>
      <h1 class="text-2xl font-semibold tracking-tight text-slate-900">Check your email</h1>
      <p class="mt-2 text-slate-500">
        We sent a sign-in link to<br>
        <span class="font-medium break-all text-slate-700">{{ sentTo }}</span>
      </p>
      <p class="mx-auto mt-4 max-w-xs text-sm text-balance text-slate-500">
        Open it in this browser to continue. New to Orbit? The email asks you to confirm your address — that’s the one.
      </p>
      <p class="mt-2 min-h-5 text-sm text-rose-600" aria-live="polite">{{ error }}</p>

      <div class="mt-4 flex items-center justify-between text-sm">
        <button type="button" class="link" @click="changeEmail">Use a different email</button>
        <button type="button" class="link" :disabled="busy || cooldown > 0" @click="sendLink">
          {{ cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend link' }}
        </button>
      </div>
    </div>

    <template #footer>
      <p v-if="!sentTo">New here? Your account is created when you confirm your email.</p>
      <p v-else>Can’t find it? Check your spam folder. Links expire after an hour.</p>
    </template>
  </OrbitStage>
</template>
