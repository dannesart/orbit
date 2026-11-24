<!--
  The Definitions place's small icons: outlines in the style of Orbit's navigation icons (16×16
  grid, round caps). The Definition icon is the one the navigation uses for Definitions, so a card
  and the place it lives in look alike. Always decorative: the control they sit in is named.
-->
<script setup lang="ts">
defineProps<{ name: 'definition' | 'lock' | 'plus' | 'chevron' | 'pencil' | 'close' }>()
</script>

<template>
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <template v-if="name === 'definition'">
      <rect x="2.75" y="2.75" width="10.5" height="10.5" rx="2" />
      <path d="M5.5 6h5M5.5 8.25h5M5.5 10.5h2.75" />
    </template>
    <template v-else-if="name === 'lock'">
      <rect x="3.5" y="7" width="9" height="6.25" rx="1.5" />
      <path d="M5.5 7V5.25a2.5 2.5 0 0 1 5 0V7" />
    </template>
    <path v-else-if="name === 'plus'" d="M8 3.5v9M3.5 8h9" />
    <path v-else-if="name === 'chevron'" d="m6 3.5 4.5 4.5L6 12.5" />
    <template v-else-if="name === 'pencil'">
      <path d="M10.9 2.7a1.5 1.5 0 0 1 2.1 2.1L5.6 12.3l-2.8.7.7-2.8 7.4-7.5Z" />
      <path d="m9.8 3.8 2.3 2.3" />
    </template>
    <path v-else d="m4 4 8 8M12 4l-8 8" />
  </svg>
</template>
