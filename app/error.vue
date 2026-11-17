<script setup lang="ts">
import type { NuxtError } from '#app'

const props = defineProps<{ error: NuxtError }>()
const notFound = computed(() => props.error.statusCode === 404)
</script>

<template>
  <main class="grid min-h-dvh place-items-center px-4 text-center">
    <div class="animate-rise">
      <OrbitMark class="mb-8 text-lg" />
      <h1 class="text-2xl font-semibold tracking-tight text-slate-900">
        {{ notFound ? 'This workspace is out of reach' : 'Something went wrong' }}
      </h1>
      <p class="mt-2 text-slate-500">
        {{ notFound ? 'It doesn’t exist, or you’re not a member of it.' : 'Please try again in a moment.' }}
      </p>
      <button
        class="mt-8 rounded-xl bg-indigo-600 px-5 py-2.5 font-medium text-white transition hover:bg-indigo-500"
        @click="clearError({ redirect: '/' })"
      >
        Back to Orbit
      </button>
    </div>
  </main>
</template>
