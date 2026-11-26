<script setup lang="ts">
// One level of the Preview's example: a card per property, given or left out. A value is typed or
// chosen; a local object or a reference, when given, holds the next level, indented beneath it.
// Left out, what's inside is hidden but kept, and comes back when it's given again. A reference
// that can't be resolved here says so: there's nothing to fill in, and that isn't the example's fault.
import type { ExampleEntries, ExampleEntry, ExampleNode } from './example'
import type { StudioCatalogue } from './catalogue'
import { typeWords } from './model'
import DefinitionTile from './DefinitionTile.vue'
import DefinitionsIcon from './DefinitionsIcon.vue'
import ExampleInputs from './ExampleInputs.vue'

const props = defineProps<{
  nodes: readonly ExampleNode[]
  entries: ExampleEntries
  advanced: boolean
  idPrefix: string
  catalogue: StudioCatalogue
  set: (id: string, change: Partial<ExampleEntry>, edited?: boolean) => void
}>()

const entryOf = (n: ExampleNode) => props.entries[n.id]
const words = (n: ExampleNode) => n.path.join(' › ')
const id = (n: ExampleNode, what: string) => `${props.idPrefix}-example-${what}-${n.id.replace(/[^\w-]/g, '_')}`
/** Advanced: send this value exactly as typed text (yes or no becomes the text "true" or "false"), or not. */
function setRaw(n: ExampleNode, on: boolean) {
  const v = entryOf(n)!.value
  if (on) props.set(n.id, { raw: true, value: typeof v === 'boolean' ? String(v) : v })
  else props.set(n.id, { raw: false, value: n.type === 'boolean' ? v === true || v === 'true' : String(v) })
}
const blockOf = (n: ExampleNode) => (n.definition ? props.catalogue.find(n.definition.id) : null)
const control = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-accent-500 focus:ring-2 focus:ring-accent-100'
</script>

<template>
  <ul class="flex flex-col gap-1.5">
    <li v-for="n in nodes" :key="n.id" class="rounded-xl border border-slate-200/80 bg-white px-3 py-2.5" :data-example="words(n)">
      <div class="flex items-center gap-2">
        <DefinitionTile v-if="n.kind === 'reference'" :appearance="blockOf(n)?.appearance ?? null" size="xs" />
        <DefinitionsIcon v-else :name="n.kind === 'object' ? 'object' : n.type as 'string'" class="size-4 shrink-0" :class="n.kind === 'object' ? 'text-accent-500' : 'text-slate-400'" />
        <span class="min-w-0 truncate font-mono text-sm text-slate-900">{{ n.name }}</span>
        <span v-if="n.kind === 'reference'" class="hidden truncate text-xs text-slate-400 sm:inline">{{ catalogue.label(n.definition!) }}</span>
        <span class="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium" :class="n.optional ? 'bg-slate-100 text-slate-500' : 'bg-accent-50 text-accent-700'">{{ n.optional ? 'Optional' : 'Required' }}</span>
        <label class="ml-auto flex shrink-0 cursor-pointer items-center gap-2 text-xs text-slate-600">
          <input
            :id="id(n, 'given')"
            type="checkbox"
            class="peer sr-only"
            :checked="entryOf(n)?.given"
            @change="set(n.id, { given: ($event.target as HTMLInputElement).checked }, false)"
          >
          <span class="relative h-5 w-9 rounded-full bg-slate-200 transition peer-checked:bg-accent-500 peer-focus-visible:ring-2 peer-focus-visible:ring-accent-500 peer-focus-visible:ring-offset-2 after:absolute after:top-0.5 after:left-0.5 after:size-4 after:rounded-full after:bg-white after:shadow-sm after:transition peer-checked:after:translate-x-4" aria-hidden="true" />
          <span class="sr-only">Give {{ words(n) }}</span>
          <span aria-hidden="true">{{ entryOf(n)?.given ? 'Given' : 'Left out' }}</span>
        </label>
      </div>

      <template v-if="entryOf(n)?.given">
        <!-- A value -->
        <div v-if="n.kind === 'value'" class="mt-2">
          <input
            v-if="entryOf(n)!.raw || n.type !== 'boolean'"
            :id="id(n, 'value')"
            :value="String(entryOf(n)!.value)"
            type="text"
            :inputmode="n.type === 'number' && !entryOf(n)!.raw ? 'decimal' : undefined"
            :aria-label="`${words(n)}, ${entryOf(n)!.raw ? 'sent as typed text' : typeWords[n.type].toLowerCase()}`"
            :class="control"
            @input="set(n.id, { value: ($event.target as HTMLInputElement).value })"
          >
          <div v-else role="radiogroup" :aria-label="words(n)" class="flex w-48 rounded-full bg-slate-100 p-0.5">
            <label v-for="choice in [true, false]" :key="String(choice)" class="flex flex-1 cursor-pointer items-center justify-center rounded-full px-3 py-1.5 text-xs font-medium transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent-500" :class="entryOf(n)!.value === choice ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'">
              <input type="radio" class="sr-only" :name="id(n, 'choice')" :checked="entryOf(n)!.value === choice" @change="set(n.id, { value: choice })">
              {{ choice ? 'Yes' : 'No' }}
            </label>
          </div>
          <label v-if="advanced && n.type !== 'string'" class="mt-1.5 flex items-center gap-2 text-xs text-slate-500">
            <input type="checkbox" :checked="entryOf(n)!.raw" class="size-3.5 rounded accent-accent-600" @change="setRaw(n, ($event.target as HTMLInputElement).checked)">
            Send exactly as typed text
          </label>
        </div>
        <!-- A reference that can't be resolved: nothing to fill in -->
        <p v-else-if="n.unresolved" class="mt-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800 ring-1 ring-amber-200" data-example-unavailable>
          {{ catalogue.label(n.definition!) }} can’t be found here, so there’s nothing to fill in.
        </p>
        <!-- An object or a reference: the next level -->
        <div v-else class="mt-2 border-l-2 pl-3" :class="n.kind === 'reference' ? 'border-dashed border-slate-200' : 'border-slate-100'">
          <ExampleInputs v-if="n.children.length" :nodes="n.children" :entries="entries" :advanced="advanced" :id-prefix="idPrefix" :catalogue="catalogue" :set="set" />
          <p v-else class="py-1 text-xs text-slate-400">No properties: an empty object.</p>
        </div>
      </template>
      <p v-else class="mt-1 text-xs text-slate-500">
        {{ n.optional ? 'Left out. Allowed: it’s optional.' : 'Left out, to see what happens: it’s required.' }}
        <template v-if="n.kind !== 'value' && n.children.length">What’s inside is kept for when it’s given again.</template>
      </p>
    </li>
  </ul>
</template>
