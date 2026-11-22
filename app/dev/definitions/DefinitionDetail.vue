<script setup lang="ts">
// One Definition: what it is, each of its versions exactly as made, and (for one made here) a draft
// of its next version. Its name and description can change without making a version; its
// properties can't change at all, only be followed by a new version.
import type { DefinitionVersion } from '#shared/features/definitions'
import {
  ORBIT_DESCRIPTIONS, ORBIT_PROVIDED, changeWords, changesFrom, draftFrom, draftProblems, fieldsOf, nameNotes, typeWords, versionLike,
} from './model'
import { findMade, redescribe, setEvolving, shelfOf, versionFromDraft } from './store'
import { definitionsPath } from './designer'
import PropertiesEditor from './PropertiesEditor.vue'
import ExampleCheck from './ExampleCheck.vue'

const props = defineProps<{ workspace: { id: string; name: string }; id: string; version: number | null }>()

const made = computed(() => findMade(props.workspace.id, props.id))
const provided = computed(() => ORBIT_PROVIDED.filter((d) => d.id === props.id))
const versions = computed<readonly DefinitionVersion[]>(() => made.value?.versions ?? provided.value)
const name = computed(() => made.value?.name ?? provided.value[0]?.name ?? '')
const description = computed(() => made.value?.description ?? ORBIT_DESCRIPTIONS[props.id] ?? '')
const latest = computed(() => versions.value.at(-1))
const shown = computed(() => versions.value.find((v) => v.version === props.version) ?? latest.value)
const versionTo = (v: number) => ({ query: { d: props.id, v: String(v) } })

// --- The Designer ---
const designerFor = (v: DefinitionVersion) =>
  `/dev/designer?back=${encodeURIComponent(definitionsPath(props.workspace.id, props.id, v.version))}&output=${encodeURIComponent(`${v.id}@${v.version}`)}`

// --- Name and description: for people, never a version ---
const editing = ref(false)
const nextName = ref('')
const nextDescription = ref('')
function startEditing() {
  nextName.value = name.value
  nextDescription.value = description.value
  editing.value = true
}
function saveDescription() {
  if (!nextName.value.trim()) return
  redescribe(props.workspace.id, props.id, { name: nextName.value, description: nextDescription.value })
  editing.value = false
}
const renameNotes = computed(() => nameNotes(nextName.value, shelfOf(props.workspace.id).made.filter((d) => d.id !== props.id).map((d) => d.name), props.workspace.name))

// --- The next version ---
const draft = computed(() => shelfOf(props.workspace.id).evolving[props.id] ?? null)
const base = computed(() => (draft.value ? versions.value.find((v) => v.version === draft.value!.basedOn) ?? null : null))
const nextNumber = computed(() => versions.value.length + 1)
const draftFields = computed(() => (draft.value ? fieldsOf(draft.value) : []))
const changes = computed(() => (draft.value && base.value ? changesFrom(base.value, draft.value) : []))
const problems = computed(() => (draft.value ? draftProblems(draft.value) : []))
const same = computed(() => (made.value && draft.value && !problems.value.length ? versionLike(made.value, draftFields.value) : null))
const canCreate = computed(() => !!draft.value && !problems.value.length && !same.value)

