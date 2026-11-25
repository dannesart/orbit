<!--
  The Definitions place's small icons: outlines in the style of Orbit's navigation icons (16×16
  grid, round caps). The Definition icon is the one the navigation uses for Definitions, so a card
  and the place it lives in look alike. The three property types: text (a T), number (a hash) and
  yes or no (a toggle). Always decorative: the control they sit in is named.
-->
<script setup lang="ts">
export type DefinitionsIconName =
  | 'definition' | 'lock' | 'plus' | 'chevron' | 'pencil' | 'close'
  | 'string' | 'number' | 'boolean' | 'grip' | 'up' | 'down' | 'reset' | 'flask'
defineProps<{ name: DefinitionsIconName }>()
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
    <path v-else-if="name === 'string'" d="M3.75 4.25h8.5M8 4.25v8M6.5 12.25h3" />
    <path v-else-if="name === 'number'" d="M6.25 2.75 5.25 13.25M10.75 2.75l-1 10.5M3.25 6h10M2.75 10h10" />
    <template v-else-if="name === 'boolean'">
      <rect x="1.75" y="4.75" width="12.5" height="6.5" rx="3.25" />
      <circle cx="11" cy="8" r="1.75" />
    </template>
    <path v-else-if="name === 'grip'" d="M6 4v.01M10 4v.01M6 8v.01M10 8v.01M6 12v.01M10 12v.01" stroke-width="2" />
    <path v-else-if="name === 'up'" d="m4 9.5 4-4 4 4" />
    <path v-else-if="name === 'down'" d="m4 6.5 4 4 4-4" />
    <template v-else-if="name === 'reset'">
      <path d="M3 8a5 5 0 1 0 1.5-3.55" />
      <path d="M3 2.75V5.5h2.75" />
    </template>
    <template v-else-if="name === 'flask'">
      <path d="M6.25 2.75h3.5M6.75 2.75v3.5L3.4 11.9a1 1 0 0 0 .87 1.35h7.46a1 1 0 0 0 .87-1.35L9.25 6.25v-3.5" />
      <path d="M5 10h6" />
    </template>
    <path v-else d="m4 4 8 8M12 4l-8 8" />
  </svg>
</template>
