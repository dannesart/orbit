<!--
  The one question before leaving the designer with work in it: what leaving discards, and that
  Orbit keeps nothing from the designer (Apply included: applied versions live only in this
  session). Orbit's confirmation dialog, with staying as the safe, focused, first choice.
-->
<script setup lang="ts">
const props = defineProps<{ losing: readonly string[] | null }>()
const emit = defineEmits<{ stay: []; leave: [] }>()
const dialog = useTemplateRef<HTMLDialogElement>('dialog')
const stayButton = useTemplateRef<HTMLButtonElement>('stayButton')

watch(() => props.losing, async (losing) => {
  if (losing) {
    dialog.value?.showModal()
    await nextTick()
    stayButton.value?.focus()
  } else {
    dialog.value?.close()
  }
})

function onCancel(event: Event) {
  event.preventDefault() // Escape means stay
  emit('stay')
}
</script>

<template>
  <dialog
    ref="dialog"
    aria-labelledby="leave-title"
    aria-describedby="leave-what"
    class="mx-auto mt-[12vh] w-[calc(100%-2rem)] max-w-md rounded-3xl border border-slate-200/80 bg-white p-0 text-left text-slate-800 shadow-xl shadow-slate-900/10 backdrop:bg-slate-900/20 backdrop:backdrop-blur-[2px] sm:my-auto"
    @cancel="onCancel"
  >
    <div v-if="losing" class="animate-rise p-6">
      <h2 id="leave-title" class="text-lg font-semibold tracking-tight text-balance text-slate-900">Leave the designer?</h2>
      <div id="leave-what" class="mt-2 text-sm text-pretty text-slate-600">
        <p>Orbit doesn’t keep anything from the designer, not even what you applied. Leaving discards:</p>
        <ul class="mt-2 list-disc space-y-1 pl-5">
          <li v-for="item in losing" :key="item">{{ item }}</li>
        </ul>
      </div>
      <div class="mt-6 flex flex-wrap items-center justify-end gap-3">
        <button type="button" class="rounded-full px-4 py-2 text-sm font-medium text-red-700 ring-1 ring-red-200 transition hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500" @click="emit('leave')">Leave and discard</button>
        <button ref="stayButton" type="button" class="btn-primary w-auto rounded-full px-5 py-2 text-sm" @click="emit('stay')">Stay in Designer</button>
      </div>
    </div>
  </dialog>
</template>
