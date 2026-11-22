<!--
  The workspace navigation's icons, in the style of Orbit's menu icons (16×16, 1.5 stroke).
  Home is a small orbit with its moon; Settings and About are the icons the workspace menu used.
  Decorative: the navigation always shows the label beside it.
  Workflows (three steps on a line) exists only in builds with the workflow designer experiment;
  elsewhere the flag is false at build time and its branch is dropped.
-->
<script setup lang="ts">
defineProps<{ name: 'home' | 'people' | 'workflows' | 'settings' | 'about' }>()
const workflows = import.meta.env.ORBIT_PLAYGROUND === true
</script>

<template>
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <template v-if="name === 'home'">
      <circle cx="8" cy="8" r="5.5" />
      <circle cx="8" cy="8" r="1.75" fill="currentColor" stroke="none" />
      <circle cx="12" cy="4" r="1.25" fill="currentColor" stroke="none" />
    </template>
    <template v-else-if="name === 'people'">
      <circle cx="6" cy="5.5" r="2.25" />
      <path d="M2 13c.4-2.3 2-3.5 4-3.5s3.6 1.2 4 3.5" />
      <path d="M10.5 3.6a2.25 2.25 0 0 1 0 3.8M12 9.8c1 .5 1.8 1.6 2 3.2" />
    </template>
    <template v-else-if="workflows && name === 'workflows'">
      <circle cx="3.25" cy="8" r="1.75" />
      <circle cx="12.75" cy="8" r="1.75" />
      <circle cx="8" cy="8" r="1.75" fill="currentColor" stroke="none" />
      <path d="M5 8h1.25M9.75 8H11" />
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
