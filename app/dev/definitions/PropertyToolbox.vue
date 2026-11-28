<script setup lang="ts">
// The toolbox beside the model: the building blocks a property can be made of, searchable.
//
//   Basic types           text, number, yes or no, and an object (a local object, with its own properties)
//   Reusable Definitions  this workspace's own, then those Orbit provides: each with its icon, colour
//                         and versions. The latest is chosen to begin with, but a version is always
//                         chosen: the property added references exactly that one, and stays on it
//                         (nothing upgrades by itself). Another workspace's are never here.
//
// Each block is added by clicking it or by dragging it into the model (the same result). It only
// offers: what a block becomes, and where it goes, is the model's business (ModelBuilder). On wide
// screens it stands to the right of the model, in view while the model scrolls; on smaller ones it
// sits above the model, its basic types one compact strip and its Definitions folded away.
import type { DefinitionRef, PropertyType } from '#shared/features/definitions'
import type { BuildingBlock, StudioCatalogue } from './catalogue'
import { typeWords } from './model'
import DefinitionTile from './DefinitionTile.vue'
import DefinitionsIcon from './DefinitionsIcon.vue'

/** What a block adds: a basic type, or a reference to one exact version (with a suggested name). */
interface Block {
  readonly type: PropertyType
  readonly definition?: DefinitionRef
  readonly name?: string
}
const props = defineProps<{ target: string | null; catalogue: StudioCatalogue }>()
const emit = defineEmits<{ add: [Block]; drag: [DragEvent, Block]; dragend: []; clearTarget: [] }>()

const BASIC: PropertyType[] = ['string', 'number', 'boolean', 'object']

const query = ref('')
const matches = (text: string) => text.toLowerCase().includes(query.value.trim().toLowerCase())
const basic = computed(() => BASIC.filter((t) => matches(typeWords[t])))
const own = computed(() => props.catalogue.blocks.filter((b) => !b.provided && matches(b.name)))
const provided = computed(() => props.catalogue.blocks.filter((b) => b.provided && matches(b.name)))
const nothing = computed(() => !basic.value.length && !own.value.length && !provided.value.length)
// Definitions fold away on small screens (the model keeps the space); a search opens them.
const showDefinitions = ref(false)
watch(query, (q) => q.trim() && (showDefinitions.value = true))

/** The version chosen for each Definition: the latest to begin with. */
const chosen = ref<Record<string, number>>({})
const versionOf = (b: BuildingBlock) => chosen.value[b.id] ?? b.versions.at(-1)!.version
/** A property name to start from, from the Definition's name ("Postal address" → postalAddress). Always editable. */
function suggest(name: string): string {
  const words = name.split(/[^\p{L}\p{N}]+/u).filter(Boolean)
  return words.map((w, i) => (i ? w[0]!.toUpperCase() + w.slice(1) : w[0]!.toLowerCase() + w.slice(1))).join('')
}
const blockFor = (b: BuildingBlock): Block => ({ type: 'reference', definition: { id: b.id, version: versionOf(b) }, name: suggest(b.name) })

const block = 'flex w-full cursor-grab items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-sm font-medium whitespace-nowrap text-slate-700 transition hover:border-accent-300 hover:bg-accent-50/60 hover:text-accent-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 active:cursor-grabbing'
const heading = 'text-[11px] font-medium tracking-wide text-slate-400 uppercase'
</script>

