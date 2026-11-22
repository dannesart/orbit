<script setup lang="ts">
// Trying an example: fill in some information and see whether Orbit would accept it as this
// Definition, using Orbit's own validation. Nothing typed here is kept, not even in this tab.
import type { Field } from '#shared/features/definitions'
import { type Example, type ExampleValue, checkExample, exampleData, issueWords } from './model'

const props = defineProps<{ fields: readonly Field[]; name: string; idPrefix: string }>()

// Values are kept by property name, so renaming a property starts its example afresh.
const values = ref<Record<string, ExampleValue>>({})
const extra = ref<{ name: string; text: string } | null>(null)
const usable = computed(() => props.fields.filter((f) => f.name))
const example = computed<Example>(() => ({ values: values.value, extra: extra.value }))
const data = computed(() => exampleData(usable.value, example.value))
const issues = computed(() => checkExample(usable.value, data.value))
const touched = computed(() => Object.values(values.value).some((v) => v.kind !== 'empty') || !!extra.value?.name.trim())

const set = (name: string, value: ExampleValue) => (values.value = { ...values.value, [name]: value })
const textOf = (name: string) => {
  const v = values.value[name]
  return v?.kind === 'text' ? v.text : ''
}
const choiceOf = (name: string) => values.value[name]?.kind ?? 'empty'
const control = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-accent-500 focus:ring-2 focus:ring-accent-100'
</script>

<template>
  <div>
    <p v-if="!usable.length" class="text-sm text-slate-500">Name a property to try an example.</p>
    <template v-else>
      <div class="grid gap-3 sm:grid-cols-2">
        <div v-for="f in usable" :key="f.name">
          <label :for="`${idPrefix}-ex-${f.name}`" class="block text-xs font-medium text-slate-600">{{ f.name }}</label>
          <select
            v-if="f.type === 'boolean'"
            :id="`${idPrefix}-ex-${f.name}`"
            :value="choiceOf(f.name)"
            :class="[control, 'mt-1']"
            @change="set(f.name, { kind: ($event.target as HTMLSelectElement).value as 'empty' | 'yes' | 'no' })"
          >
            <option value="empty">Leave out</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
          <input
            v-else
            :id="`${idPrefix}-ex-${f.name}`"
            :value="textOf(f.name)"
            type="text"
            autocomplete="off"
            :inputmode="f.type === 'number' ? 'decimal' : 'text'"
            :placeholder="f.type === 'number' ? 'A number' : 'Some text'"
            :class="[control, 'mt-1']"
            @input="set(f.name, ($event.target as HTMLInputElement).value === '' ? { kind: 'empty' } : { kind: 'text', text: ($event.target as HTMLInputElement).value })"
          >
        </div>
      </div>

      <div v-if="extra" class="mt-3 flex flex-wrap items-end gap-2 rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200/70">
        <label class="flex min-w-0 flex-1 flex-col gap-1 text-xs font-medium text-slate-600">
          Something else
          <input v-model="extra.name" type="text" autocomplete="off" placeholder="e.g. Nickname" :class="control">
        </label>
        <label class="flex min-w-0 flex-1 flex-col gap-1 text-xs font-medium text-slate-600">
          Its value
          <input v-model="extra.text" type="text" autocomplete="off" :class="control">
        </label>
        <button type="button" class="link pb-2 text-sm" @click="extra = null">Remove</button>
      </div>
      <button v-else type="button" class="link mt-3 text-sm" @click="extra = { name: '', text: '' }">Add something that isn’t a property</button>

      <div class="mt-4" aria-live="polite">
        <p v-if="!touched" class="text-sm text-slate-500">
          Fill in an example to see whether it would count as {{ name || 'this' }}. An empty box is left out.
        </p>
        <p v-else-if="!issues.length" class="flex items-center gap-2 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800 ring-1 ring-emerald-200">
          <span aria-hidden="true">✓</span> This would be accepted as {{ name || 'this' }}.
        </p>
        <div v-else class="rounded-2xl bg-red-50 px-4 py-3 ring-1 ring-red-200">
          <p class="text-sm font-medium text-red-800">This wouldn’t be accepted as {{ name || 'this' }}:</p>
          <ul class="mt-1 list-disc pl-5 text-sm text-red-700">
            <li v-for="(issue, i) in issues" :key="i">{{ issueWords(issue) }}</li>
          </ul>
        </div>
      </div>
    </template>
  </div>
</template>
