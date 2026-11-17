<script setup lang="ts">
import type { NuxtError } from '#app'

const props = defineProps<{ error: NuxtError }>()

const copy = computed(() => {
  switch (props.error.statusCode) {
    case 401:
      return { title: 'You’ve been signed out', text: 'Sign in again to pick up where you left off.', action: 'Sign in', to: '/sign-in' }
    case 404:
      return { title: 'This workspace is out of reach', text: 'It doesn’t exist, or you’re not a member of it.', action: 'Back to Orbit', to: '/' }
    default:
      return { title: 'Something went wrong', text: 'Please try again in a moment.', action: 'Back to Orbit', to: '/' }
  }
})
</script>

<template>
  <main class="grid min-h-dvh place-items-center px-4 text-center">
    <div class="animate-rise">
      <OrbitMark class="mb-8 text-lg" />
      <h1 class="text-2xl font-semibold tracking-tight text-slate-900">{{ copy.title }}</h1>
      <p class="mt-2 text-slate-500">{{ copy.text }}</p>
      <button
        class="mt-8 rounded-xl bg-accent-600 px-5 py-2.5 font-medium text-white transition hover:bg-accent-500"
        @click="clearError({ redirect: copy.to })"
      >
        {{ copy.action }}
      </button>
    </div>
  </main>
</template>
