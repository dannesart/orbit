<script setup lang="ts">
// What happened, and what exists: the last run's evidence, earlier runs (each naming the exact
// versions it used) and every frozen version. Read-only.
import type { DefinitionRef } from '#shared/features/definitions'
import { type Step, outcomeLabel, shapeOf } from '../features/experiment'
import RunResult from './RunResult.vue'
import { type Configuration, type RunRecord, labelOf } from './config'
import { pathWords } from './flow'
import { describeProperty } from './summary'

const props = defineProps<{ step: Step; stale: boolean; runNumber: number; runs: readonly RunRecord[]; config: Configuration }>()
const label = (ref: DefinitionRef) => labelOf(props.config, ref)
const mappingIds = computed(() => [...new Set(props.config.mappings.map((m) => m.id))])
</script>

<template>
  <div>
    <section aria-labelledby="transform-run-heading">
      <h3 id="transform-run-heading" class="text-sm font-semibold text-slate-900">What happened in run {{ runNumber }}</h3>
      <p v-if="runs.length" class="text-xs text-slate-500">{{ pathWords(runs.at(-1)!.path) }}</p>
      <RunResult :step="step" :stale="stale" :label="label" />
    </section>
    <section v-if="runs.length > 1" aria-labelledby="runs-heading" class="mt-6">
      <h3 id="runs-heading" class="text-sm font-semibold text-slate-900">Earlier runs</h3>
      <p class="mt-0.5 text-xs text-slate-500">Each names the exact versions it used. Later changes don’t rewrite them.</p>
      <ol class="mt-2 flex flex-col gap-1 text-sm text-slate-700">
        <li v-for="r in [...runs].reverse().slice(1)" :key="r.number">
          Run {{ r.number }} · {{ r.outcome ? outcomeLabel(r.outcome) : 'Transform not invoked' }}<template v-if="r.output"> · {{ label(r.output) }}</template><template v-if="r.mapping"> · Mapping v{{ r.mapping.version }}</template><template v-if="r.feature"> · Transform v{{ r.feature.version }}</template>
          <span class="block text-xs text-slate-500">{{ pathWords(r.path) }}</span>
        </li>
      </ol>
    </section>
    <section aria-labelledby="versions-heading" class="mt-6">
      <h3 id="versions-heading" class="text-sm font-semibold text-slate-900">Versions</h3>
      <p class="mt-0.5 text-xs text-slate-500">Frozen when applied. Nothing here changes afterwards.</p>
      <div v-if="config.locals.length" class="mt-3">
        <p class="text-xs font-medium text-slate-500">This Transform’s own output</p>
        <ul class="mt-1 flex flex-col gap-1 text-sm text-slate-700">
          <li v-for="d in config.locals" :key="d.version"><span class="font-medium">{{ d.name }} · v{{ d.version }}</span> <span class="font-mono text-xs text-slate-500">{{ shapeOf(d) }}</span></li>
        </ul>
      </div>
      <div v-for="id in mappingIds" :key="id" class="mt-3">
        <p class="text-xs font-medium text-slate-500">Mapping for {{ label(config.mappings.find((m) => m.id === id)!.to) }}</p>
        <ul class="mt-1 flex flex-col gap-1.5 text-sm text-slate-700">
          <li v-for="m in config.mappings.filter((x) => x.id === id)" :key="m.version">
            <span class="font-medium">v{{ m.version }}</span>
            <span v-if="m.id === config.mapping.id && m.version === config.mapping.version" class="ml-1 rounded-full bg-accent-50 px-1.5 text-xs font-medium text-accent-800 ring-1 ring-accent-200">applied</span>
            <span class="block text-xs text-slate-500">{{ m.properties.map(describeProperty).join(' · ') || 'Makes nothing' }}</span>
          </li>
        </ul>
      </div>
    </section>
  </div>
</template>
