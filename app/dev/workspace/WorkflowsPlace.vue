<!--
  The workspace's Workflows place: an experiment, only in `nuxt dev` and Netlify Deploy Previews
  (registered as a child of pages/w/[id].vue by nuxt.config.ts; production has no such route).

  It says only what is true today, in the present tense: Orbit keeps no workflows, and the
  workflow designer is a playground on sample data that belongs to no workspace and forgets
  everything when you leave. No list, no promise of one. Its one action opens the designer with a
  way back here.
-->
<script setup lang="ts">
import { enterWorkspace, shelfOf } from '../definitions/store'

const { workspace: ws } = useCurrentWorkspace()
useHead({ title: () => `Workflows · ${ws.value.name} · Orbit` })

const designer = computed(() => `/dev/designer?back=${encodeURIComponent(`/w/${ws.value.id}/workflows`)}`)
const steps = ['Record A', 'Console', 'Transform', 'Console']

// Experiment #7: this page has loaded the workspace (you belong to it), so the Designer and the
// Definitions place may work in it, in this tab's memory.
onMounted(() => enterWorkspace({ id: ws.value.id, name: ws.value.name }))
const made = ref(0)
onMounted(() => (made.value = shelfOf(ws.value.id).made.length))
</script>

<template>
  <main class="mx-auto max-w-xl px-4 pt-10 pb-20 sm:px-6 sm:pt-14">
    <section class="animate-rise rounded-3xl border border-slate-200/80 bg-white p-8 shadow-sm" aria-labelledby="workflows">
      <p class="text-xs font-semibold tracking-wide text-accent-700 uppercase">Experiment · previews only</p>
      <h1 id="workflows" class="mt-2 text-2xl font-semibold tracking-tight text-slate-900">Workflows</h1>
      <p class="mt-2 text-slate-500">Orbit doesn’t keep workflows. Nothing here belongs to {{ ws.name }}.</p>

      <div class="mt-8 rounded-2xl bg-slate-50 p-5 ring-1 ring-slate-200/70">
        <h2 class="text-sm font-semibold text-slate-900">The workflow designer</h2>
        <p class="mt-1 text-sm text-slate-600">
          A playground for one small chain, on sample data rather than {{ ws.name }}’s. You can shape what it makes,
          run it and see what happened. It forgets everything when you leave.
        </p>
        <ol class="mt-4 flex flex-wrap items-center gap-1.5 text-xs text-slate-600" aria-label="The sample chain, in order">
          <template v-for="(step, i) in steps" :key="i">
            <li class="rounded-full bg-white px-2.5 py-1 font-medium ring-1 ring-slate-200">{{ step }}</li>
            <li v-if="i < steps.length - 1" aria-hidden="true" class="text-slate-300">→</li>
          </template>
        </ol>
        <NuxtLink :to="designer" class="btn-primary mt-5 inline-flex w-auto rounded-full px-5 py-2 text-sm">
          Open the designer
        </NuxtLink>
      </div>

      <div class="mt-4 rounded-2xl bg-white p-5 ring-1 ring-slate-200/70">
        <h2 class="text-sm font-semibold text-slate-900">Definitions</h2>
        <p class="mt-1 text-sm text-slate-600">
          The kinds of information a workflow works with, such as a person or an invoice, and what each one contains.
          Make them in {{ ws.name }}, or use the ones Orbit provides.
        </p>
        <p v-if="made" class="mt-2 text-xs text-slate-500">{{ made === 1 ? 'One Definition' : `${made} Definitions` }} made in this tab.</p>
        <NuxtLink :to="`/w/${ws.id}/definitions`" class="mt-4 inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium text-accent-700 ring-1 ring-accent-200 transition hover:bg-accent-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500">
          Open Definitions <span aria-hidden="true">›</span>
        </NuxtLink>
      </div>
    </section>
  </main>
</template>
