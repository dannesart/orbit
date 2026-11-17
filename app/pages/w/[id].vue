<script setup lang="ts">
import type { WorkspaceView } from '~~/server/utils/workspaces'

const route = useRoute()
const account = useAccount()
const { data: workspace, error } = await useFetch<WorkspaceView>(`/api/workspaces/${route.params.id}`)

if (error.value?.statusCode === 401) {
  account.value = null
  throw createError({ statusCode: 401, statusMessage: 'Signed out', fatal: true })
}
if (error.value || !workspace.value) {
  throw createError({ statusCode: 404, statusMessage: 'Workspace not found', fatal: true })
}

const ws = workspace.value!
const justCreated = route.query.welcome === '1'
const createdOn = new Date(ws.createdAt).toLocaleDateString('en', { day: 'numeric', month: 'long', year: 'numeric' })

useHead({ title: `${ws.name} · Orbit` })

const upcoming = [
  {
    title: 'Invite your team',
    text: 'Bring colleagues into this workspace when you’re ready.',
    icon: 'M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm10-2v6m3-3h-6',
  },
  {
    title: 'Connect your tools',
    text: 'Link the services your team already relies on.',
    icon: 'M9 17H7a5 5 0 0 1 0-10h2m6 0h2a5 5 0 0 1 0 10h-2m-7-5h8',
  },
  {
    title: 'Shape your first flow',
    text: 'Describe how work moves through your organization.',
    icon: 'M5 6h4v4H5zM15 14h4v4h-4zM7 10v2a2 2 0 0 0 2 2h6',
  },
]
</script>

<template>
  <div class="min-h-dvh">
    <header class="border-b border-slate-200/70 bg-white/70 backdrop-blur">
      <div class="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">
        <div class="flex min-w-0 items-center gap-3">
          <OrbitMark />
          <span class="text-slate-300" aria-hidden="true">/</span>
          <!-- Future home of the workspace switcher -->
          <div class="flex min-w-0 items-center gap-2.5 rounded-full border border-slate-200 bg-white py-1 pr-4 pl-1 text-sm font-medium text-slate-700">
            <WorkspaceAvatar :name="ws.name" class="size-7 rounded-full text-xs" />
            <span class="max-w-48 truncate">{{ ws.name }}</span>
          </div>
        </div>
        <div class="flex shrink-0 items-center gap-4 text-sm">
          <span class="hidden max-w-56 truncate text-slate-500 md:inline">{{ account }}</span>
          <button
            type="button"
            class="rounded-lg px-3 py-1.5 font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-200"
            @click="signOut"
          >
            Sign out
          </button>
        </div>
      </div>
    </header>

    <main class="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
      <section class="animate-rise">
        <p
          v-if="justCreated"
          class="mb-4 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-700"
        >
          <span class="size-1.5 rounded-full bg-emerald-500" />
          Workspace created
        </p>
        <div class="flex items-center gap-5">
          <WorkspaceAvatar :name="ws.name" class="size-16 shrink-0 text-2xl" />
          <div class="min-w-0">
            <h1 class="truncate text-3xl font-semibold tracking-tight text-slate-900">
              {{ justCreated ? `Welcome to ${ws.name}` : ws.name }}
            </h1>
            <p class="mt-1 text-slate-500">
              {{ ws.role === 'admin' ? 'You’re the administrator of this workspace' : 'You’re a member of this workspace' }}
              · Created {{ createdOn }}
            </p>
          </div>
        </div>
      </section>

      <section class="mt-12 animate-rise rounded-3xl border border-slate-200/80 bg-white p-8 shadow-sm [animation-delay:120ms] sm:p-10">
        <h2 class="text-lg font-semibold text-slate-900">It’s calm in here — and that’s fine.</h2>
        <p class="mt-2 max-w-2xl text-slate-500">
          {{ ws.name }} is ready. There’s nothing you need to configure right now.
          As Orbit grows, this is where your team’s work will come together.
        </p>

        <ul class="mt-8 grid gap-4 sm:grid-cols-3">
          <li v-for="item in upcoming" :key="item.title" class="rounded-2xl border border-dashed border-slate-200 p-5">
            <div class="flex items-center justify-between">
              <span class="grid size-9 place-items-center rounded-xl bg-slate-100 text-slate-500">
                <svg
                  viewBox="0 0 24 24" class="size-5" fill="none" stroke="currentColor" stroke-width="1.75"
                  stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"
                >
                  <path :d="item.icon" />
                </svg>
              </span>
              <span class="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">Coming soon</span>
            </div>
            <h3 class="mt-4 font-medium text-slate-800">{{ item.title }}</h3>
            <p class="mt-1 text-sm text-slate-500">{{ item.text }}</p>
          </li>
        </ul>
      </section>
    </main>
  </div>
</template>
