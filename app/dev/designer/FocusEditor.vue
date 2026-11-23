<script setup lang="ts">
// The focused editor: the inspector, grown, for deeper work on the selected Transform. Two
// intentions, kept apart:
//   Mapping    how each value is made (composition, nested groups, the advanced editor)
//   Structure  what information the output contains (a contract: new versions when applied)
// The same draft, preview and Apply as the inspector, so nothing changes by moving between them.
import type { DefinitionVersion } from '#shared/features/definitions'
import ApplyBar from './ApplyBar.vue'
import PreviewObject from './PreviewObject.vue'
import PropertyEditor from './PropertyEditor.vue'
import StructureEditor from './StructureEditor.vue'
import type { Configuration, Plan, TransformDraft } from './config'
import type { DraftReview, Example, OutputPreview } from './preview'

const props = defineProps<{
  draft: TransformDraft
  config: Configuration
  target: { definition: DefinitionVersion; label: string; isNew: boolean }
  plan: Plan
  structure: readonly string[]
  review: DraftReview
  output: OutputPreview
  example: Example
  input: DefinitionVersion
  canUndo: boolean
  mode: 'mapping' | 'structure'
  property: string | null
}>()
const emit = defineEmits<{
  'update:draft': [TransformDraft]
  'update:mode': ['mapping' | 'structure']
  'update:property': [string]
  apply: [anyway: boolean]
  discard: []
  undo: []
  close: []
}>()

const problems = computed(() => [...props.structure, ...props.review.problems])
const selected = computed(() => props.review.fields.find((f) => f.name === props.property) ?? props.review.fields.find((f) => f.state !== 'set') ?? props.review.fields[0] ?? null)
const heading = ref<HTMLElement>()
onMounted(() => heading.value?.focus())
const typeWords = { string: 'text', number: 'number', boolean: 'true or false' } as const
const status = {
  not_set: { icon: '○', label: 'Not mapped', tone: 'text-amber-600' },
  problem: { icon: '!', label: 'Needs attention', tone: 'text-red-600' },
  set: { icon: '✓', label: 'Mapped', tone: 'text-accent-600' },
}
const tab = 'rounded-full px-4 py-1.5 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500'
</script>

<template>
  <div class="flex h-full min-h-0 flex-col" @keydown.escape.stop="emit('close')">
    <!-- Which Feature, which intention -->
    <div class="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-slate-100 px-5 py-3.5 sm:px-6">
      <span class="flex h-7 min-w-7 items-center justify-center rounded-full bg-accent-600 px-2 text-xs font-semibold text-white" aria-hidden="true">2</span>
      <div class="mr-auto min-w-0">
        <h2 ref="heading" tabindex="-1" class="text-base font-semibold text-slate-900 outline-none">Transform</h2>
        <p class="text-xs text-slate-500">Editing · {{ target.label }}</p>
      </div>
      <div class="order-last flex w-full rounded-full bg-slate-100 p-1 sm:order-none sm:w-auto" role="tablist" aria-label="What you’re editing">
        <button type="button" role="tab" :aria-selected="mode === 'mapping'" :class="[tab, 'flex-1 sm:flex-none', mode === 'mapping' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900']" @click="emit('update:mode', 'mapping')">
          Mapping<span class="hidden font-normal text-slate-500 lg:inline"> · how values are made</span>
        </button>
        <button type="button" role="tab" :aria-selected="mode === 'structure'" :class="[tab, 'flex-1 sm:flex-none', mode === 'structure' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900']" @click="emit('update:mode', 'structure')">
          Structure<span class="hidden font-normal text-slate-500 lg:inline"> · what it contains</span>
        </button>
      </div>
      <button type="button" class="rounded-full px-4 py-1.5 text-sm font-medium text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500" @click="emit('close')">Done</button>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
      <!-- Mapping: one property at a time, with room -->
      <div v-if="mode === 'mapping'" class="grid gap-5 lg:grid-cols-[14rem_minmax(0,1fr)]">
        <nav aria-label="Output properties" class="hidden lg:block">
          <ul class="flex flex-col gap-1">
            <li v-for="f in review.fields" :key="f.name">
              <button
                type="button"
                class="flex w-full items-center gap-2 rounded-2xl px-3 py-2 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
                :class="selected?.name === f.name ? 'bg-accent-50 ring-1 ring-accent-200' : 'hover:bg-slate-50'"
                :aria-current="selected?.name === f.name ? 'true' : undefined"
                @click="emit('update:property', f.name)"
              >
                <span aria-hidden="true" class="w-3 text-center text-xs font-semibold" :class="status[f.state].tone">{{ status[f.state].icon }}</span>
                <span class="min-w-0 flex-1">
                  <span class="block truncate font-mono text-sm font-semibold text-slate-900">{{ f.name || '(no name)' }}</span>
                  <span class="block text-xs text-slate-500">{{ typeWords[f.expected] }} · {{ status[f.state].label }}</span>
                </span>
              </button>
            </li>
          </ul>
          <button type="button" class="link mt-3 px-3 text-xs" @click="emit('update:mode', 'structure')">Add or change properties in Structure</button>
        </nav>
        <label class="flex flex-col gap-1 text-xs font-medium text-slate-600 lg:hidden">
          Property
          <select :value="selected?.name" class="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-base text-slate-900" @change="emit('update:property', ($event.target as HTMLSelectElement).value)">
            <option v-for="f in review.fields" :key="f.name" :value="f.name">{{ f.name || '(no name)' }} · {{ status[f.state].label }}</option>
          </select>
        </label>

        <div class="flex min-w-0 flex-col gap-5">
          <section v-if="selected && selected.name" class="rounded-3xl bg-white p-5 ring-1 ring-slate-200/80" :aria-label="`${selected.name}: where its value comes from`">
            <div class="mb-4 flex items-baseline gap-2">
              <h3 class="font-mono text-base font-semibold text-slate-900">{{ selected.name }}</h3>
              <span class="text-xs text-slate-500">{{ typeWords[selected.expected] }}</span>
            </div>
            <PropertyEditor :draft="draft" :field="selected" :review="review" :input="input" :example="example" @update:draft="emit('update:draft', $event)" />
          </section>
          <p v-else-if="selected" class="text-sm text-slate-500">This property has no name yet. Name it in Structure first.</p>
          <p v-else class="text-sm text-slate-500">The output has no properties yet. Add some in Structure.</p>
          <PreviewObject :draft="draft" :target="target" :review="review" :output="output" :example="example" :problems="problems.length" />
        </div>
      </div>

      <!-- Structure: the contract -->
      <div v-else class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <StructureEditor :draft="draft" :config="config" :target="target" :structure="structure" :review="review" @update:draft="emit('update:draft', $event)" />
        <PreviewObject class="lg:sticky lg:top-0 lg:self-start" :draft="draft" :target="target" :review="review" :output="output" :example="example" :problems="problems.length" />
      </div>
    </div>

    <div class="border-t border-slate-100 px-5 pt-3 pb-4 sm:px-6">
      <ApplyBar :plan="plan" :config="config" :draft="draft" :errors="[...structure, ...review.errors]" :missing="review.missing" :mapping-problems-only="!structure.length && review.problems.length > 0" :can-undo="canUndo" @apply="emit('apply', $event)" @discard="emit('discard')" @undo="emit('undo')" />
    </div>
  </div>
</template>
