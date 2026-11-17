<script setup lang="ts">
const props = defineProps<{ name: string }>()
const initial = computed(() => props.name.trim().charAt(0).toUpperCase())
</script>

<template>
  <span
    class="inline-grid place-items-center rounded-2xl bg-linear-to-br from-accent-500 to-accent-secondary-500 font-semibold text-white shadow-sm shadow-accent-500/30"
    aria-hidden="true"
  >
    <Transition
      mode="out-in"
      enter-from-class="scale-50 opacity-0" leave-to-class="scale-50 opacity-0"
      enter-active-class="transition duration-200" leave-active-class="transition duration-150"
    >
      <span :key="initial">{{ initial || '·' }}</span>
    </Transition>
  </span>
</template>
