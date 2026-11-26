<script setup lang="ts">
// Mapping Studio: the input contract, one level of it, in the Definition Studio's tree language.
// Local objects open (solid line), references by their exact version and unfolding on demand
// (dashed line), values by their type. Availability is the domain's (studio.ts): an optional
// property says so; what's inside one says it may be absent, and why, on demand. What the step's
// Transform version can't read is shown, quieter, never hidden.
import type { DefinitionRef } from '#shared/features/definitions'
import DefinitionsIcon from '../definitions/DefinitionsIcon.vue'
import StudioInputTree from './StudioInputTree.vue'
import type { InputNode } from './studio'

const props = withDefaults(defineProps<{ nodes: readonly InputNode[]; label: (ref: DefinitionRef) => string; highlight?: ReadonlySet<string>; level?: number }>(), { highlight: () => new Set(), level: 1 })

const key = (n: InputNode) => JSON.stringify(n.path)
// Local objects start open, references folded: each opens on its own.
const flipped = ref<ReadonlySet<string>>(new Set())
const isOpen = (n: InputNode) => (n.type === 'object') !== flipped.value.has(n.name)
function flip(name: string) {
  const next = new Set(flipped.value)
  if (!next.delete(name)) next.add(name)
  flipped.value = next
}
/** An input place the selected output property reads (itself, or something inside it). */
const lit = (n: InputNode) => props.highlight.has(key(n))
const typeWords: Record<string, string> = { string: 'Text', number: 'Number', boolean: 'Yes or no' }
const count = (n: number) => (n === 1 ? '1 property' : `${n} properties`)
</script>

<template>
  <ul class="flex flex-col" :data-input-level="level">
    <li v-for="n in nodes" :key="n.name" :data-input-node="n.path.join(' › ')">
      <div class="flex min-h-9 items-center gap-2.5 rounded-lg py-1 pr-1 text-sm transition" :class="lit(n) ? 'bg-accent-50 ring-1 ring-accent-200' : ''" :data-reads="lit(n) || undefined">
        <button
          v-if="n.children.length"
          type="button"
          :aria-expanded="isOpen(n)"
          :aria-label="`${isOpen(n) ? 'Hide' : 'Show'} what ${n.name} contains`"
          class="grid size-5 shrink-0 place-items-center rounded text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
          @click="flip(n.name)"
        >
          <DefinitionsIcon name="chevron" class="size-3 transition-transform" :class="{ 'rotate-90': isOpen(n) }" />
        </button>
        <span v-else class="w-5 shrink-0" aria-hidden="true" />
        <span class="grid size-6 shrink-0 place-items-center rounded-md" :class="n.type === 'object' || n.type === 'reference' ? 'bg-accent-50 text-accent-600' : 'bg-slate-100 text-slate-500'">
          <DefinitionsIcon :name="n.type" class="size-3.5" />
        </span>
        <span class="min-w-0 truncate font-mono" :class="n.readable || n.type === 'object' || n.type === 'reference' ? 'text-slate-900' : 'text-slate-400'">{{ n.name }}</span>
        <span class="ml-auto flex min-w-0 shrink-0 items-center gap-1.5 text-xs text-slate-500">
          <span v-if="n.type === 'reference' && n.unresolved" class="font-medium text-red-700">{{ label(n.definition!) }} can’t be found here</span>
          <span v-else-if="n.type === 'reference'" class="truncate font-medium text-slate-700" data-input-version>{{ label(n.definition!) }}</span>
          <span v-else-if="n.type === 'object'">Object · {{ count(n.children.length) }}</span>
          <span v-else-if="!n.readable" :title="`This Transform version reads only top-level values`">{{ typeWords[n.type] }} · not readable here</span>
          <span v-else>{{ typeWords[n.type] }}</span>
          <span v-if="n.optional" class="rounded-full bg-slate-100 px-1.5 py-px text-[10px] font-medium text-slate-500">Optional</span>
          <span v-else-if="n.absence" class="text-[11px] text-slate-400" :title="n.absence" :aria-label="n.absence">may be absent</span>
        </span>
      </div>
      <div v-if="n.children.length && isOpen(n)" class="ml-2.5 border-l-2 pl-3" :class="n.type === 'reference' ? 'border-dashed border-slate-200' : 'border-slate-100'">
        <StudioInputTree :nodes="n.children" :label="label" :highlight="highlight" :level="level + 1" />
      </div>
    </li>
  </ul>
</template>