function startDraft(from: DefinitionVersion) {
  setEvolving(props.workspace.id, props.id, draftFrom(from))
  nextTick(() => document.getElementById('draft-heading')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
}
const created = ref<number | null>(null)
function createVersion() {
  if (!canCreate.value) return
  const number = versionFromDraft(props.workspace.id, props.id)
  created.value = number
  navigateTo(versionTo(number), { replace: true })
}
const discardDraft = () => setEvolving(props.workspace.id, props.id, null)
const pill = 'rounded-full px-3 py-1 text-xs font-semibold ring-1 transition'
</script>

<template>
  <div v-if="!versions.length" class="animate-rise rounded-3xl border border-slate-200/80 bg-white p-8 shadow-sm">
    <h1 class="text-xl font-semibold text-slate-900">This Definition isn’t here</h1>
    <p class="mt-2 text-sm text-slate-600">
      It may have been made in this tab before a reload: Definitions made here last only as long as the tab.
    </p>
    <NuxtLink :to="definitionsPath(workspace.id)" class="link mt-4 inline-block text-sm">Back to Definitions</NuxtLink>
  </div>

  <div v-else class="flex flex-col gap-4">
    <section class="animate-rise rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm sm:p-8" aria-labelledby="definition-heading">
      <NuxtLink :to="definitionsPath(workspace.id)" class="link text-sm">‹ Definitions</NuxtLink>
      <p class="mt-4 text-xs font-semibold tracking-wide uppercase" :class="made ? 'text-accent-700' : 'text-slate-500'">
        {{ made ? `Made in ${workspace.name}` : 'Provided by Orbit · a sample in this preview' }}
      </p>

      <template v-if="!editing">
        <h1 id="definition-heading" class="mt-1 text-2xl font-semibold tracking-tight text-slate-900">{{ name }}</h1>
        <p v-if="description" class="mt-2 text-slate-600">{{ description }}</p>
        <button v-if="made" type="button" class="link mt-3 text-sm" @click="startEditing">Change name or description</button>
        <p v-else class="mt-3 text-sm text-slate-500">You can use it in {{ workspace.name }}. Nobody in a workspace can change it.</p>
      </template>
      <form v-else class="mt-2" @submit.prevent="saveDescription">
        <label for="rename" class="block text-sm font-medium text-slate-700">Name</label>
        <input id="rename" v-model="nextName" type="text" maxlength="64" autocomplete="off" class="field" :aria-invalid="!nextName.trim()">
        <ul v-if="renameNotes.length" class="mt-2 flex flex-col gap-1 text-sm text-amber-800">
          <li v-for="n in renameNotes" :key="n">{{ n }}</li>
        </ul>
        <label for="redescribe" class="mt-4 block text-sm font-medium text-slate-700">What does it describe?</label>
        <textarea id="redescribe" v-model="nextDescription" rows="2" maxlength="280" class="field resize-none" />
        <p class="mt-2 text-xs text-slate-500">This doesn’t make a version: names and descriptions are for people. Every version keeps its properties exactly.</p>
        <div class="mt-4 flex items-center gap-3">
          <button type="submit" class="btn-primary w-auto rounded-full px-5 py-2 text-sm" :disabled="!nextName.trim()">Done</button>
          <button type="button" class="link text-sm" @click="editing = false">Cancel</button>
        </div>
      </form>
    </section>

    <section class="animate-rise rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm sm:p-8" aria-labelledby="versions-heading">
      <div class="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="versions-heading" class="text-sm font-semibold text-slate-900">Versions</h2>
        <p class="text-xs text-slate-500">Each one is fixed for good.</p>
      </div>
      <nav class="mt-3 flex flex-wrap gap-1.5" aria-label="Versions">
        <NuxtLink
          v-for="v in [...versions].reverse()"
          :key="v.version"
          :to="versionTo(v.version)"
          replace
          :aria-current="v.version === shown?.version ? 'page' : undefined"
          :class="[pill, v.version === shown?.version ? 'bg-accent-50 text-accent-800 ring-accent-300' : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50']"
        >
          Version {{ v.version }}<template v-if="v.version === latest?.version"> · latest</template>
        </NuxtLink>
      </nav>

      <div v-if="shown" class="mt-4 rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200/70">
        <p v-if="created === shown.version" class="mb-3 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800 ring-1 ring-emerald-200" role="status">
          Version {{ shown.version }} is made.<template v-if="shown.version > 1"> Version {{ shown.version - 1 }} is exactly as it was.</template>
        </p>
        <p class="flex items-center gap-1.5 text-xs font-medium text-slate-500"><span aria-hidden="true">🔒</span> Version {{ shown.version }} contains</p>
        <ul class="mt-2 divide-y divide-slate-200/70">
          <li v-for="f in shown.fields" :key="f.name" class="flex items-center justify-between gap-3 py-2 text-sm">
            <span class="font-medium text-slate-900">{{ f.name }}</span>
            <span class="text-xs text-slate-500">{{ typeWords[f.type] }} · required</span>
          </li>
        </ul>
        <p v-if="made && shown.name !== name" class="mt-2 text-xs text-slate-500">Made when it was called {{ shown.name }}.</p>
      </div>

      <div v-if="shown" class="mt-4 flex flex-wrap items-center gap-3">
        <NuxtLink :to="designerFor(shown)" class="btn-primary w-auto rounded-full px-5 py-2 text-sm">Use version {{ shown.version }} in the Designer</NuxtLink>
        <button v-if="made && !draft" type="button" class="link text-sm" @click="startDraft(shown)">Start version {{ nextNumber }} from this one</button>
      </div>
    </section>

    <section v-if="made && draft" class="animate-rise rounded-3xl border border-accent-200/70 bg-white p-6 shadow-sm ring-4 ring-accent-50 sm:p-8" aria-labelledby="draft-heading">
      <p class="text-xs font-semibold tracking-wide text-accent-700 uppercase">Draft · not a version</p>
      <h2 id="draft-heading" class="mt-1 text-lg font-semibold text-slate-900">Version {{ nextNumber }}, started from version {{ draft.basedOn }}</h2>
      <p class="mt-1 text-sm text-slate-600">Every property is required. Each holds text, a number, or yes or no.</p>

      <PropertiesEditor class="mt-4" :draft="draft" id-prefix="draft" @update:draft="setEvolving(workspace.id, id, $event)" />

      <div class="mt-5 rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200/70" aria-live="polite">
        <h3 class="text-sm font-semibold text-slate-900">What changes from version {{ draft.basedOn }}</h3>
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
  </div>
</template>