<template>
  <section aria-labelledby="toolbox-heading" class="rounded-2xl bg-slate-50/80 p-3 ring-1 ring-slate-200/70 lg:max-h-[calc(100dvh-3rem)] lg:overflow-y-auto" data-toolbox>
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

    <template v-if="basic.length">
      <h3 :class="[heading, 'mt-3']">Basic types</h3>
      <ul class="mt-1.5 flex gap-1.5 overflow-x-auto lg:flex-col lg:overflow-visible">
        <li v-for="t in basic" :key="t" class="shrink-0 lg:shrink">
          <button
            type="button"
            draggable="true"
            :data-add-type="t"
            :aria-label="`Add ${t === 'object' ? 'an object' : `a ${typeWords[t].toLowerCase()} property`}${target ? ` into ${target}` : ''}`"
            :class="block"
            @click="emit('add', { type: t })"
            @dragstart="emit('drag', $event, { type: t })"
            @dragend="emit('dragend')"
          >
            <span class="grid size-6 shrink-0 place-items-center rounded-lg" :class="t === 'object' ? 'bg-accent-50 text-accent-600' : 'bg-slate-100 text-slate-600'">
              <DefinitionsIcon :name="t" class="size-3.5" />
            </span>
            {{ typeWords[t] }}
            <DefinitionsIcon name="plus" class="ml-auto hidden size-3.5 text-slate-400 lg:block" />
          </button>
        </li>
      </ul>
    </template>

    <!-- Reusable Definitions: folded on small screens, always open on wide ones -->
    <button
      type="button"
      class="mt-3 flex w-full items-center gap-1.5 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 lg:hidden"
      :aria-expanded="showDefinitions"
      aria-controls="toolbox-definitions"
      @click="showDefinitions = !showDefinitions"
    >
      <span :class="heading">Reusable Definitions</span>
      <span class="text-[11px] text-slate-400">{{ own.length + provided.length }}</span>
      <DefinitionsIcon name="chevron" class="ml-auto size-3.5 text-slate-400 transition-transform" :class="{ 'rotate-90': showDefinitions }" />
    </button>
    <h3 :class="[heading, 'mt-4 hidden lg:block']">Reusable Definitions</h3>
    <div id="toolbox-definitions" :class="showDefinitions ? 'block' : 'hidden lg:block'" data-toolbox-definitions>
      <template v-for="group in [{ key: 'own', label: 'Your workspace', items: own }, { key: 'orbit', label: 'Provided by Orbit', items: provided }]" :key="group.key">
        <p class="mt-2 text-xs font-medium text-slate-500">{{ group.label }}</p>
        <ul v-if="group.items.length" class="mt-1 flex flex-col gap-1.5">
          <li v-for="b in group.items" :key="b.id" class="flex items-center gap-1 rounded-xl border border-slate-200 bg-white pr-1.5 transition hover:border-accent-300" :data-add-definition="b.id">
            <button
              type="button"
              draggable="true"
              :aria-label="`Add ${b.name}, version ${versionOf(b)}${target ? ` into ${target}` : ''}`"
              class="flex min-w-0 flex-1 cursor-grab items-center gap-2.5 rounded-l-xl py-2 pl-2.5 text-left text-sm font-medium text-slate-700 transition hover:text-accent-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 active:cursor-grabbing"
              @click="emit('add', blockFor(b))"
              @dragstart="emit('drag', $event, blockFor(b))"
              @dragend="emit('dragend')"
            >
              <DefinitionTile :appearance="b.appearance" size="xs" />
              <span class="min-w-0 truncate">{{ b.name }}</span>
              <DefinitionsIcon v-if="b.provided" name="lock" class="size-3 shrink-0 text-slate-400" />
            </button>
            <!-- The version it will reference: exactly this one, chosen here. -->
            <select
              v-if="b.versions.length > 1"
              :value="versionOf(b)"
              :aria-label="`Version of ${b.name} to add`"
              data-block-version
              class="w-14 shrink-0 rounded-lg border-0 bg-slate-100 py-1 pr-5 pl-2 text-xs font-medium text-slate-600 outline-none focus:ring-2 focus:ring-accent-500"
              @change="chosen = { ...chosen, [b.id]: Number(($event.target as HTMLSelectElement).value) }"
            >
              <option v-for="v in [...b.versions].reverse()" :key="v.version" :value="v.version">v{{ v.version }}</option>
            </select>
            <span v-else class="shrink-0 rounded-lg bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">v{{ versionOf(b) }}</span>
          </li>
        </ul>
        <p v-else class="mt-1 text-xs text-slate-400">{{ query.trim() ? 'None match.' : group.key === 'own' ? 'None yet. Definitions you create here appear here.' : 'None.' }}</p>
      </template>
    </div>
    <p v-if="nothing" class="mt-3 text-xs text-slate-500">Nothing matches “{{ query.trim() }}”.</p>
  </section>
</template>
