<script setup lang="ts">
// One level of the Preview's result: the information as Orbit receives it, as a nested structure
// rather than raw text. Values sit on their rows; a local object or a reference is a small group
// with its properties inside. Each of Orbit's problems shows on the row it's about, at exactly its
// path.
import { type ExampleEntries, type ExampleNode, pathKey, shown } from './example'
import type { StudioCatalogue } from './catalogue'
import DefinitionTile from './DefinitionTile.vue'
import DefinitionsIcon from './DefinitionsIcon.vue'
import ResultTree from './ResultTree.vue'

const props = defineProps<{
  nodes: readonly ExampleNode[]
  entries: ExampleEntries
  data: Record<string, unknown>
  byPath: Readonly<Record<string, string>>
  catalogue: StudioCatalogue
}>()
const problem = (n: ExampleNode) => props.byPath[pathKey(n.path)]
// What was given, and anything Orbit says is missing: a problem always shows at its own place.
const shownNodes = computed(() => props.nodes.filter((n) => props.entries[n.id]?.given || problem(n)))
const isGiven = (n: ExampleNode) => !!props.entries[n.id]?.given
const inner = (n: ExampleNode) => {
  const value = props.data[n.name]
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}
const blockOf = (n: ExampleNode) => (n.definition ? props.catalogue.find(n.definition.id) : null)
</script>

<template>
  <ul class="divide-y divide-slate-100">
    <li v-for="n in shownNodes" :key="n.id" class="py-2" :data-result="n.path.join(' › ')">
      <div v-if="n.kind === 'value'" class="flex items-baseline justify-between gap-3 text-sm">
        <span class="min-w-0 truncate font-mono text-slate-600">{{ n.name }}</span>
        <span v-if="isGiven(n)" class="min-w-0 truncate font-medium" :class="problem(n) ? 'text-red-700' : 'text-slate-900'">{{ shown(data[n.name]) }}</span>
        <span v-else class="text-xs text-red-700">not given</span>
      </div>
      <div v-else class="flex items-center gap-2 text-sm">
        <DefinitionTile v-if="n.kind === 'reference'" :appearance="blockOf(n)?.appearance ?? null" size="xs" />
        <DefinitionsIcon v-else name="object" class="size-4 shrink-0 text-accent-500" />
        <span class="min-w-0 truncate font-mono text-slate-600">{{ n.name }}</span>
        <span v-if="n.kind === 'reference'" class="ml-auto truncate text-xs text-slate-400">{{ catalogue.label(n.definition!) }}</span>
      </div>
      <p v-if="problem(n)" class="mt-0.5 text-xs text-red-700">{{ problem(n) }}</p>
      <div v-if="n.kind !== 'value' && n.children.length && isGiven(n)" class="mt-1.5 ml-2 border-l-2 pl-3" :class="n.kind === 'reference' ? 'border-dashed border-slate-200' : 'border-slate-100'">
        <ResultTree :nodes="n.children" :entries="entries" :data="inner(n)" :by-path="byPath" :catalogue="catalogue" />
        <p v-if="!n.children.some((c) => entries[c.id]?.given)" class="py-1 text-xs text-slate-400">Nothing given inside</p>
      </div>
    </li>
  </ul>
</template>
