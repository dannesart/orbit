<script setup lang="ts">
import type { Member, WorkspaceView } from '~~/server/utils/workspaces'

const route = useRoute()
const account = useAccount()
const { data: workspace, error } = await useFetch<WorkspaceView & { members: Member[] }>(
  `/api/workspaces/${route.params.id}`,
)

if (error.value?.statusCode === 401) {
  account.value = null
  throw createError({ statusCode: 401, statusMessage: 'Signed out', fatal: true })
}
if (error.value || !workspace.value) {
  throw createError({ statusCode: 404, statusMessage: 'Workspace not found', fatal: true })
}

const ws = workspace.value!
const justCreated = route.query.welcome === '1'
useHead({ title: `${ws.name} · Orbit` })

// The local hour is only known in the browser, so the greeting arrives with the page.
const hello = ref('')
onMounted(() => {
  hello.value = greeting(account.value?.name ?? 'there', new Date().getHours())
})

const others = ws.members.filter((m) => !m.you)
const presence = computed(() => {
  const names = others.map((m) => m.name ?? 'someone')
  if (names.length === 0) return 'Just you, for now.'
  if (names.length === 1) return `You and ${names[0]}.`
  if (names.length === 2) return `You, ${names[0]} and ${names[1]}.`
  return `You, ${names[0]} and ${names.length - 1} others.`
})
</script>

<template>
  <div class="min-h-dvh">
    <!-- z-20: backdrop-blur creates a stacking context; keep the account menu above the page. -->
    <header class="relative z-20 border-b border-slate-200/70 bg-white/70 backdrop-blur">
      <div class="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
        <div class="flex min-w-0 items-center gap-3">
          <OrbitMark />
          <span class="text-slate-300" aria-hidden="true">/</span>
          <!-- Future home of the workspace switcher -->
          <div class="flex min-w-0 items-center gap-2.5 rounded-full border border-slate-200 bg-white py-1 pr-4 pl-1 text-sm font-medium text-slate-700">
            <WorkspaceAvatar :name="ws.name" class="size-7 rounded-full text-xs" />
            <span class="max-w-48 truncate">{{ ws.name }}</span>
          </div>
        </div>
        <IdentityMenu />
      </div>
    </header>

    <main class="relative overflow-hidden">
      <!-- A distant orbit behind everything; it never moves. -->
      <div class="pointer-events-none absolute inset-x-0 top-0 grid place-items-center" aria-hidden="true">
        <div class="mt-[-14rem] size-[44rem] rounded-full border border-accent-100/50" />
      </div>

      <div class="relative mx-auto flex max-w-2xl flex-col items-center px-4 pt-14 pb-20 text-center sm:px-6 sm:pt-20">
        <p class="min-h-6 text-slate-500">
          <span v-if="hello" class="inline-block animate-rise">{{ hello }}</span>
        </p>

        <OrbitHalo class="mt-6">
          <WorkspaceAvatar :name="ws.name" class="size-20 text-3xl" />
        </OrbitHalo>

        <h1 class="mt-6 max-w-full animate-rise truncate text-3xl font-semibold tracking-tight text-slate-900 [animation-delay:150ms] sm:text-4xl">
          {{ ws.name }}
        </h1>
        <p v-if="justCreated" class="mt-2 animate-rise text-slate-500 [animation-delay:250ms]">
          Brand new. Nothing’s out of place yet.
        </p>

        <section class="mt-16 animate-rise [animation-delay:400ms]">
          <h2 class="text-lg font-semibold text-slate-900">It’s calm in here — and that’s fine.</h2>
          <p class="mt-2 text-slate-500">Nothing here is waiting on you.</p>
        </section>

        <section class="mt-12 flex animate-rise flex-col items-center gap-3 [animation-delay:550ms]" aria-labelledby="whos-here">
          <h2 id="whos-here" class="text-xs font-medium tracking-wide text-slate-400 uppercase">Who’s here</h2>
          <div class="flex items-center gap-3">
            <ul class="flex -space-x-2" aria-hidden="true">
              <li v-for="(member, i) in ws.members.slice(0, 4)" :key="i">
                <WorkspaceAvatar
                  :name="member.name ?? '?'"
                  class="size-8 rounded-full text-xs ring-2 ring-slate-50"
                />
              </li>
            </ul>
            <p class="text-slate-600">{{ presence }}</p>
          </div>
        </section>
      </div>
    </main>
  </div>
</template>
