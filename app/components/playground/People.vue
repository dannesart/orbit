<!-- Playground: the People page from PR #16, over sample data, without its "Back to" link. -->
<script setup lang="ts">
import { type Standing, useSampleWorkspaces } from '~/playground/sample'

const { current: ws } = useSampleWorkspaces()
const together = computed(() =>
  ws.value.people.length === 1 ? 'Just you, for now.' : `${ws.value.people.length} people belong here.`,
)
const badge: Record<Standing, string> = {
  Owner: 'bg-accent-50 text-accent-700 ring-accent-200/70',
  Steward: 'bg-accent-secondary-50 text-accent-secondary-700 ring-accent-secondary-200/70',
  Member: 'bg-slate-50 text-slate-600 ring-slate-200',
}
</script>

<template>
  <div class="mx-auto max-w-xl px-4 pt-10 pb-20 sm:px-6 sm:pt-14">
    <section class="animate-rise rounded-3xl border border-slate-200/80 bg-white p-8 shadow-sm" aria-labelledby="people">
      <h1 id="people" class="text-2xl font-semibold tracking-tight text-slate-900">People</h1>
      <p class="mt-2 text-slate-500">{{ together }}</p>

      <ul class="mt-6 flex flex-col divide-y divide-slate-100">
        <li v-for="(person, i) in ws.people" :key="i" class="flex items-center gap-3.5 py-3.5">
          <WorkspaceAvatar :name="person.name ?? '?'" class="size-10 shrink-0 rounded-full text-sm" />
          <p class="min-w-0 flex-1 truncate">
            <span :class="person.name ? 'font-medium text-slate-900' : 'text-slate-500'">{{ person.name ?? 'No name yet' }}</span>
            <span v-if="person.you" class="ml-1.5 text-sm text-slate-500">(you)</span>
          </p>
          <span class="shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset" :class="badge[person.standing]">
            {{ person.standing }}
          </span>
        </li>
      </ul>

      <p class="mt-6 border-t border-slate-100 pt-5 text-sm/6 text-pretty text-slate-500">
        The <span class="font-medium text-slate-700">owner</span> is ultimately responsible for {{ ws.name }}.
        <span class="font-medium text-slate-700">Stewards</span> help look after it, and
        <span class="font-medium text-slate-700">members</span> belong here and take part.
      </p>
    </section>
  </div>
</template>
