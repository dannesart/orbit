<script setup lang="ts">
// The Designer's floating toolbar: Orbit's glass, like the workspace navigation. The workflow's
// identity and its state, Run (the one prominent action), and the rest behind "More".
const props = withDefaults(defineProps<{
  back: string | null
  status: string
  attention: string | null
  canRun: boolean
  /** The experimental workflow on screen, and every one there is to switch to (workflows.ts). */
  workflow?: string
  workflows?: readonly { readonly id: string; readonly name: string }[]
}>(), { workflow: 'simple', workflows: () => [] })
const emit = defineEmits<{ run: []; startOver: []; versions: []; switch: [id: string] }>()
const title = computed(() => props.workflows.find((w) => w.id === props.workflow)?.name ?? 'Playground workflow')

const open = ref(false)
const menu = ref<HTMLElement>()
const trigger = ref<HTMLButtonElement>()
function toggle() {
  open.value = !open.value
  if (open.value) nextTick(() => menu.value?.querySelector<HTMLElement>('[role=menuitem]')?.focus())
}
function close(returnFocus = false) {
  open.value = false
  if (returnFocus) trigger.value?.focus()
}
function onDocument(event: MouseEvent) {
  if (open.value && !(event.target as Element).closest('[data-toolbar-menu]')) close()
}
onMounted(() => document.addEventListener('click', onDocument))
onBeforeUnmount(() => document.removeEventListener('click', onDocument))
const item = 'flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-accent-50 hover:text-accent-800 focus-visible:bg-accent-50 focus-visible:outline-none'
</script>

<template>
  <header class="pointer-events-none absolute inset-x-0 top-0 z-30 flex p-3 sm:p-4">
    <div class="pointer-events-auto flex max-w-full min-w-0 animate-pill-in items-center gap-1 rounded-full border border-white/80 bg-white/75 p-1.5 shadow-lg shadow-slate-900/[0.06] ring-1 ring-slate-900/5 backdrop-blur-md">
      <NuxtLink
        :to="props.back ?? '/'"
        class="flex h-10 shrink-0 items-center gap-1 rounded-full px-2.5 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
        :aria-label="props.back ? 'Back to the workspace. The designer keeps nothing' : 'Back to Orbit'"
      >
        <span v-if="props.back" aria-hidden="true" class="text-base leading-none text-slate-500">‹</span>
        <OrbitSymbol class="size-5" />
      </NuxtLink>
      <div class="min-w-0 px-2">
        <div class="flex items-center gap-2">
          <h1 class="min-w-0 truncate text-sm font-semibold text-slate-900">
            <template v-if="workflows.length < 2">Playground workflow</template>
            <!-- Which experimental workflow: switching keeps each one as you left it, for this session -->
            <label v-else class="relative flex min-w-0 items-center">
              <span class="sr-only">Workflow</span>
              <select :value="workflow" class="min-w-0 max-w-[14rem] cursor-pointer appearance-none truncate rounded-md bg-transparent pr-5 text-sm font-semibold text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-accent-500 sm:max-w-[18rem]" data-workflow-switch :title="title" @change="emit('switch', ($event.target as HTMLSelectElement).value)">
                <option v-for="w in workflows" :key="w.id" :value="w.id">{{ w.name }}</option>
              </select>
              <span aria-hidden="true" class="pointer-events-none absolute right-0 text-[10px] text-slate-400">▼</span>
            </label>
          </h1>
          <span class="hidden shrink-0 rounded-full bg-accent-50 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-accent-700 uppercase ring-1 ring-accent-200/70 sm:inline">Experiment</span>
        </div>
        <p class="truncate text-xs text-slate-500" aria-live="polite">
          {{ status }}<template v-if="attention"> · <span class="font-medium text-amber-700">{{ attention }}</span></template>
        </p>
      </div>
      <button type="button" class="btn-primary ml-1 w-auto shrink-0 rounded-full px-5 py-2 text-sm disabled:cursor-default disabled:opacity-50" :disabled="!props.canRun" @click="emit('run')">
        <span aria-hidden="true" class="text-[10px]">▶</span> Run
      </button>
      <div class="relative shrink-0" data-toolbar-menu @keydown.escape.stop="close(true)">
        <button ref="trigger" type="button" class="grid size-10 place-items-center rounded-full text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500" aria-label="More" aria-haspopup="menu" :aria-expanded="open" @click="toggle">
          <span aria-hidden="true" class="text-lg leading-none">⋯</span>
        </button>
        <div v-if="open" ref="menu" role="menu" aria-label="More" class="absolute top-full right-0 z-40 mt-2 w-64 animate-rise rounded-2xl border border-slate-200/80 bg-white p-1.5 shadow-lg shadow-slate-900/10">
          <button type="button" role="menuitem" :class="item" @click="close(true); emit('startOver')">Start over<span class="ml-auto text-xs text-slate-400">Record, Console, draft</span></button>
          <button type="button" role="menuitem" data-open-versions :class="item" @click="close(false); emit('versions')">Versions and input<span class="ml-auto text-xs text-slate-400">development</span></button>
          <NuxtLink to="/dev/features" role="menuitem" :class="item">List view<span class="ml-auto text-xs text-slate-400">the same chain</span></NuxtLink>
          <p class="mt-1 border-t border-slate-100 px-3 pt-2 pb-1 text-xs text-slate-500">Experiment · preview only, never in production. Nothing is saved.</p>
        </div>
      </div>
    </div>
  </header>
</template>
