<script setup lang="ts">
// Changing a Definition made here, on purpose and in its own view (never inside the inspector):
//   next   a draft of its next version, started from the version shown (or continued), and one
//          deliberate action that creates it. Every existing version stays exactly as it is.
//   about  its name and description: for people, never a version.
// Leaving by Create, Done, Cancel or Discard replaces this view in the history, so Back never
// returns to an editor that has just finished.
import type { DefinitionVersion } from '#shared/features/definitions'
import { changeWords, changesFrom, draftFrom, draftProblems, fieldsOf, nameNotes, versionLike } from './model'
import { findMade, redescribe, setEvolving, shelfOf, versionFromDraft } from './store'
import PropertiesEditor from './PropertiesEditor.vue'
import ExampleCheck from './ExampleCheck.vue'

const props = defineProps<{ workspace: { id: string; name: string }; id: string; part: 'next' | 'about'; version: number | null }>()
const emit = defineEmits<{ created: [version: number] }>()

const made = computed(() => findMade(props.workspace.id, props.id))
const versions = computed<readonly DefinitionVersion[]>(() => made.value?.versions ?? [])
const name = computed(() => made.value?.name ?? '')
const back = (v?: number) => ({ query: { d: props.id, ...(v ? { v: String(v) } : {}) } })
const leave = (v?: number) => navigateTo(back(v), { replace: true })

// --- The next version ---
const draft = computed(() => shelfOf(props.workspace.id).evolving[props.id] ?? null)
// Reached directly with no draft yet: start one from the version asked for, or the latest.
onMounted(() => {
  if (props.part !== 'next' || !made.value || draft.value) return
  const from = versions.value.find((v) => v.version === props.version) ?? versions.value.at(-1)
  if (from) setEvolving(props.workspace.id, props.id, draftFrom(from))
})
const base = computed(() => (draft.value ? versions.value.find((v) => v.version === draft.value!.basedOn) ?? null : null))
const nextNumber = computed(() => versions.value.length + 1)
const draftFields = computed(() => (draft.value ? fieldsOf(draft.value) : []))
const changes = computed(() => (draft.value && base.value ? changesFrom(base.value, draft.value) : []))
const problems = computed(() => (draft.value ? draftProblems(draft.value) : []))
const same = computed(() => (made.value && draft.value && !problems.value.length ? versionLike(made.value, draftFields.value) : null))
const canCreate = computed(() => !!draft.value && !problems.value.length && !same.value)
function createVersion() {
  if (!canCreate.value) return
  const number = versionFromDraft(props.workspace.id, props.id)
  emit('created', number)
  leave(number)
}
function discardDraft() {
  const from = draft.value?.basedOn ?? undefined
  setEvolving(props.workspace.id, props.id, null)
  leave(from)
}

// --- Name and description ---
const nextName = ref(name.value)
const nextDescription = ref(made.value?.description ?? '')
const renameNotes = computed(() => nameNotes(nextName.value, shelfOf(props.workspace.id).made.filter((d) => d.id !== props.id).map((d) => d.name), props.workspace.name))
function saveDescription() {
  if (!nextName.value.trim()) return
  redescribe(props.workspace.id, props.id, { name: nextName.value, description: nextDescription.value })
  leave()
}
</script>

