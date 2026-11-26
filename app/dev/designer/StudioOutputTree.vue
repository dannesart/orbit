<script setup lang="ts">
// Mapping Studio: the output contract, one level of it, with what the draft makes at each place.
// Every row reads the same way: a quiet state mark, the property, its type (a reference by its exact
// version) and whether it's optional; below, how it's made: a value from the input, an object built
// (and when), a whole value copied, or deliberately left out. The whole row opens the property in
// the editor (the top-level row opens it in place: the `editor` slot). States come from the review
// and the domain's located issues (studio.ts), never from here.
import type { DefinitionRef, PropertyPath } from '#shared/features/definitions'
import DefinitionsIcon from '../definitions/DefinitionsIcon.vue'
import DesignerIcon from './DesignerIcon.vue'
import StudioOutputTree from './StudioOutputTree.vue'
import type { OutputNode, OutputStatus } from './studio'

const props = withDefaults(defineProps<{ nodes: readonly OutputNode[]; label: (ref: DefinitionRef) => string; editing?: string | null; level?: number }>(), { editing: null, level: 1 })
const emit = defineEmits<{ open: [path: PropertyPath] }>()

const MARK: Record<OutputStatus, { mark: string; tone: string; words: string }> = {
  mapped: { mark: '✓', tone: 'text-accent-600', words: 'Mapped' },
  not_mapped: { mark: '○', tone: 'text-amber-600', words: 'Not mapped' },
  left_out: { mark: '–', tone: 'text-slate-400', words: 'Left out' },
  incomplete: { mark: '◐', tone: 'text-amber-600', words: 'Incomplete' },
  problem: { mark: '!', tone: 'text-red-600', words: 'Needs attention' },
  unsupported: { mark: '×', tone: 'text-slate-400', words: 'Not supported by this Transform version' },
}
const typeWords: Record<string, string> = { string: 'text', number: 'number', boolean: 'yes or no', object: 'object' }
const open = (n: OutputNode) => emit('open', n.path)
const isEditing = (n: OutputNode) => props.level === 1 && props.editing === n.name
const howWords = (n: OutputNode) => {
  if (n.status === 'unsupported') return 'This Transform version can’t make it'
  if (n.how.kind !== 'none') return n.how.words
  return n.optional ? 'Left out: the output won’t have it' : 'Not mapped yet'
}
</script>

<template>
  <ul class="flex flex-col" :class="level === 1 ? 'divide-y divide-slate-100' : ''" :data-output-level="level">
    <li v-for="n in nodes" :key="n.name" :data-output-node="n.path.join(' › ')" :data-status="n.status">
      <button
        type="button"
        class="group flex w-full items-start gap-2.5 rounded-xl px-2 py-2.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-inset"
        :class="isEditing(n) ? 'bg-accent-50/70' : 'hover:bg-slate-50'"
        :aria-expanded="level === 1 ? isEditing(n) : undefined"
        :aria-label="`${n.path.join(' › ')}, ${MARK[n.status].words}: ${howWords(n)}.${n.problem ? ` ${n.problem}` : ''} ${level === 1 && isEditing(n) ? 'Close the editor' : 'Edit'}`"
        @click="open(n)"
      >
        <span aria-hidden="true" class="mt-0.5 w-3 shrink-0 text-center text-xs font-semibold" :class="MARK[n.status].tone">{{ MARK[n.status].mark }}</span>
        <span class="min-w-0 flex-1">
          <span class="flex min-w-0 items-center gap-2">
            <span class="truncate font-mono text-sm font-semibold text-slate-900">{{ n.name }}</span>
            <span v-if="n.type === 'reference'" class="flex min-w-0 items-center gap-1 truncate text-xs text-slate-500">
              <DefinitionsIcon name="reference" class="size-3 shrink-0 text-accent-500" />{{ label(n.definition!) }}
            </span>
            <span v-else class="text-xs text-slate-400">{{ typeWords[n.type] }}</span>
            <span v-if="n.optional" class="ml-auto shrink-0 rounded-full bg-slate-100 px-1.5 py-px text-[10px] font-medium text-slate-500">Optional</span>
          </span>
          <span class="mt-1 flex min-w-0 items-center gap-1.5 text-sm" :class="n.status === 'not_mapped' ? 'text-amber-700' : n.how.kind === 'none' ? 'text-slate-500' : 'text-slate-700'" data-how>
            <span v-if="n.how.kind === 'value'" aria-hidden="true" class="text-slate-400">←</span>
            <DefinitionsIcon v-else-if="n.how.kind === 'build'" name="object" class="size-3.5 shrink-0 text-slate-400" />
            <DefinitionsIcon v-else-if="n.how.kind === 'copy'" name="reference" class="size-3.5 shrink-0 text-slate-400" />
            <span class="min-w-0 truncate">{{ howWords(n) }}</span>
          </span>
          <span v-if="n.problem" class="mt-1 block text-xs text-red-700">{{ n.problem }}</span>
        </span>
        <DesignerIcon name="chevron" class="mt-1 size-4 shrink-0 text-slate-300 transition group-hover:text-slate-500" :class="{ 'rotate-90': isEditing(n) }" />
      </button>
      <!-- Editing this property, in place -->
      <div v-if="isEditing(n)" class="px-2 pt-1 pb-4">
        <slot name="editor" :node="n" />
      </div>
      <!-- A built object's own properties -->
      <div v-else-if="n.children.length" class="mb-2 ml-[1.1rem] border-l-2 pl-2" :class="n.type === 'reference' ? 'border-dashed border-slate-200' : 'border-slate-100'">
        <StudioOutputTree :nodes="n.children" :label="label" :level="level + 1" @open="emit('open', $event)" />
      </div>
    </li>
  </ul>
</template>
