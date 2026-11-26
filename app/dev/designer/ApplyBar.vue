<script setup lang="ts">
// Committing the draft: exactly which versions Apply would create (or that it would create
// none), with Undo and Discard beside it. Shared by the inspector and the focused editor, so the
// version boundary always reads the same.
import type { DefinitionRef } from '#shared/features/definitions'
import DesignerIcon from './DesignerIcon.vue'
import { type Configuration, type Plan, type TransformDraft, labelOf } from './config'

const props = defineProps<{ plan: Plan; config: Configuration; draft: TransformDraft; errors: readonly string[]; missing: readonly string[]; canUndo: boolean; unsupported?: string | null }>()
const emit = defineEmits<{ apply: []; discard: []; undo: [] }>()

const label = (ref: DefinitionRef) => labelOf(props.config, ref)
// Incomplete isn't wrong: a property nothing makes yet is the next thing to do, not an error.
const blocked = computed(() => props.errors.length + props.missing.length > 0)
const next = computed(() => {
  const [first, ...rest] = props.missing
  return rest.length ? `Next: choose a value for ${first} (${rest.length} more after it).` : `Next: choose a value for ${first}.`
})
const words = computed(() => {
  const { output, mapping, changes } = props.plan
  // Applied means "what runs use now", in this session; the designer saves nothing.
  if (!changes) return `Applied in this session: ${label(props.config.output)} · Mapping v${props.config.mapping.version}.`
  const made: string[] = []
  if (output.isNew) made.push(`${props.draft.local.name || 'the output'} v${output.ref.version}`)
  if (mapping.isNew) made.push(`${output.isNew ? 'its' : 'a new'} Mapping v${mapping.version}`)
  if (made.length) return `Apply creates ${made.join(' and ')}. Runs still use ${label(props.config.output)} · Mapping v${props.config.mapping.version}.`
  return `Apply switches to ${output.label} and its existing Mapping v${mapping.version}. Nothing new is created.`
})
</script>

<template>
  <div>
    <div class="flex flex-wrap items-center justify-end gap-x-2 gap-y-1.5">
      <!-- What Apply would do, only when there's something to apply (unchanged: said to screen readers only) -->
      <p class="mr-auto basis-full text-xs sm:basis-auto sm:max-w-[60%]" :class="plan.changes && !unsupported ? 'font-medium text-amber-800' : 'sr-only'" aria-live="polite">{{ words }}</p>
      <button
        type="button"
        class="grid size-9 shrink-0 place-items-center rounded-xl text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 disabled:opacity-40 disabled:hover:bg-transparent"
        aria-label="Undo"
        title="Undo"
        :disabled="!canUndo"
        @click="emit('undo')"
      >
        <DesignerIcon name="undo" class="size-4" />
      </button>
      <button type="button" class="rounded-full px-3.5 py-1.5 text-sm font-medium text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 disabled:opacity-40 disabled:hover:bg-transparent" :disabled="!plan.changes" @click="emit('discard')">Discard</button>
      <button type="button" class="btn-primary w-auto rounded-full px-5 py-1.5 text-sm disabled:cursor-default disabled:opacity-40" :disabled="!plan.changes || blocked" @click="emit('apply')">Apply</button>
    </div>
    <p v-if="plan.changes && blocked" class="mt-2 text-xs text-slate-600">
      <!-- Not something to fix here: the Transform version can't take these contracts (said above). -->
      <span v-if="unsupported" class="text-slate-600" data-apply-unsupported>Apply isn’t available: this Transform version doesn’t support these contracts.</span>
      <span v-else-if="errors.length" class="text-red-700">{{ errors.length === 1 ? 'One thing' : `${errors.length} things` }} to fix before applying: {{ errors[0] }}<template v-if="missing.length"> {{ missing.length === 1 ? 'One property still needs' : `${missing.length} properties still need` }} a value.</template></span>
      <span v-else>{{ next }} Apply is available once every property has one.</span>    </p>
  </div>
</template>
