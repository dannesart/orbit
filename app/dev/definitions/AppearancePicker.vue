<!--
  Choosing a Definition's appearance: one of the curated icons and one of eight colours, each a
  native radio group (arrow keys move the choice; each option has its name), and the catalogue card
  as it will look. Presentation only: nothing here touches a version.
-->
<script setup lang="ts">
import { type Appearance, COLORS, COLOR_STYLES, ICONS, ICON_NAMES } from './appearance'
import DefinitionGlyph from './DefinitionGlyph.vue'
import DefinitionTile from './DefinitionTile.vue'

const props = defineProps<{ modelValue: Appearance; name: string; meta: string; idPrefix: string }>()
const emit = defineEmits<{ 'update:modelValue': [Appearance] }>()
const set = (change: Partial<Appearance>) => emit('update:modelValue', { ...props.modelValue, ...change })
const option = 'relative grid cursor-pointer place-items-center rounded-xl transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent-500'
</script>

<template>
  <div class="flex flex-col gap-5">
    <fieldset>
      <legend class="text-sm font-medium text-slate-700">Icon</legend>
      <div role="radiogroup" :aria-label="`Icon: ${ICONS[modelValue.icon].label}`" class="mt-2 grid grid-cols-[repeat(auto-fill,minmax(2.5rem,1fr))] gap-1.5">
        <label
          v-for="icon in ICON_NAMES"
          :key="icon"
          :title="ICONS[icon].label"
          :class="[option, 'size-10', icon === modelValue.icon ? `${COLOR_STYLES[modelValue.color].tile} ring-2 ring-current/40` : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800']"
        >
          <input type="radio" class="sr-only" :name="`${idPrefix}-icon`" :value="icon" :checked="icon === modelValue.icon" :aria-label="ICONS[icon].label" @change="set({ icon })">
          <DefinitionGlyph :name="icon" class="size-5" />
        </label>
      </div>
    </fieldset>

    <fieldset>
      <legend class="text-sm font-medium text-slate-700">Colour</legend>
      <div role="radiogroup" :aria-label="`Colour: ${COLOR_STYLES[modelValue.color].label}`" class="mt-2 flex flex-wrap gap-1.5">
        <label
          v-for="color in COLORS"
          :key="color"
          :title="COLOR_STYLES[color].label"
          :class="[option, 'size-8 rounded-full', color === modelValue.color ? 'ring-2 ring-slate-900/70 ring-offset-2' : 'hover:ring-2 hover:ring-slate-300 hover:ring-offset-2']"
        >
          <input type="radio" class="sr-only" :name="`${idPrefix}-color`" :value="color" :checked="color === modelValue.color" :aria-label="COLOR_STYLES[color].label" @change="set({ color })">
          <span class="size-5 rounded-full" :class="COLOR_STYLES[color].swatch" />
        </label>
      </div>
    </fieldset>

    <div>
      <p class="text-sm font-medium text-slate-700">In the catalogue</p>
      <div class="mt-2 flex max-w-xs items-center gap-3 rounded-2xl border border-slate-200/80 bg-white p-4" data-appearance-preview>
        <DefinitionTile :appearance="modelValue" />
        <span class="min-w-0 flex-1">
          <span class="block truncate font-medium text-slate-900">{{ name || 'Unnamed' }}</span>
          <span class="block text-xs text-slate-500">{{ meta }}</span>
        </span>
      </div>
    </div>
  </div>
</template>
