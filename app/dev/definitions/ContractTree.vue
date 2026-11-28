<script setup lang="ts">
// A published contract, read-only: its properties as a quiet tree, local objects open, references
// showing exactly the version they name (its icon, name and version) and unfolding on demand to
// what that version contains. Used wherever a version is inspected rather than edited: inside a
// reference in the model builder, and in the catalogue's inspector.
//
// References resolve through the Studio catalogue (catalogue.ts): Orbit's exact resolution, only
// what this workspace may see. One that doesn't resolve is said so plainly, never left out. Going
// deeper stops at Orbit's depth limit, so even a contract that shouldn't exist can't run away.
import { type Field, MAX_OBJECT_LEVELS, type PropertyPath, propertyPathWords } from '#shared/features/definitions'
import type { StudioCatalogue } from './catalogue'
import { typeWords } from './model'
import ContractTree from './ContractTree.vue'
import DefinitionTile from './DefinitionTile.vue'
import DefinitionsIcon from './DefinitionsIcon.vue'

const props = withDefaults(defineProps<{ fields: readonly Field[]; catalogue: StudioCatalogue; level?: number; path?: PropertyPath }>(), { level: 1, path: () => [] })

const open = ref<ReadonlySet<string>>(new Set())
const flip = (name: string) => {
  const next = new Set(open.value)
  if (!next.delete(name)) next.add(name)
  open.value = next
}
const blockOf = (f: Field) => (f.type === 'reference' ? props.catalogue.find(f.definition.id) : null)
const resolved = (f: Field) => (f.type === 'reference' ? props.catalogue.resolve(f.definition) : null)
const count = (n: number) => (n === 1 ? '1 property' : `${n} properties`)
const deeper = computed(() => props.level < MAX_OBJECT_LEVELS)
</script>

<template>
  <ul class="flex flex-col" :data-contract-level="level">
    <li v-for="f in fields" :key="f.name" :data-contract-property="propertyPathWords([...path, f.name])">
      <div class="flex min-h-9 items-center gap-2.5 py-1 text-sm">
        <button
          v-if="f.type === 'reference' && resolved(f) && deeper"
          type="button"
          :aria-expanded="open.has(f.name)"
          :aria-label="`${open.has(f.name) ? 'Hide' : 'Show'} what ${f.name} contains`"
          class="grid size-5 shrink-0 place-items-center rounded text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
          @click="flip(f.name)"
        >
          <DefinitionsIcon name="chevron" class="size-3 transition-transform" :class="{ 'rotate-90': open.has(f.name) }" />
        </button>
        <span v-else class="w-5 shrink-0" aria-hidden="true" />
        <DefinitionTile v-if="f.type === 'reference'" :appearance="blockOf(f)?.appearance ?? null" size="xs" />
        <span v-else class="grid size-6 shrink-0 place-items-center rounded-md" :class="f.type === 'object' ? 'bg-accent-50 text-accent-600' : 'bg-slate-100 text-slate-500'">
          <DefinitionsIcon :name="f.type" class="size-3.5" />
        </span>
        <span class="min-w-0 truncate font-mono text-slate-900">{{ f.name }}</span>
        <span class="ml-auto flex min-w-0 shrink-0 items-center gap-1.5 text-xs text-slate-500">
          <template v-if="f.type === 'reference'">
            <span v-if="resolved(f)" class="flex items-center gap-1 truncate">
              <DefinitionsIcon v-if="blockOf(f)?.provided" name="lock" class="size-3 shrink-0" />
              {{ catalogue.label(f.definition) }}
            </span>
            <span v-else class="font-medium text-red-700" data-unresolved>{{ catalogue.label(f.definition) }} can’t be found here</span>
          </template>
          <template v-else-if="f.type === 'object'">Object · {{ count(f.fields.length) }}</template>
          <template v-else>{{ typeWords[f.type] }}</template>
          <span v-if="f.optional" class="rounded-full bg-slate-100 px-1.5 py-px text-[10px] font-medium text-slate-500">Optional</span>
        </span>
      </div>
      <div v-if="f.type === 'object' && f.fields.length && deeper" class="ml-2.5 border-l-2 border-slate-100 pl-3">
        <ContractTree :fields="f.fields" :catalogue="catalogue" :level="level + 1" :path="[...path, f.name]" />
      </div>
      <div v-else-if="f.type === 'reference' && open.has(f.name) && resolved(f) && deeper" class="ml-2.5 border-l-2 border-dashed border-slate-200 pl-3">
        <ContractTree :fields="resolved(f)!.fields" :catalogue="catalogue" :level="level + 1" :path="[...path, f.name]" />
      </div>
    </li>
  </ul>
</template>
