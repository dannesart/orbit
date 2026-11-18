<script setup lang="ts">
import type { NuxtError } from '#app'

const props = defineProps<{ error: NuxtError }>()
const route = useRoute()

const copy = computed(() => {
  if (props.error.statusCode === 401) {
    return { title: 'You’ve been signed out', text: 'Sign in again to pick up where you left off.', action: 'Sign in', to: '/sign-in' }
  }
  if (props.error.statusCode === 404) {
    return { title: 'This workspace is out of reach', text: 'It doesn’t exist, or you’re not a member of it.', action: 'Back to Orbit', to: '/' }
  }
  if (props.error.statusMessage === 'Workspace unavailable') {
    // A failure, not a verdict: retry the same page rather than sending people away.
    return { title: 'We couldn’t open this workspace right now', text: 'Something went wrong while loading it. Trying again often helps.', action: 'Try again', to: route.fullPath }
  }
  return { title: 'Something went wrong', text: 'Please try again in a moment.', action: 'Back to Orbit', to: '/' }
})
</script>

<template>
  <main class="grid min-h-dvh place-items-center px-4 text-center">
    <div class="animate-rise">
      <OrbitMark class="mb-8 text-lg" />
      <h1 class="text-2xl font-semibold tracking-tight text-slate-900">{{ copy.title }}</h1>
      <p class="mt-2 text-slate-500">{{ copy.text }}</p>
      <button
        class="mt-8 rounded-xl bg-accent-600 px-5 py-2.5 font-medium text-white transition hover:bg-accent-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-2"
        @click="clearError({ redirect: copy.to })"
      >
        {{ copy.action }}
      </button>
    </div>
  </main>
</template>
