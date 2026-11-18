<script setup lang="ts">
const route = useRoute()
const account = useAccount()
const { workspace: ws, isAdmin, save } = await useWorkspace(String(route.params.id))

const justCreated = route.query.welcome === '1'
useHead({ title: () => `${ws.value.name} · Orbit` })

// The local hour is only known in the browser, so the greeting arrives with the page.
const hello = ref('')
onMounted(() => {
  hello.value = greeting(account.value?.name ?? 'there', new Date().getHours())
  // "Brand new" belongs to the first view only: drop the marker so reloads don't repeat it.
  if (justCreated) useRouter().replace({ query: {} })
})

const presence = computed(() => {
  const names = ws.value.members.filter((m) => !m.you).map((m) => m.name ?? 'someone')
  if (names.length === 0) return 'Just you, for now.'
  if (names.length === 1) return `You and ${names[0]}.`
  if (names.length === 2) return `You, ${names[0]} and ${names[1]}.`
  return `You, ${names[0]} and ${names.length - 1} others.`
})
</script>

<template>
  <div class="min-h-dvh">
    <WorkspaceHeader :workspace="ws" />

    <main class="relative overflow-hidden">
      <!-- A distant orbit behind everything; it never moves. -->
      <div class="pointer-events-none absolute inset-x-0 top-0 grid place-items-center" aria-hidden="true">
        <div class="-mt-56 size-176 rounded-full border border-accent-100/50" />
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
        <WorkspacePurpose :description="ws.description" :editable="isAdmin" :save="save" />

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
