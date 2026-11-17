<!-- The person in the header: their initial and name, opening a small menu. -->
<script setup lang="ts">
const route = useRoute()
const account = useAccount()
const open = ref(false)
const root = useTemplateRef<HTMLElement>('root')
const trigger = useTemplateRef<HTMLButtonElement>('trigger')
const menu = useTemplateRef<HTMLElement>('menu')

const name = computed(() => account.value?.name ?? account.value?.email ?? '')
const items = () => [...(menu.value?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])]

async function show() {
  open.value = true
  await nextTick()
  items()[0]?.focus()
}

function close(returnFocus = true) {
  open.value = false
  if (returnFocus) trigger.value?.focus()
}

function onKeydown(event: KeyboardEvent) {
  const list = items()
  const at = list.indexOf(document.activeElement as HTMLElement)
  if (event.key === 'Escape') close()
  else if (event.key === 'ArrowDown') list[(at + 1) % list.length]?.focus()
  else if (event.key === 'ArrowUp') list[(at - 1 + list.length) % list.length]?.focus()
  else if (event.key === 'Tab') close(false)
  else return
  event.preventDefault()
}

function onClickOutside(event: MouseEvent) {
  if (open.value && !root.value?.contains(event.target as Node)) close(false)
}
onMounted(() => document.addEventListener('click', onClickOutside))
onBeforeUnmount(() => document.removeEventListener('click', onClickOutside))

function changeName() {
  open.value = false
  navigateTo({ path: '/welcome', query: { change: '1', back: route.fullPath } })
}
</script>

<template>
  <div ref="root" class="relative">
    <button
      ref="trigger"
      type="button"
      aria-haspopup="menu"
      :aria-expanded="open"
      :aria-label="`${name}, account menu`"
      class="flex items-center gap-2.5 rounded-full py-1 pr-1 pl-1 text-sm font-medium text-slate-700 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 sm:pr-3"
      @click="open ? close() : show()"
    >
      <WorkspaceAvatar :name="name" class="size-8 rounded-full text-sm" />
      <span class="hidden max-w-40 truncate sm:inline">{{ name }}</span>
    </button>

    <Transition
      enter-from-class="opacity-0 -translate-y-1" leave-to-class="opacity-0 -translate-y-1"
      enter-active-class="transition duration-150" leave-active-class="transition duration-100"
    >
      <div
        v-if="open"
        ref="menu"
        role="menu"
        :aria-label="`${name}, account`"
        class="absolute right-0 z-10 mt-2 w-64 overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5 shadow-lg shadow-slate-900/5"
        @keydown="onKeydown"
      >
        <div class="px-3 py-2.5">
          <p class="truncate font-medium text-slate-900">{{ name }}</p>
          <p class="truncate text-sm text-slate-500">{{ account?.email }}</p>
        </div>
        <div class="my-1 border-t border-slate-100" role="separator" />
        <button
          type="button" role="menuitem"
          class="w-full rounded-xl px-3 py-2 text-left text-sm text-slate-700 transition outline-none hover:bg-slate-50 focus-visible:bg-slate-100"
          @click="changeName"
        >
          Change name
        </button>
        <button
          type="button" role="menuitem"
          class="w-full rounded-xl px-3 py-2 text-left text-sm text-slate-700 transition outline-none hover:bg-slate-50 focus-visible:bg-slate-100"
          @click="signOut"
        >
          Sign out
        </button>
      </div>
    </Transition>
  </div>
</template>
