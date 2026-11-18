<!-- The person in the header: their initial and name, opening a small menu. -->
<script setup lang="ts">
const route = useRoute()
const account = useAccount()
const { open, root, trigger, menu, toggle, onKeydown } = useMenu()
const ids = useId()

const name = computed(() => account.value?.name ?? account.value?.email ?? '')

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
      @click="toggle"
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
        :aria-describedby="account?.name && account.email ? `${ids}-email` : undefined"
        class="absolute right-0 z-10 mt-2 w-64 overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5 shadow-lg shadow-slate-900/5"
        @keydown="onKeydown"
      >
        <div class="px-3 py-2.5">
          <p class="truncate font-medium text-slate-900">{{ name }}</p>
          <p :id="`${ids}-email`" class="truncate text-sm text-slate-500">{{ account?.email }}</p>
        </div>
        <div class="mx-1.5 my-1.5 border-t border-slate-100" role="separator" />
        <MenuItem @click="changeName">
          <template #icon>
            <!-- The same pencil that edits a workspace's purpose. -->
            <svg viewBox="0 0 16 16" class="size-4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M11 2.5 13.5 5 6 12.5 3 13l.5-3L11 2.5Z" />
            </svg>
          </template>
          Change name
        </MenuItem>
        <MenuItem @click="signOut">
          <template #icon>
            <svg viewBox="0 0 16 16" class="size-4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M6.5 13.5h-3a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h3M10.5 11 13.5 8l-3-3M13.5 8H6" />
            </svg>
          </template>
          Sign out
        </MenuItem>
      </div>
    </Transition>
  </div>
</template>
