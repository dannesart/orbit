<script setup lang="ts">
// Mapping Studio (Phase 4.5B): the selected output place, in a focused floating inspector beside the
// trees, so the input and the output stay where they are while it's edited. The Output tree is for
// finding a place; this is for editing exactly that one, at any depth: the objects it's inside as a
// quiet breadcrumb (each selects that object), its own name as the title, then its editor
// (PropertyEditor), whose object properties are rows that select them in turn. The same width at
// any depth: nothing is indented for the objects around it. The draft is the Designer's, so opening,
// closing or moving between places never changes it. Where it floats is the Studio's choice.
import type { DefinitionRef, DefinitionVersion, PropertyPath } from '#shared/features/definitions'
import DefinitionsIcon from '../definitions/DefinitionsIcon.vue'
import DesignerIcon from './DesignerIcon.vue'
import NameText from './NameText.vue'
import PropertyEditor from './PropertyEditor.vue'
import type { TransformDraft } from './config'
import type { DraftReview, Example, FieldReview } from './preview'
import type { OutputNode } from './studio'

const props = defineProps<{
  /** The selected place, as the output tree has it. */
  node: OutputNode
  /** The top-level property it's in, as the review has it. */
  field: FieldReview
  draft: TransformDraft
  review: DraftReview
  input: DefinitionVersion
  example: Example
  output: DefinitionVersion
  label: (ref: DefinitionRef) => string
}>()
const emit = defineEmits<{ 'update:draft': [TransformDraft]; close: []; select: [path: PropertyPath] }>()
const typeWords: Record<string, string> = { string: 'Text', number: 'Number', boolean: 'Yes or no', object: 'Object' }
/** The objects the place is inside, outermost first, each by its own path. */
const crumbs = computed(() => props.node.path.slice(0, -1).map((name, i) => ({ name, path: props.node.path.slice(0, i + 1) })))
const where = computed(() => props.node.path.join(' › '))
</script>

<template>
  <aside id="studio-inspector" :aria-label="`${where}: how it’s made`" class="flex min-w-0 flex-col overflow-hidden bg-white" data-studio-inspector @keydown.escape.stop="emit('close')">
    <header class="flex items-start gap-3 border-b border-slate-100 px-5 py-4">
      <div class="min-w-0 flex-1">
        <!-- Where it is: the objects it's inside, each one selectable -->
        <nav v-if="crumbs.length" aria-label="Where it is" class="mb-1">
          <ol class="flex flex-wrap items-center gap-x-1 gap-y-0.5 text-xs text-slate-500" data-inspector-breadcrumb>
            <li v-for="c in crumbs" :key="c.path.join(' › ')" class="flex min-w-0 items-center gap-1">
              <button type="button" class="max-w-full rounded font-mono [overflow-wrap:anywhere] text-left hover:text-slate-900 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500" :aria-label="`Go to ${c.path.join(' › ')}`" :data-crumb="c.path.join(' › ')" @click="emit('select', c.path)"><NameText :name="c.name" /></button>
              <span aria-hidden="true" class="text-slate-300">›</span>
            </li>
          </ol>
        </nav>
        <h2 class="font-mono text-base font-semibold [overflow-wrap:anywhere] text-slate-900" data-inspector-title><NameText :name="node.name" /></h2>
        <p class="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
          <span v-if="node.type === 'reference'" class="flex items-center gap-1"><DefinitionsIcon name="reference" class="size-3 text-accent-500" />{{ label(node.definition!) }}</span>
          <span v-else>{{ typeWords[node.type] }}</span>
          <span>{{ node.optional ? 'Optional' : 'Required' }}</span>
        </p>
      </div>
      <button type="button" class="grid size-8 shrink-0 place-items-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500" aria-label="Close" data-inspector-close @click="emit('close')">
        <DesignerIcon name="close" class="size-4" />
      </button>
    </header>
    <div class="min-h-0 min-w-0 flex-1 overflow-y-auto px-5 py-4" data-inspector-body>
      <p v-if="field.state === 'unsupported'" class="text-sm text-slate-600" data-unsupported-property>This Transform version can’t make {{ field.name }}.</p>
      <PropertyEditor v-else :key="where" :output="output" :draft="draft" :field="field" :review="review" :input="input" :example="example" :path="node.path" :node="node" @update:draft="emit('update:draft', $event)" @select="emit('select', $event)" />
    </div>
    <footer class="flex justify-end border-t border-slate-100 px-5 py-3">
      <button type="button" class="rounded-full px-4 py-1.5 text-sm font-medium text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500" data-editor-done @click="emit('close')">Done</button>
    </footer>
  </aside>
</template>
