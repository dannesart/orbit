<script setup lang="ts">
// A contract in General, read-only, at any size. A small one is its structure at once; a large one
// is first what it holds (how many properties, local objects and other Definitions, at every
// depth), with its structure one disclosure away, so what follows in General (the output) stays
// close. Either way, local objects and references start folded, each opening on its own, and a
// large one can be searched by property name (the places that match, with what leads to them).
// Only a way of looking: the tree is the domain's (studio.ts: inputTree), nothing here changes it.
import type { DefinitionRef } from '#shared/features/definitions'
import DefinitionsIcon from '../definitions/DefinitionsIcon.vue'
import DesignerIcon from './DesignerIcon.vue'
import StudioInputTree from './StudioInputTree.vue'
import { type InputNode, contractSize, findInTree } from './studio'

const props = withDefaults(defineProps<{
  nodes: readonly InputNode[]
  label: (ref: DefinitionRef) => string
  /** A contract shown for what it contains (an output): what a Transform version reads doesn't apply. */
  plain?: boolean
  /** What it's called, for the disclosure's and the search's accessible names. */
  name: string
  /** From how many top-level properties a contract counts as large. */
  large?: number
}>(), { plain: false, large: 12 })

const size = computed(() => contractSize(props.nodes))
const isLarge = computed(() => props.nodes.length > props.large)
const open = ref(false)
const query = ref('')
const shown = computed(() => findInTree(props.nodes, query.value))
const searching = computed(() => query.value.trim().length > 0)
const words = (n: number, one: string, many: string) => (n === 1 ? `1 ${one}` : `${n} ${many}`)
const id = useId()
</script>

<template>
  <div data-contract-overview :data-large="isLarge || undefined">
    <template v-if="isLarge">
      <!-- What it holds, and its structure on demand -->
      <button
        type="button"
        class="flex w-full items-center gap-2 rounded-xl py-1.5 text-left text-sm text-slate-700 transition hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
        :aria-expanded="open"
        :aria-controls="`${id}-structure`"
        data-contract-toggle
        @click="open = !open"
      >
        <DesignerIcon name="chevron" class="size-4 shrink-0 text-slate-400 transition-transform" :class="{ 'rotate-90': open }" />
        <span class="shrink-0 font-medium whitespace-nowrap" data-contract-size>{{ words(nodes.length, 'property', 'properties') }}</span>
        <span class="flex flex-wrap items-center gap-x-2.5 text-xs text-slate-500">
          <span v-if="size.objects" class="inline-flex items-center gap-1"><DefinitionsIcon name="object" class="size-3 text-accent-500" />{{ words(size.objects, 'object', 'objects') }}</span>
          <span v-if="size.references" class="inline-flex items-center gap-1"><DefinitionsIcon name="reference" class="size-3 text-accent-500" />{{ words(size.references, 'Definition', 'Definitions') }}</span>
          <span v-if="size.properties > nodes.length">{{ size.properties }} at every depth</span>
        </span>
        <span class="ml-auto shrink-0 text-xs text-accent-700">{{ open ? 'Hide' : 'Show' }} structure</span>
        <span class="sr-only">of {{ name }}</span>
      </button>
      <div v-if="open" :id="`${id}-structure`" class="mt-2">
        <label class="relative block">
          <span class="sr-only">Find a property in {{ name }}</span>
          <input v-model="query" type="search" autocomplete="off" spellcheck="false" placeholder="Find a property" class="w-full rounded-xl border border-slate-200 bg-white py-1.5 pr-3 pl-8 text-sm text-slate-900 outline-none transition focus:border-accent-500 focus:ring-2 focus:ring-accent-100" data-contract-search>
          <svg class="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-slate-400" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="7" cy="7" r="4.25" /><path d="m10.25 10.25 3 3" stroke-linecap="round" /></svg>
        </label>
        <div class="mt-2">
          <StudioInputTree v-if="shown.length" :key="searching ? `q:${query}` : 'all'" :nodes="shown" :label="label" :plain="plain" collapsed :open-all="searching" />
          <p v-else class="py-1.5 text-sm text-slate-500" aria-live="polite">No property called “{{ query.trim() }}”.</p>
        </div>
      </div>
    </template>
    <StudioInputTree v-else :nodes="nodes" :label="label" :plain="plain" collapsed />
  </div>
</template>
