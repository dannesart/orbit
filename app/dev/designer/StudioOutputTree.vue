<script setup lang="ts">
// Mapping Studio: the output contract, one level of it, with what the draft makes at each place.
// Every row reads the same way: a quiet state mark, the property, its type (a reference by its exact
// version) and whether it's optional; below, how it's made: a value from the input, an object built
// (and when), a whole value copied, or deliberately left out. The whole row selects the property for
// the inspector; the tree itself never changes shape while it's edited. States come from the review
// and the domain's located issues (studio.ts), never from here. Names wrap rather than truncate.
//
// A built object's own properties fold away with their own small button, apart from the row (which
// opens the inspector): folding is only looking, never a change. `expanded`: the built objects shown
// open, by path (null: every one, as before); `openAll`: everything shown is open (a search's results).
import type { DefinitionRef, PropertyPath } from '#shared/features/definitions'
import DefinitionsIcon from '../definitions/DefinitionsIcon.vue'
import DesignerIcon from './DesignerIcon.vue'
import NameText from './NameText.vue'
import StudioOutputTree from './StudioOutputTree.vue'
import type { OutputNode, OutputStatus } from './studio'

const props = withDefaults(defineProps<{
  nodes: readonly OutputNode[]
  label: (ref: DefinitionRef) => string
  selected?: PropertyPath | null
  level?: number
  expanded?: ReadonlySet<string> | null
  openAll?: boolean
}>(), { selected: null, level: 1, expanded: null, openAll: false })
const emit = defineEmits<{ open: [path: PropertyPath]; fold: [key: string] }>()
const pathKey = (n: OutputNode) => n.path.join(' › ')
const isOpen = (n: OutputNode) => props.openAll || props.expanded === null || props.expanded.has(pathKey(n))

const MARK: Record<OutputStatus, { mark: string; tone: string; words: string }> = {
  mapped: { mark: '✓', tone: 'text-accent-600', words: 'Mapped' },
  not_mapped: { mark: '○', tone: 'text-amber-600', words: 'Not mapped' },
  left_out: { mark: '–', tone: 'text-slate-400', words: 'Left out' },
  incomplete: { mark: '◐', tone: 'text-amber-600', words: 'Incomplete' },
  problem: { mark: '!', tone: 'text-red-600', words: 'Needs attention' },
  unsupported: { mark: '×', tone: 'text-slate-400', words: 'Not supported by this Transform version' },
}
const typeWords: Record<string, string> = { string: 'text', number: 'number', boolean: 'yes or no', object: 'object' }
const isSelected = (n: OutputNode) => !!props.selected && props.selected.join(' › ') === n.path.join(' › ')
const howWords = (n: OutputNode) => {
  if (n.status === 'unsupported') return 'This Transform version can’t make it'
  if (n.how.kind !== 'none') return n.how.words
  return n.optional ? 'Left out' : 'Not mapped yet'
}
</script>

<template>
  <ul class="flex flex-col" :class="level === 1 ? 'divide-y divide-slate-100' : ''" :data-output-level="level">
    <li v-for="n in nodes" :key="n.name" :data-output-node="n.path.join(' › ')" :data-status="n.status">
      <div class="flex items-start">
      <!-- Folding a built object's properties: its own small control, apart from the row -->
      <button
        v-if="n.children.length && expanded !== null"
        type="button"
        class="mt-2.5 grid size-5 shrink-0 place-items-center rounded text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
        :aria-expanded="isOpen(n)"
        :aria-label="`${isOpen(n) ? 'Hide' : 'Show'} the properties built in ${n.name}`"
        data-output-fold
        @click="emit('fold', pathKey(n))"
      >
        <DefinitionsIcon name="chevron" class="size-3 transition-transform" :class="{ 'rotate-90': isOpen(n) }" />
      </button>
      <span v-else-if="expanded !== null" class="w-5 shrink-0" aria-hidden="true" />
      <button
        type="button"
        class="group flex min-w-0 flex-1 items-start gap-2.5 rounded-xl px-2 py-2.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-inset"
        :class="isSelected(n) ? 'bg-accent-50 ring-1 ring-accent-200 ring-inset' : 'hover:bg-slate-50'"
        :aria-expanded="isSelected(n)"
        aria-controls="studio-inspector"
        :aria-label="`${n.path.join(' › ')}, ${MARK[n.status].words}: ${howWords(n)}.${n.problem ? ` ${n.problem}` : ''} ${isSelected(n) ? 'Close the inspector' : 'Edit'}`"
        :data-selected="isSelected(n) || undefined"
        :data-output-row="n.path.join(' › ')"
        @click="emit('open', n.path)"
      >
        <span aria-hidden="true" class="mt-0.5 w-3 shrink-0 text-center text-xs font-semibold" :class="MARK[n.status].tone" :data-output-anchor="n.path.join(' › ')">{{ MARK[n.status].mark }}</span>
        <span class="min-w-0 flex-1">
          <span class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
            <span class="max-w-full shrink-0 font-mono text-sm font-semibold [overflow-wrap:anywhere] text-slate-900"><NameText :name="n.name" /></span>
            <span v-if="n.type === 'reference'" class="flex min-w-0 items-center gap-1 text-xs text-slate-500">
              <DefinitionsIcon name="reference" class="size-3 shrink-0 text-accent-500" />{{ label(n.definition!) }}
            </span>
            <span v-else class="text-xs text-slate-400">{{ typeWords[n.type] }}</span>
            <span v-if="n.optional" class="shrink-0 rounded-full bg-slate-100 px-1.5 py-px text-[10px] font-medium text-slate-500">Optional</span>
          </span>
          <span class="mt-0.5 flex min-w-0 items-start gap-1.5 text-sm" :class="n.status === 'not_mapped' ? 'text-amber-700' : n.how.kind === 'none' ? 'text-slate-500' : 'text-slate-700'" data-how>
            <span v-if="n.how.kind === 'value'" aria-hidden="true" class="text-slate-400">←</span>
            <DefinitionsIcon v-else-if="n.how.kind === 'build'" name="object" class="mt-0.5 size-3.5 shrink-0 text-slate-400" />
            <DefinitionsIcon v-else-if="n.how.kind === 'copy'" name="reference" class="mt-0.5 size-3.5 shrink-0 text-slate-400" />
            <span class="min-w-0 [overflow-wrap:anywhere]">{{ howWords(n) }}</span>
          </span>
          <span v-if="n.problem" class="mt-1 block text-xs text-red-700">{{ n.problem }}</span>
        </span>
        <DesignerIcon name="chevron" class="mt-1 size-4 shrink-0 text-slate-300 transition group-hover:text-slate-500" :class="{ 'text-accent-500': isSelected(n) }" />
      </button>
      </div>
      <!-- A built object's own properties, while it's open -->
      <div v-if="n.children.length && isOpen(n)" class="mb-2 border-l-2 pl-2" :class="[expanded !== null ? 'ml-[1.75rem]' : 'ml-[1.1rem]', n.type === 'reference' ? 'border-dashed border-slate-200' : 'border-slate-100']">
        <StudioOutputTree :nodes="n.children" :label="label" :selected="selected" :level="level + 1" :expanded="expanded" :open-all="openAll" @open="emit('open', $event)" @fold="emit('fold', $event)" />
      </div>
    </li>
  </ul>
</template>