<template>
  <section v-if="!made" class="animate-rise rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm sm:p-8">
    <h1 class="text-xl font-semibold text-slate-900">Only Definitions made in {{ workspace.name }} can change</h1>
    <p class="mt-2 text-sm text-slate-600">Definitions provided by Orbit are read-only. One made in this tab is gone after a reload.</p>
    <NuxtLink :to="{ query: {} }" class="link mt-4 inline-block text-sm">‹ Definitions</NuxtLink>
  </section>

  <section v-else-if="part === 'about'" class="animate-rise rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm sm:p-8" aria-labelledby="about-heading">
    <NuxtLink :to="back()" class="link text-sm">‹ {{ name }}</NuxtLink>
    <h1 id="about-heading" class="mt-4 text-2xl font-semibold tracking-tight text-slate-900">Name and description</h1>
    <form class="mt-6" @submit.prevent="saveDescription">
      <label for="rename" class="block text-sm font-medium text-slate-700">Name</label>
      <input id="rename" v-model="nextName" type="text" maxlength="64" autocomplete="off" class="field" :aria-invalid="!nextName.trim()">
      <ul v-if="renameNotes.length" class="mt-2 flex flex-col gap-1 text-sm text-amber-800">
        <li v-for="n in renameNotes" :key="n">{{ n }}</li>
      </ul>
      <label for="redescribe" class="mt-4 block text-sm font-medium text-slate-700">What does it describe?</label>
      <textarea id="redescribe" v-model="nextDescription" rows="2" maxlength="280" class="field resize-none" />
      <p class="mt-2 text-xs text-slate-500">This doesn’t make a version: names and descriptions are for people. Every version keeps its properties exactly.</p>
      <div class="mt-6 flex items-center gap-3">
        <button type="submit" class="btn-primary w-auto rounded-full px-5 py-2 text-sm" :disabled="!nextName.trim()">Done</button>
        <button type="button" class="link text-sm" @click="leave()">Cancel</button>
      </div>
    </form>
  </section>

  <section v-else-if="draft" class="animate-rise rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm sm:p-8" aria-labelledby="draft-heading">
    <NuxtLink :to="back(draft.basedOn ?? undefined)" class="link text-sm">‹ {{ name }}</NuxtLink>
    <p class="mt-4 text-xs font-semibold tracking-wide text-accent-700 uppercase">Draft · not a version</p>
    <h1 id="draft-heading" class="mt-1 text-2xl font-semibold tracking-tight text-slate-900">{{ name }}, version {{ nextNumber }}</h1>
    <p class="mt-1 text-sm text-slate-600">Started from version {{ draft.basedOn }}. Every property is required. Each holds text, a number, or yes or no.</p>

    <PropertiesEditor class="mt-6" :draft="draft" id-prefix="draft" @update:draft="setEvolving(workspace.id, id, $event)" />

    <div class="mt-5 rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200/70" aria-live="polite">
      <h2 class="text-sm font-semibold text-slate-900">What changes from version {{ draft.basedOn }}</h2>
      <p v-if="!changes.length" class="mt-1 text-sm text-slate-500">Nothing yet.</p>
      <ul v-else class="mt-1 list-disc pl-5 text-sm text-slate-700">
        <li v-for="(c, i) in changes" :key="i">{{ changeWords(c) }}</li>
      </ul>
      <p v-if="same && changes.length" class="mt-2 text-sm text-amber-800">This is exactly version {{ same.version }}. Use version {{ same.version }} instead of making another.</p>
      <ul v-if="problems.length" class="mt-2 flex flex-col gap-0.5 text-sm text-red-700">
        <li v-for="p in problems" :key="p">{{ p }}</li>
      </ul>
    </div>

    <div class="mt-4 rounded-2xl bg-accent-50/60 p-4 text-sm text-slate-700 ring-1 ring-accent-100">
      <p>Version {{ draft.basedOn }} stays exactly as it is, and so does every other version.</p>
      <p class="mt-1">
        Whatever uses a version keeps using that version. Nothing moves to version {{ nextNumber }} by itself: a Transform uses it only
        when someone chooses it, and its properties are then mapped again for it.
        <template v-if="changes.some((c) => c.kind !== 'added')">Information that fits version {{ draft.basedOn }} won’t fit version {{ nextNumber }}.</template>
      </p>
    </div>

    <details class="group mt-4 rounded-2xl bg-white ring-1 ring-slate-200">
      <summary class="cursor-pointer list-none px-4 py-3 text-sm font-medium text-slate-800">Try an example against version {{ nextNumber }} <span class="text-slate-400 group-open:hidden" aria-hidden="true">›</span></summary>
      <div class="px-4 pb-4">
        <ExampleCheck :fields="draftFields" :name="`${name}, version ${nextNumber}`" id-prefix="draft" />
      </div>
    </details>

    <div class="mt-5 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-5">
      <button type="button" class="btn-primary w-auto rounded-full px-5 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-50" :disabled="!canCreate" @click="createVersion">Create version {{ nextNumber }}</button>
      <button type="button" class="link text-sm" @click="discardDraft">Discard draft</button>
    </div>
  </section>
</template>
