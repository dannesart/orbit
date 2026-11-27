<!--
  Development only: the exact Feature version each step pins, chosen here so the experiment can
  exercise every version (older ones, provisional Transform v3, the misbehaving Consoles). Kept
  apart from the inspectors, which only show the pinned version. Choosing one changes that step's
  pin and nothing else: no step ever changes version on its own, and no Mapping is touched.
  The product policy this stands in for is recorded with featureVersionWords (experiment.ts).
-->
<script setup lang="ts">
export interface VersionChoice {
  readonly step: string
  readonly name: string
  readonly groups: readonly { readonly label: string; readonly options: readonly { readonly key: string; readonly label: string }[] }[]
}
const props = defineProps<{ open: boolean; choices: readonly VersionChoice[]; pinned: Readonly<Record<string, string>> }>()
const emit = defineEmits<{ pin: [step: string, key: string]; close: [] }>()
const dialog = useTemplateRef<HTMLDialogElement>('dialog')
watch(() => props.open, (open) => (open ? dialog.value?.showModal() : dialog.value?.close()))
const control = 'mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-xs outline-none transition focus:border-accent-500 focus:ring-2 focus:ring-accent-100'
</script>

<template>
  <dialog
    ref="dialog"
    aria-labelledby="versions-title"
    data-feature-versions
    class="mx-auto mt-[12vh] w-[calc(100%-2rem)] max-w-md rounded-3xl border border-slate-200/80 bg-white p-0 text-left text-slate-800 shadow-xl shadow-slate-900/10 backdrop:bg-slate-900/20 backdrop:backdrop-blur-[2px] sm:my-auto"
    @cancel.prevent="emit('close')"
  >
    <div v-if="open" class="animate-rise p-6">
      <div class="flex items-center gap-2">
        <h2 id="versions-title" class="text-lg font-semibold tracking-tight text-slate-900">Feature versions</h2>
        <span class="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-amber-800 uppercase ring-1 ring-amber-200/70">Development only</span>
      </div>
      <p class="mt-2 text-sm text-pretty text-slate-600">Each step pins the exact version chosen here, and keeps it: nothing upgrades on its own.</p>
      <div class="mt-4 flex flex-col gap-4">
        <label v-for="c in choices" :key="c.step" class="block text-xs font-medium text-slate-600">
          {{ c.name }}
          <select :value="pinned[c.step]" :class="control" :data-feature-version="c.step" :data-transform-version="c.step === 'transform' || undefined" @change="emit('pin', c.step, ($event.target as HTMLSelectElement).value)">
            <optgroup v-for="g in c.groups" :key="g.label" :label="g.label">
              <option v-for="o in g.options" :key="o.key" :value="o.key">{{ o.label }}</option>
            </optgroup>
          </select>
        </label>
      </div>
      <div class="mt-6 flex justify-end">
        <button type="button" class="btn-primary w-auto rounded-full px-5 py-2 text-sm" data-versions-done @click="emit('close')">Done</button>
      </div>
    </div>
  </dialog>
</template>
