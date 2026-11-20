<script setup lang="ts">
// Where one value comes from, chosen rather than typed: a property of the input, a literal, or a
// function wrapped around other sources. Recursive, and it edits the closed expression tree
// directly (always emitting a new tree), so there is never text to parse.
import type { Field } from '#shared/features/definitions'
import type { Argument, Expression } from '#shared/features/mappings'

const props = defineProps<{ modelValue: Expression; fields: readonly Field[]; label: string }>()
const emit = defineEmits<{ 'update:modelValue': [Expression] }>()

type Choice = 'property' | 'string' | 'number' | 'boolean' | 'trim' | 'join'
const CHOICES: { value: Choice; label: string }[] = [
  { value: 'property', label: 'Input property' },
  { value: 'string', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'boolean', label: 'True or false' },
  { value: 'trim', label: 'trim(…)' },
  { value: 'join', label: 'join(…)' },
]

const choice = computed<Choice | null>(() => {
  const e = props.modelValue
  if (e.kind === 'property') return 'property'
  if (e.kind === 'literal') return typeof e.value as 'string' | 'number' | 'boolean'
  return e.fn === 'trim' || e.fn === 'join' ? e.fn : null
})

/** Choosing a function wraps what was there; choosing anything else starts fresh. */
function choose(next: Choice) {
  const current = props.modelValue
  const first: Expression = { kind: 'property', name: props.fields[0]?.name ?? '' }
  const fresh: Record<Choice, () => Expression> = {
    property: () => first,
    string: () => ({ kind: 'literal', value: '' }),
    number: () => ({ kind: 'literal', value: 0 }),
    boolean: () => ({ kind: 'literal', value: true }),
    trim: () => ({ kind: 'call', fn: 'trim', args: [current] }),
    join: () => ({ kind: 'call', fn: 'join', args: [{ kind: 'list', items: [current] }, { kind: 'literal', value: ' ' }] }),
  }
  emit('update:modelValue', fresh[next]())
}

const call = computed(() => (props.modelValue.kind === 'call' ? props.modelValue : null))
const setArg = (i: number, arg: Argument) =>
  call.value && emit('update:modelValue', { ...call.value, args: call.value.args.map((a, j) => (j === i ? arg : a)) })

// join's two arguments, as the editor shows them: the values, and a text separator.
const items = computed(() => {
  const list = call.value?.args[0]
  return list?.kind === 'list' ? list.items : []
})
const separator = computed(() => {
  const s = call.value?.args[1]
  return s?.kind === 'literal' ? String(s.value) : ''
})
const setItems = (next: readonly Expression[]) => setArg(0, { kind: 'list', items: next })
const setItem = (i: number, e: Expression) => setItems(items.value.map((x, j) => (j === i ? e : x)))
const addItem = () => setItems([...items.value, { kind: 'literal', value: '' }])
const removeItem = (i: number) => setItems(items.value.filter((_, j) => j !== i))

const literal = (value: string | number | boolean) => emit('update:modelValue', { kind: 'literal', value })
/** Whitespace is invisible in a text box: say what's there when it's only spaces. */
const blank = (text: string) => (text && !text.trim() ? (text === ' ' ? 'a space' : `${text.length} whitespace characters`) : '')
const control = 'rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-900 shadow-xs outline-none transition focus:border-accent-500 focus:ring-2 focus:ring-accent-100'
</script>

<template>
  <div class="flex flex-col gap-2">
    <div class="flex flex-wrap items-center gap-2">
      <select :value="choice ?? ''" :aria-label="`${label}: comes from`" :class="control" @change="choose(($event.target as HTMLSelectElement).value as Choice)">
        <option v-if="!choice" value="" disabled>Unknown</option>
        <option v-for="c in CHOICES" :key="c.value" :value="c.value">{{ c.label }}</option>
      </select>

      <select
        v-if="modelValue.kind === 'property'"
        :value="modelValue.name"
        :aria-label="`${label}: input property`"
        :class="control"
        @change="emit('update:modelValue', { kind: 'property', name: ($event.target as HTMLSelectElement).value })"
      >
        <option v-for="f in fields" :key="f.name" :value="f.name">{{ f.name }} ({{ f.type }})</option>
      </select>
      <input
        v-else-if="choice === 'string' && modelValue.kind === 'literal'"
        :value="modelValue.value"
        type="text"
        autocomplete="off"
        spellcheck="false"
        placeholder="Empty text"
        :aria-label="`${label}: text`"
        :class="[control, 'w-44 font-mono']"
        @input="literal(($event.target as HTMLInputElement).value)"
      >
      <span v-if="choice === 'string' && modelValue.kind === 'literal' && blank(String(modelValue.value))" class="text-xs text-slate-500">{{ blank(String(modelValue.value)) }}</span>
      <input
        v-else-if="choice === 'number' && modelValue.kind === 'literal'"
        :value="modelValue.value"
        type="number"
        :aria-label="`${label}: number`"
        :class="[control, 'w-32 font-mono']"
        @input="literal(($event.target as HTMLInputElement).valueAsNumber)"
      >
      <select
        v-else-if="choice === 'boolean' && modelValue.kind === 'literal'"
        :value="String(modelValue.value)"
        :aria-label="`${label}: true or false`"
        :class="control"
        @change="literal(($event.target as HTMLSelectElement).value === 'true')"
      >
        <option value="true">true</option>
        <option value="false">false</option>
      </select>
    </div>

    <div v-if="choice === 'trim' && call" class="ml-2 border-l-2 border-slate-200 pl-3">
      <SourceEditor :model-value="call.args[0] as Expression" :fields="fields" :label="`${label}, trim`" @update:model-value="setArg(0, $event)" />
    </div>

    <div v-if="choice === 'join' && call" class="ml-2 flex flex-col gap-2 border-l-2 border-slate-200 pl-3">
      <p class="text-xs font-medium text-slate-500">Values, in order</p>
      <div v-for="(item, i) in items" :key="i" class="flex items-start gap-2">
        <SourceEditor class="min-w-0 flex-1" :model-value="item" :fields="fields" :label="`${label}, join value ${i + 1}`" @update:model-value="setItem(i, $event)" />
        <button type="button" class="link mt-1.5 text-sm" :aria-label="`Remove join value ${i + 1}`" @click="removeItem(i)">Remove</button>
      </div>
      <button type="button" class="link self-start text-sm" @click="addItem">Add a value</button>
      <label class="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-500">
        Separator
        <input
          :value="separator"
          type="text"
          autocomplete="off"
          spellcheck="false"
          placeholder="None"
          :class="[control, 'w-24 font-mono']"
          @input="setArg(1, { kind: 'literal', value: ($event.target as HTMLInputElement).value })"
        >
        <span v-if="blank(separator)" class="font-normal">{{ blank(separator) }}</span>
      </label>
    </div>
  </div>
</template>
