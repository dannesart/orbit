<!--
  A quiet menu beside someone in People, offering only what the server says the viewer may do
  for them (`actions`, and Transfer ownership when `transferable`). Shown only when there is at
  least one; never for yourself or the owner, because the server offers nothing there.
-->
<script setup lang="ts">
import type { MembershipAction } from '~~/server/utils/authority'
import type { PersonChoice } from '~/utils/memberActions'

const props = defineProps<{ name: string | null; actions: MembershipAction[]; transferable: boolean; busy: boolean }>()
const emit = defineEmits<{ choose: [choice: PersonChoice] }>()
const { open, root, trigger, menu, close, toggle, onKeydown } = useMenu()
const ids = useId()
const choices = computed(() => menuChoices(props))

function choose(choice: PersonChoice) {
  close()
  emit('choose', choice)
}
</script>

<template>
  <div ref="root" class="relative shrink-0">
    <button
      ref="trigger"
      type="button"
      aria-haspopup="menu"
      :aria-expanded="open"
      :aria-controls="open ? `${ids}-menu` : undefined"
      :aria-label="`Options for ${props.name ?? 'this person'}`"
      :disabled="busy"
      class="grid size-8 place-items-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 disabled:cursor-wait disabled:opacity-60"
      @click="toggle"
    >
      <Spinner v-if="busy" class="size-4" />
      <svg v-else viewBox="0 0 16 16" class="size-4" fill="currentColor" aria-hidden="true">
        <circle cx="3.5" cy="8" r="1.4" /><circle cx="8" cy="8" r="1.4" /><circle cx="12.5" cy="8" r="1.4" />
      </svg>
    </button>
    <div
      v-if="open"
      :id="`${ids}-menu`"
      ref="menu"
      role="menu"
      :aria-label="`Options for ${props.name ?? 'this person'}`"
      class="absolute top-full right-0 z-20 mt-1 w-56 animate-rise rounded-2xl border border-slate-200/80 bg-white p-1.5 shadow-lg shadow-slate-900/10"
      @keydown="onKeydown"
    >
      <MenuItem v-for="choice in choices" :key="choice" @click="choose(choice)">{{ choiceLabel[choice] }}</MenuItem>
    </div>
  </div>
</template>
