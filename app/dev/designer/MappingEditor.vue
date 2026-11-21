<script setup lang="ts">
// The Transform's output properties, as the list playground edits them (FeaturePlayground.vue),
// lifted into the side panel: the same SourceEditor, hints and words. A disposable copy for this
// experiment rather than a refactor of the list page, so the two can be compared side by side.
import { type MappingProperty, formatSource } from '#shared/features/mappings'
import { A1, B1, definitionLabel, mappingHints } from '../features/experiment'
import SourceEditor from '../features/SourceEditor.vue'

const props = defineProps<{ modelValue: MappingProperty[] }>()
const emit = defineEmits<{ 'update:modelValue': [MappingProperty[]] }>()

const hints = computed(() => mappingHints(props.modelValue, A1, B1))
const update = (i: number, change: Partial<MappingProperty>) =>
  emit('update:modelValue', props.modelValue.map((p, j) => (j === i ? { ...p, ...change } : p)))
const add = () => emit('update:modelValue', [...props.modelValue, { name: '', source: { kind: 'literal', value: '' } }])
const remove = (i: number) => emit('update:modelValue', props.modelValue.filter((_, j) => j !== i))

const control = 'rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-900 shadow-xs outline-none transition focus:border-accent-500 focus:ring-2 focus:ring-accent-100'
</script>

<template>
  <div>
    <ul class="flex flex-col gap-4">
      <li v-for="(property, i) in modelValue" :key="i" class="rounded-2xl border border-slate-200 bg-white p-4">
        <div class="flex flex-wrap items-center gap-2">
          <input
            :value="property.name"
            type="text"
            autocomplete="off"
            spellcheck="false"
            placeholder="propertyName"
            :aria-label="`Property ${i + 1} name`"
            :class="[control, 'w-40 font-mono font-medium']"
            @input="update(i, { name: ($event.target as HTMLInputElement).value })"
          >
          <span class="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-700">{{ hints.rows[i]?.type ?? '?' }}</span>
          <span v-if="hints.rows[i]?.expected === null && property.name" class="text-xs text-amber-700">Not in {{ definitionLabel(B1) }}</span>
          <span v-else-if="hints.rows[i]?.type && hints.rows[i]?.expected && hints.rows[i]?.type !== hints.rows[i]?.expected" class="text-xs text-amber-700">
            {{ definitionLabel(B1) }} expects {{ hints.rows[i]?.expected }}
          </span>
          <button type="button" class="link ml-auto text-sm" :aria-label="`Remove property ${property.name || i + 1}`" @click="remove(i)">Remove</button>
        </div>
        <div class="mt-3">
          <SourceEditor :model-value="property.source" :fields="A1.fields" :label="property.name || `Property ${i + 1}`" @update:model-value="update(i, { source: $event })" />
        </div>
        <p class="mt-3 overflow-x-auto font-mono text-xs whitespace-nowrap text-slate-500">{{ property.name || '?' }} = {{ formatSource(property.source) }}</p>
        <ul v-if="hints.rows[i]?.issues.length" class="mt-2 list-disc pl-5 text-sm text-red-700">
          <li v-for="issue in hints.rows[i]?.issues" :key="issue">{{ issue }}</li>
        </ul>
      </li>
    </ul>
    <button type="button" class="link mt-3 text-sm" @click="add">Add a property</button>
    <p v-if="hints.missing.length" class="mt-2 text-sm text-amber-700">
      {{ definitionLabel(B1) }} also needs {{ hints.missing.map((f) => `${f.name} (${f.type})`).join(', ') }}.
    </p>
  </div>
</template>
