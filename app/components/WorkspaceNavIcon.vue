<!--
  The workspace navigation's icons: outlines only, in the style of Orbit's menu icons (16×16 grid,
  round caps). Home is a house; Settings and About are the icons the workspace menu used.
  Decorative: the navigation names each place itself (aria-label, and its tooltip or label).
  Workflows (three steps on a line) and Definitions (a card listing what something contains) exist
  only in builds with the experiments; elsewhere the flag is false at build time and they drop.
-->
<script setup lang="ts">
defineProps<{ name: string }>()
const experiments = import.meta.env.ORBIT_PLAYGROUND === true
</script>

<template>
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <template v-if="name === 'home'">
      <path d="M2.5 7.25 8 2.75l5.5 4.5" />
      <path d="M4 6.25v6.5c0 .28.22.5.5.5h7c.28 0 .5-.22.5-.5v-6.5" />
      <path d="M6.75 13.25v-3h2.5v3" />
    </template>
    <template v-else-if="name === 'people'">
      <circle cx="6" cy="5.5" r="2.25" />
      <path d="M2 13c.4-2.3 2-3.5 4-3.5s3.6 1.2 4 3.5" />
      <path d="M10.5 3.6a2.25 2.25 0 0 1 0 3.8M12 9.8c1 .5 1.8 1.6 2 3.2" />
    </template>
    <template v-else-if="experiments && name === 'workflows'">
      <circle cx="3.25" cy="8" r="1.75" />
      <circle cx="8" cy="8" r="1.75" />
      <circle cx="12.75" cy="8" r="1.75" />
      <path d="M5 8h1.25M9.75 8H11" />
    </template>
    <template v-else-if="experiments && name === 'definitions'">
      <rect x="2.75" y="2.75" width="10.5" height="10.5" rx="2" />
      <path d="M5.5 6h5M5.5 8.25h5M5.5 10.5h2.75" />
    </template>
    <template v-else-if="name === 'settings'">
      <path d="M2.5 4.5h6M12.5 4.5h1M2.5 11.5h1M7.5 11.5h6" />
      <circle cx="10.5" cy="4.5" r="1.75" />
      <circle cx="5.5" cy="11.5" r="1.75" />
    </template>
    <template v-else>
      <circle cx="8" cy="8" r="5.75" />
      <path d="M8 7.25v3.5M8 5.25v.01" />
    </template>
  </svg>
</template>
