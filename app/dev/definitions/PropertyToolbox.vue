<script setup lang="ts">
// The toolbox beside the model: the building blocks a property can be made of, searchable. Each
// is added by clicking it or by dragging it into the model (the same result). It only offers:
// what a block becomes, and where it goes, is the model's business (ModelBuilder).
//
// On wide screens it stands to the right of the model, and stays in view while the model scrolls.
// On smaller ones it sits above the model as one compact strip, so the model keeps the width.
import type { FieldType } from '#shared/features/definitions'
import { typeWords } from './model'
import DefinitionsIcon from './DefinitionsIcon.vue'

defineProps<{ target: string | null }>()
const emit = defineEmits<{ add: [FieldType]; drag: [DragEvent, FieldType]; dragend: []; clearTarget: [] }>()

const BASIC: FieldType[] = ['string', 'number', 'boolean']

const query = ref('')
const matches = (text: string) => text.toLowerCase().includes(query.value.trim().toLowerCase())
const basic = computed(() => BASIC.filter((t) => matches(typeWords[t])))
const block = 'flex w-full cursor-grab items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-sm font-medium whitespace-nowrap text-slate-700 transition hover:border-accent-300 hover:bg-accent-50/60 hover:text-accent-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 active:cursor-grabbing'
</script>

<template>
  <section aria-labelledby="toolbox-heading" class="rounded-2xl bg-slate-50/80 p-3 ring-1 ring-slate-200/70" data-toolbox>
    <div class="flex items-center gap-2">
      <h2 id="toolbox-heading" class="text-xs font-medium text-slate-500">Add a property</h2>
      <span v-if="target" class="ml-auto flex min-w-0 items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[11px] text-accent-700 ring-1 ring-accent-200" data-toolbox-target>
        <span class="truncate">into {{ target }}</span>
        <button type="button" class="grid size-4 shrink-0 place-items-center rounded-full hover:bg-accent-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500" :aria-label="`Stop adding into ${target}`" @click="emit('clearTarget')">
          <DefinitionsIcon name="close" class="size-2.5" />
        </button>
      </span>
    </div>
    <label class="mt-2 flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm focus-within:border-accent-500 focus-within:ring-2 focus-within:ring-accent-100">
      <DefinitionsIcon name="search" class="size-3.5 shrink-0 text-slate-400" />
      <span class="sr-only">Search building blocks</span>
      <input v-model="query" type="search" placeholder="Search" autocomplete="off" class="min-w-0 flex-1 bg-transparent text-slate-900 outline-none placeholder:text-slate-400" data-toolbox-search>
    </label>

    <h3 class="mt-3 text-[11px] font-medium tracking-wide text-slate-400 uppercase">Basic types</h3>
    <ul class="mt-1.5 flex gap-1.5 overflow-x-auto lg:flex-col lg:overflow-visible">
      <li v-for="t in basic" :key="t" class="shrink-0 lg:shrink">
        <button
          type="button"
          draggable="true"
          :data-add-type="t"
          :aria-label="`Add a ${typeWords[t].toLowerCase()} property${target ? ` into ${target}` : ''}`"
          :class="block"
          @click="emit('add', t)"
          @dragstart="emit('drag', $event, t)"
          @dragend="emit('dragend')"
        >
          <span class="grid size-6 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600">
            <DefinitionsIcon :name="t" class="size-3.5" />
          </span>
          {{ typeWords[t] }}
          <DefinitionsIcon name="plus" class="ml-auto hidden size-3.5 text-slate-400 lg:block" />
        </button>
      </li>
    </ul>
    <p v-if="!basic.length" class="mt-2 text-xs text-slate-500">Nothing matches “{{ query.trim() }}”.</p>
  </section>
</template>
