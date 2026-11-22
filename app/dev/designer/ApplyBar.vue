<script setup lang="ts">
// Committing the draft: exactly which versions Apply would create (or that it would create
// none), with Undo and Discard beside it. Shared by the inspector and the focused editor, so the
// version boundary always reads the same.
import type { DefinitionRef } from '#shared/features/definitions'
import { type Configuration, type Plan, type TransformDraft, labelOf } from './config'

const props = defineProps<{ plan: Plan; config: Configuration; draft: TransformDraft; problems: readonly string[]; mappingProblemsOnly: boolean; canUndo: boolean }>()
const emit = defineEmits<{ apply: [anyway: boolean]; discard: []; undo: [] }>()

const label = (ref: DefinitionRef) => labelOf(props.config, ref)
const words = computed(() => {
  const { output, mapping, changes } = props.plan
  if (!changes) return `Applied: ${label(props.config.output)} · Mapping v${props.config.mapping.version}.`
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
      <p class="mr-auto basis-full text-xs sm:basis-auto sm:max-w-[60%]" :class="plan.changes ? 'font-medium text-amber-800' : 'text-slate-500'" aria-live="polite">{{ words }}</p>
      <button type="button" class="link px-1 text-sm" :disabled="!canUndo" @click="emit('undo')">Undo</button>
      <button type="button" class="rounded-full px-3.5 py-1.5 text-sm font-medium text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 disabled:opacity-40 disabled:hover:bg-transparent" :disabled="!plan.changes" @click="emit('discard')">Discard</button>
      <button type="button" class="btn-primary w-auto rounded-full px-5 py-1.5 text-sm disabled:cursor-default disabled:opacity-40" :disabled="!plan.changes || problems.length > 0" @click="emit('apply', false)">Apply</button>
    </div>
    <p v-if="plan.changes && problems.length" class="mt-2 text-xs text-slate-600">
      <span class="text-red-700">{{ problems.length === 1 ? 'One thing' : `${problems.length} things` }} to fix before applying: {{ problems[0] }}</span>
      <button v-if="mappingProblemsOnly" type="button" class="link ml-1 text-xs" @click="emit('apply', true)">Apply anyway (playground only: to see the boundary stop it)</button>
    </p>
  </div>
</template>
