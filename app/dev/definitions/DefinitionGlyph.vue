<!--
  One of a Definition's curated icons (appearance.ts), drawn as an outline. Decorative: whatever
  it sits in names the Definition (or, in the picker, the icon).
-->
<script setup lang="ts">
import { type DefinitionIcon, ICONS } from './appearance'

defineProps<{ name: DefinitionIcon }>()
</script>

<template>
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path v-for="(d, i) in ICONS[name].paths" :key="i" :d="d" />
  </svg>
</template>
