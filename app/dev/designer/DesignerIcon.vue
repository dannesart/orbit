<!--
  The Designer's small icons, in the style of Orbit's navigation icons (WorkspaceNavIcon.vue:
  16×16, 1.5 stroke). Always decorative: the control they sit in carries the accessible name.
-->
<script setup lang="ts">
defineProps<{ name: 'check' | 'error' | 'clock' | 'minus' | 'pencil' | 'chevron' | 'undo' | 'close' }>()
</script>

<template>
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path v-if="name === 'check'" d="m3.5 8.5 3 3 6-7" />
    <template v-else-if="name === 'error'">
      <circle cx="8" cy="8" r="5.75" />
      <path d="M8 5v3.5M8 10.75v.01" />
    </template>
    <template v-else-if="name === 'clock'">
      <circle cx="8" cy="8" r="5.75" />
      <path d="M8 5v3l2 1.5" />
    </template>
    <path v-else-if="name === 'minus'" d="M4 8h8" />
    <template v-else-if="name === 'pencil'">
      <path d="M10.9 2.7a1.5 1.5 0 0 1 2.1 2.1L5.6 12.3l-2.8.7.7-2.8 7.4-7.5Z" />
      <path d="m9.8 3.8 2.3 2.3" />
    </template>
    <path v-else-if="name === 'chevron'" d="m6 3.5 4.5 4.5L6 12.5" />
    <template v-else-if="name === 'undo'">
      <path d="M5.5 4 2.75 6.75 5.5 9.5" />
      <path d="M3 6.75h6.25a3.75 3.75 0 0 1 0 7.5H7" />
    </template>
    <path v-else d="m4 4 8 8M12 4l-8 8" />
  </svg>
</template>
