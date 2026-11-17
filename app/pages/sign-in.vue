<script setup lang="ts">
useHead({ title: 'Sign in · Orbit' })

const step = ref<'email' | 'code'>('email')
const email = ref('')
const code = ref('')
const error = ref('')
const notice = ref('')
const busy = ref(false)
const cooldown = ref(0)
const emailInput = useTemplateRef<HTMLInputElement>('emailInput')
const codeInput = useTemplateRef<HTMLInputElement>('codeInput')
onMounted(() => emailInput.value?.focus())

let timer: ReturnType<typeof setInterval> | undefined
function startCooldown(seconds = 60) {
  cooldown.value = seconds
  clearInterval(timer)
  timer = setInterval(() => {
    if (--cooldown.value <= 0) clearInterval(timer)
  }, 1000)
}
onBeforeUnmount(() => clearInterval(timer))

const message = (e: any) => e?.data?.statusMessage || 'Something went wrong. Please try again.'

async function showCodeStep() {
  step.value = 'code'
  await nextTick()
  codeInput.value?.focus()
}

async function sendCode() {
  error.value = ''
  notice.value = ''
  if (!/^\S+@\S+\.\S+$/.test(email.value.trim())) {
    error.value = 'Enter your email address.'
    return
  }
  const resending = step.value === 'code'
  busy.value = true
  try {
    await $fetch('/api/auth/code', { method: 'POST', body: { email: email.value } })
    code.value = ''
    startCooldown()
    if (resending) notice.value = 'We sent you a new code. Use the newest one.'
    await showCodeStep()
  } catch (e: any) {
    const retryAfter = e?.data?.data?.retryAfter
    if (retryAfter) {
      // A code went to this address moments ago; it is still the one to use.
      startCooldown(retryAfter)
      notice.value = 'We sent a code to this address a moment ago — use that one.'
      await showCodeStep()
    } else {
      error.value = message(e)
    }
  } finally {
    busy.value = false
  }
}

async function verify() {
  error.value = ''
  notice.value = ''
  if (!/^\d{6,10}$/.test(code.value.replace(/\s/g, ''))) {
    error.value = 'Enter the code from your email.'
    return
  }
  busy.value = true
  try {
    useAccount().value = await $fetch<SignedInAccount>('/api/auth/verify', {
      method: 'POST',
      body: { email: email.value, code: code.value },
    })
    await navigateTo('/') // the auth middleware asks for a name first, if we don't have one yet
  } catch (e) {
    error.value = message(e)
    busy.value = false
    await nextTick()
    codeInput.value?.select() // easy to correct a typo
  }
}

function changeEmail() {
  step.value = 'email'
  error.value = ''
  notice.value = ''
  nextTick(() => emailInput.value?.select())
}
</script>

<template>
  <OrbitStage>
    <form v-if="step === 'email'" novalidate @submit.prevent="sendCode">
      <h1 class="text-center text-2xl font-semibold tracking-tight text-slate-900">Welcome to Orbit</h1>
      <p class="mx-auto mt-2 max-w-xs text-center text-balance text-slate-500">
        Sign in or get started with your email. We’ll send you a code — no password needed.
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
        {{ busy ? 'Sending…' : 'Email me a code' }}
      </button>
    </form>

    <form v-else novalidate @submit.prevent="verify">
      <div class="mb-6 flex justify-center">
        <span class="grid size-16 place-items-center rounded-2xl bg-accent-50 text-accent-600">
          <svg viewBox="0 0 24 24" class="size-7" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <path d="m3 7 9 6 9-6" />
          </svg>
        </span>
      </div>
      <h1 class="text-center text-2xl font-semibold tracking-tight text-slate-900">Check your email</h1>
      <p class="mt-2 text-center text-slate-500">
        We sent a sign-in code to<br>
        <span class="font-medium break-all text-slate-700">{{ email.trim().toLowerCase() }}</span>
      </p>

      <label for="code" class="mt-8 block text-sm font-medium text-slate-700">Code</label>
      <input
        id="code"
        ref="codeInput"
        v-model="code"
        type="text"
        inputmode="numeric"
        autocomplete="one-time-code"
        maxlength="10"
        placeholder="123456"
        :aria-invalid="!!error"
        aria-describedby="code-hint"
        class="field text-center font-mono text-2xl tracking-[0.4em] placeholder:tracking-[0.4em] placeholder:text-slate-300"
        @input="code = code.replace(/\D/g, ''); error = ''"
      >
      <p
        id="code-hint"
        class="mt-2 min-h-5 text-sm"
        :class="error ? 'text-rose-600' : 'text-emerald-700'"
        aria-live="polite"
      >
        {{ error || notice }}
      </p>

      <button type="submit" :disabled="busy" class="btn-primary mt-4">
        <Spinner v-if="busy" />
        {{ busy ? 'Signing in…' : 'Sign in' }}
      </button>

      <div class="mt-6 flex items-center justify-between text-sm">
        <button type="button" class="link" @click="changeEmail">Use a different email</button>
        <button type="button" class="link" :disabled="busy || cooldown > 0" @click="sendCode">
          {{ cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code' }}
        </button>
      </div>
    </form>

    <template #footer>
      <p v-if="step === 'email'">New here? Your account is created when you sign in.</p>
      <p v-else>Can’t find it? Check your spam folder.</p>
    </template>
  </OrbitStage>
</template>
