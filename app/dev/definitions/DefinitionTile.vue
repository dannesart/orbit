<!--
  A Definition's icon on its lightly tinted tile: the workspace's own in the colour chosen for it,
  Orbit's (no appearance: read-only) always the Definition icon in slate. Decorative.
-->
<script setup lang="ts">
import { type Appearance, COLOR_STYLES } from './appearance'
import DefinitionGlyph from './DefinitionGlyph.vue'

const props = withDefaults(defineProps<{ appearance: Appearance | null; size?: 'xs' | 'sm' | 'md' }>(), { size: 'md' })
const tile = computed(() => (props.appearance ? COLOR_STYLES[props.appearance.color].tile : 'bg-slate-100 text-slate-500'))
</script>

<template>
  <span aria-hidden="true" class="grid shrink-0 place-items-center" :class="[tile, size === 'xs' ? 'size-6 rounded-md' : size === 'sm' ? 'size-9 rounded-xl' : 'size-10 rounded-xl']">
    <DefinitionGlyph :name="appearance?.icon ?? 'definition'" :class="size === 'xs' ? 'size-3.5' : size === 'sm' ? 'size-[18px]' : 'size-5'" />
  </span>
</template>
