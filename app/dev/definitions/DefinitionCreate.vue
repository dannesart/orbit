<script setup lang="ts">
// Making a new Definition: what it is, what it contains, an example to try, and then one deliberate
// action that creates version 1. The draft stays in this tab while you go elsewhere in Orbit.
import { type NewDefinition, draftProblems, fieldsOf, nameNotes, nameProblem, typeWords } from './model'
import { createFromDraft, setCreating, shelfOf, startCreating } from './store'
import PropertiesEditor from './PropertiesEditor.vue'
import ExampleCheck from './ExampleCheck.vue'

const props = defineProps<{ workspace: { id: string; name: string } }>()
const emit = defineEmits<{ created: [id: string]; cancel: [] }>()

const creating = ref<NewDefinition>(startCreating(props.workspace.id))
watch(creating, (next) => setCreating(props.workspace.id, next))
const update = (change: Partial<NewDefinition>) => (creating.value = { ...creating.value, ...change })

const fields = computed(() => fieldsOf(creating.value.draft))
const problems = computed(() => [nameProblem(creating.value.name), ...draftProblems(creating.value.draft)].filter((p): p is string => !!p))
const notes = computed(() => nameNotes(creating.value.name, shelfOf(props.workspace.id).made.map((d) => d.name), props.workspace.name))
const name = computed(() => creating.value.name.trim())
const tried = ref(false)

function create() {
  tried.value = true
  if (problems.value.length) return
  emit('created', createFromDraft(props.workspace.id))
}
function cancel() {
  setCreating(props.workspace.id, null)
  emit('cancel')
}
const step = 'flex size-6 shrink-0 items-center justify-center rounded-full bg-accent-100 text-xs font-semibold text-accent-700'
</script>

<template>
  <section class="animate-rise rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm sm:p-8" aria-labelledby="new-heading">
    <p class="text-xs font-semibold tracking-wide text-accent-700 uppercase">New Definition · {{ workspace.name }}</p>
    <h1 id="new-heading" class="mt-2 text-2xl font-semibold tracking-tight text-slate-900">{{ name || 'A new kind of information' }}</h1>

    <section class="mt-8" aria-labelledby="what-heading">
      <h2 id="what-heading" class="flex items-center gap-2.5 text-sm font-semibold text-slate-900"><span :class="step" aria-hidden="true">1</span>What is it?</h2>
      <label for="new-name" class="mt-4 block text-sm font-medium text-slate-700">Name</label>
      <input id="new-name" :value="creating.name" type="text" maxlength="64" autocomplete="off" placeholder="e.g. Person" class="field" :aria-invalid="tried && !!nameProblem(creating.name)" @input="update({ name: ($event.target as HTMLInputElement).value })">
      <ul v-if="notes.length" class="mt-2 flex flex-col gap-1 text-sm text-amber-800">
        <li v-for="n in notes" :key="n">{{ n }}</li>
      </ul>
      <label for="new-description" class="mt-4 block text-sm font-medium text-slate-700">What does it describe? <span class="font-normal text-slate-500">Optional</span></label>
      <textarea id="new-description" :value="creating.description" rows="2" maxlength="280" placeholder="e.g. Someone we stay in touch with: their name and how to reach them." class="field resize-none" @input="update({ description: ($event.target as HTMLTextAreaElement).value })" />
      <p class="mt-1.5 text-xs text-slate-500">Only this experiment keeps the description. Orbit’s Definitions have a name and properties, nothing more.</p>
    </section>

    <section class="mt-8" aria-labelledby="contains-heading">
      <h2 id="contains-heading" class="flex items-center gap-2.5 text-sm font-semibold text-slate-900"><span :class="step" aria-hidden="true">2</span>What does it contain?</h2>
      <p class="mt-1 text-sm text-slate-600">
        Each property holds text, a number, or yes or no. Every property is required: information without one of them doesn’t count as {{ name || 'it' }}.
      </p>
      <PropertiesEditor class="mt-4" :draft="creating.draft" id-prefix="new" @update:draft="update({ draft: $event })" />
    </section>

    <section class="mt-8 rounded-2xl bg-slate-50 p-5 ring-1 ring-slate-200/70" aria-labelledby="try-heading">
      <h2 id="try-heading" class="flex items-center gap-2.5 text-sm font-semibold text-slate-900"><span :class="step" aria-hidden="true">3</span>Try an example</h2>
      <p class="mt-1 mb-4 text-sm text-slate-600">A Definition holds no information itself. This is how it judges some.</p>
      <ExampleCheck :fields="fields" :name="name" id-prefix="new" />
    </section>

    <section class="mt-8 border-t border-slate-100 pt-6" aria-labelledby="create-heading">
      <h2 id="create-heading" class="sr-only">Create version 1</h2>
      <p class="text-sm text-slate-700">
        Creating version 1 fixes {{ name || 'it' }} with
        <template v-if="fields.length && !draftProblems(creating.draft).length">
          {{ fields.map((f) => `${f.name} (${typeWords[f.type].toLowerCase()})`).join(', ') }}.
        </template>
        <template v-else>the properties above.</template>
        Version 1 never changes after that. A change makes version 2, and whatever uses version 1 keeps using it.
      </p>
      <ul v-if="tried && problems.length" class="mt-3 flex flex-col gap-0.5 text-sm text-red-700" aria-live="polite">
        <li v-for="p in problems" :key="p">{{ p }}</li>
      </ul>
      <div class="mt-5 flex flex-wrap items-center gap-3">
        <button type="button" class="btn-primary w-auto rounded-full px-5 py-2.5 text-sm" @click="create">Create version 1</button>
        <button type="button" class="link text-sm" @click="cancel">Discard</button>
      </div>
    </section>
  </section>
</template>
