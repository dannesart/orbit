<script setup lang="ts">
// Making or changing a Definition made here, on purpose and in its own view (never inside the
// inspector), as one editor in segments you move between freely, like the Transform's editor:
//
//   General  its name, description and appearance (icon and colour): for people, never a version
//   Model    its properties, and how the result reads
//   Preview  trying an example against it: optional, never needed to create anything
//
//   new    a new Definition: General, Model, Preview; then Create version 1
//   next   a draft of its next version: Model, Preview; then Create version N
//   about  its name, description and appearance: General; then Save (no version is made)
//
// Its icon, name and what's being drafted stay in view in every segment, and so does the one action
// (subject to the same checks as ever). Drafts of a new Definition or a next version live in this
// tab's shelf, so moving between segments, going Back, or elsewhere in Orbit loses nothing. Cancel
// discards, asking first only when there is something to lose. Leaving by Create, Save, Cancel or
// Discard replaces this view in the history, so Back never returns to an editor that has finished.
import type { DefinitionVersion } from '#shared/features/definitions'
import LeaveDialog from '../designer/LeaveDialog.vue'
import { type Appearance, DEFAULT_APPEARANCE, sameAppearance } from './appearance'
import {
  type Draft, type NewDefinition, blankDraft, changeWords, changesFrom, draftFrom, draftProblems, fieldsOf, nameNotes, nameProblem, versionLike,
} from './model'
import { createFromDraft, findMade, redescribe, setCreating, setEvolving, shelfOf, startCreating, versionFromDraft } from './store'
import AppearancePicker from './AppearancePicker.vue'
import DefinitionTile from './DefinitionTile.vue'
import DefinitionsIcon from './DefinitionsIcon.vue'
import LivePreview from './LivePreview.vue'
import ModelBuilder from './ModelBuilder.vue'
import { type ExampleEntries, reconcile, resetEntries } from './example'

type Part = 'new' | 'next' | 'about'
type Segment = 'general' | 'model' | 'preview'
const props = defineProps<{ workspace: { id: string; name: string }; part: Part; id: string; version: number | null }>()
const emit = defineEmits<{ created: [version: number] }>()

const SEGMENTS: Record<Part, Segment[]> = { new: ['general', 'model', 'preview'], next: ['model', 'preview'], about: ['general'] }
const LABELS: Record<Segment, string> = { general: 'General', model: 'Model', preview: 'Preview' }
const segments = SEGMENTS[props.part]
const segment = ref<Segment>(segments[0]!)

const made = computed(() => (props.part === 'new' ? null : findMade(props.workspace.id, props.id)))
const versions = computed<readonly DefinitionVersion[]>(() => made.value?.versions ?? [])
const toCatalogue = (): { query: Record<string, string> } => ({ query: props.part === 'new' ? {} : { d: props.id } })
let finished = false
const leave = (query: Record<string, string> = toCatalogue().query) => {
  finished = true
  return navigateTo({ query }, { replace: true })
}

// --- A new Definition: its draft, in the shelf ---
const creating = ref<NewDefinition | null>(props.part === 'new' ? startCreating(props.workspace.id) : null)
watch(creating, (next) => next && setCreating(props.workspace.id, next))
const updateNew = (change: Partial<NewDefinition>) => creating.value && (creating.value = { ...creating.value, ...change })

// --- The next version: its draft, in the shelf (started from the version asked for, or the latest) ---
const evolving = computed(() => (props.part === 'next' ? shelfOf(props.workspace.id).evolving[props.id] ?? null : null))
onMounted(() => {
  if (props.part !== 'next' || !made.value || evolving.value) return
  const from = versions.value.find((v) => v.version === props.version) ?? versions.value.at(-1)
  if (from) setEvolving(props.workspace.id, props.id, draftFrom(from))
})
const base = computed(() => (evolving.value ? versions.value.find((v) => v.version === evolving.value!.basedOn) ?? null : null))

// --- Name, description and appearance of one already made: edited here, saved on purpose ---
const about = ref({ name: made.value?.name ?? '', description: made.value?.description ?? '', appearance: made.value?.appearance ?? DEFAULT_APPEARANCE })

// --- What every segment shows, whichever part this is ---
const name = computed(() => (props.part === 'new' ? creating.value!.name : props.part === 'about' ? about.value.name : made.value?.name ?? '').trim())
const description = computed(() => (props.part === 'new' ? creating.value!.description : about.value.description))
const appearance = computed<Appearance>(() => (props.part === 'new' ? creating.value!.appearance ?? DEFAULT_APPEARANCE : props.part === 'about' ? about.value.appearance : made.value?.appearance ?? DEFAULT_APPEARANCE))
const draft = computed<Draft | null>(() => (props.part === 'new' ? creating.value!.draft : evolving.value))
const fields = computed(() => (draft.value ? fieldsOf(draft.value) : []))

// The Preview's example: held here, so moving between segments keeps what was typed, and kept in
// step with the model as properties come, go and change (example.ts). Never kept beyond this view.
const example = ref<ExampleEntries>({})
const extra = ref<{ name: string; text: string } | null>(null)
const advanced = ref(false)
watch(() => draft.value?.fields, (now) => (example.value = reconcile(example.value, now ?? [])), { immediate: true, deep: true })
const nextNumber = computed(() => versions.value.length + 1)
const count = (n: number) => (n === 1 ? '1 property' : `${n} properties`)
const cardMeta = computed(() => {
  if (props.part === 'new') return `Version 1 · ${count(fields.value.filter((f) => f.name).length)}`
  const latest = versions.value.at(-1)
  return latest ? `Version ${latest.version} · ${count(latest.fields.length)}` : ''
})
const context = computed(() => ({
  new: `New Definition · ${props.workspace.name}`,
  next: evolving.value ? `Draft of version ${nextNumber.value} · from version ${evolving.value.basedOn}` : 'Draft of the next version',
  about: 'Name and appearance · no new version',
}[props.part]))

const notes = computed(() => nameNotes(
  props.part === 'new' ? creating.value!.name : about.value.name,
  shelfOf(props.workspace.id).made.filter((d) => d.id !== props.id).map((d) => d.name),
  props.workspace.name,
))
const changes = computed(() => (evolving.value && base.value ? changesFrom(base.value, evolving.value) : []))
const same = computed(() => (made.value && evolving.value && !draftProblems(evolving.value).length ? versionLike(made.value, fields.value) : null))

// The checks, by segment, so a failed attempt can say where to look.
const problems = computed<{ segment: Segment; text: string }[]>(() => {
  const list: { segment: Segment; text: string }[] = []
  if (props.part !== 'next') {
    const p = nameProblem(props.part === 'new' ? creating.value!.name : about.value.name)
    if (p) list.push({ segment: 'general', text: p })
  }
  if (draft.value) list.push(...draftProblems(draft.value).map((text) => ({ segment: 'model' as const, text })))
  if (same.value) list.push({ segment: 'model', text: `This is exactly version ${same.value.version}. Use version ${same.value.version} instead of making another.` })
  return list
})
const tried = ref(false)
const action = computed(() => ({ new: 'Create version 1', next: `Create version ${nextNumber.value}`, about: 'Save' }[props.part]))

function act() {
  tried.value = true
  if (problems.value.length) {
    if (!problems.value.some((p) => p.segment === segment.value)) segment.value = problems.value[0]!.segment
    return
  }
  if (props.part === 'new') {
    const id = createFromDraft(props.workspace.id)
    finished = true
    navigateTo({ query: { d: id } }, { replace: true })
  } else if (props.part === 'next') {
    const number = versionFromDraft(props.workspace.id, props.id)
    emit('created', number)
    leave({ d: props.id, v: String(number) })
  } else {
    redescribe(props.workspace.id, props.id, about.value)
    leave()
  }
}

// --- Something to lose? Never for an untouched draft. ---
const blank = blankDraft()
const losing = computed<string[]>(() => {
  if (props.part === 'new') {
    const c = creating.value!
    const untouched = !c.name.trim() && !c.description.trim() && sameAppearance(c.appearance ?? DEFAULT_APPEARANCE, DEFAULT_APPEARANCE)
      && c.draft.fields.length === blank.fields.length && c.draft.fields.every((f) => !f.name.trim() && f.type === 'string')
    return untouched ? [] : ['This new Definition: its name, properties and appearance']
  }
  if (props.part === 'next') return changes.value.length ? [`The draft of version ${nextNumber.value} and its changes`] : []
  const m = made.value
  if (!m) return []
  const a = about.value
  return a.name.trim() !== m.name || a.description.trim() !== m.description || !sameAppearance(a.appearance, m.appearance) ? ['Your changes to its name, description or appearance'] : []
})

// Orbit's confirmation, as the designer asks it: staying is the safe, focused choice.
const asking = ref<{ losing: string[]; resolve: (leave: boolean) => void } | null>(null)
const ask = (list: string[]) => new Promise<boolean>((resolve) => (asking.value = { losing: list, resolve }))
function answer(leaveIt: boolean) {
  asking.value?.resolve(leaveIt)
  asking.value = null
}
const words = computed(() => ({
  new: { title: 'Discard this new Definition?', intro: 'It hasn’t been created. Discarding it loses:', confirm: 'Discard', stay: 'Keep editing' },
  next: { title: `Discard the draft of version ${nextNumber.value}?`, intro: 'Every existing version stays exactly as it is. Discarding loses:', confirm: 'Discard draft', stay: 'Keep editing' },
  about: { title: 'Leave without saving?', intro: 'Nothing has been saved. Leaving loses:', confirm: 'Leave without saving', stay: 'Keep editing' },
}[props.part]))

async function cancel() {
  if (losing.value.length && !(await ask(losing.value))) return
  if (props.part === 'new') setCreating(props.workspace.id, null)
  if (props.part === 'next') setEvolving(props.workspace.id, props.id, null)
  if (props.part === 'next' && base.value) return leave({ d: props.id, v: String(base.value.version) })
  leave()
}
// Name and appearance are held only here until saved: leaving any other way asks first too.
async function guard() {
  if (props.part !== 'about' || finished || !losing.value.length) return true
  if (!(await ask(losing.value))) return false
  finished = true
  return true
}
onBeforeRouteLeave(guard)
onBeforeRouteUpdate(guard)

// Changing segments keeps focus in the tab list (arrow keys move between them).
const tabs = ref<HTMLElement>()
function onTabKey(event: KeyboardEvent) {
  const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
  if (!step) return
  const i = (segments.indexOf(segment.value) + step + segments.length) % segments.length
  segment.value = segments[i]!
  nextTick(() => tabs.value?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus())
}
const tab = 'rounded-full px-4 py-1.5 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500'
const heading = ref<HTMLElement>()
onMounted(() => heading.value?.focus())
</script>

<template>
  <section v-if="part !== 'new' && !made" class="animate-rise rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm sm:p-8">
    <h1 class="text-xl font-semibold text-slate-900">Only Definitions made in {{ workspace.name }} can change</h1>
    <p class="mt-2 text-sm text-slate-600">Definitions provided by Orbit are read-only. One made in this tab is gone after a reload.</p>
    <NuxtLink :to="{ query: {} }" class="link mt-4 inline-block text-sm">‹ Definitions</NuxtLink>
  </section>

  <section v-else class="animate-rise flex flex-col overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-sm" aria-labelledby="editor-heading" data-definition-editor>
    <!-- What's being edited: always in view -->
    <div class="flex flex-wrap items-center gap-x-3 gap-y-3 border-b border-slate-100 px-5 py-4 sm:px-6">
      <!-- Back keeps a draft for later; one never touched isn't worth keeping. -->
      <NuxtLink :to="toCatalogue()" class="link mr-1 text-sm" data-back @click="part === 'new' && !losing.length && setCreating(workspace.id, null)">‹ Definitions</NuxtLink>
      <div class="flex min-w-0 flex-1 basis-56 items-center gap-3">
        <DefinitionTile :appearance="appearance" size="sm" />
        <div class="min-w-0">
          <h1 id="editor-heading" ref="heading" tabindex="-1" class="truncate text-base leading-tight font-semibold text-slate-900 outline-none">{{ name || 'New Definition' }}</h1>
          <p class="truncate text-xs text-slate-500">{{ context }}</p>
        </div>
      </div>
      <div v-if="segments.length > 1" ref="tabs" class="flex w-full rounded-full bg-slate-100 p-1 sm:w-auto" role="tablist" aria-label="What you’re editing" @keydown="onTabKey">
        <button
          v-for="s in segments"
          :id="`segment-${s}`"
          :key="s"
          type="button"
          role="tab"
          :aria-selected="segment === s"
          aria-controls="segment-panel"
          :tabindex="segment === s ? 0 : -1"
          :class="[tab, 'flex-1 sm:flex-none', segment === s ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900']"
          @click="segment = s"
        >
          {{ LABELS[s] }}
        </button>
      </div>
    </div>

    <div id="segment-panel" :role="segments.length > 1 ? 'tabpanel' : undefined" :aria-labelledby="segments.length > 1 ? `segment-${segment}` : undefined" class="px-5 py-6 sm:px-6">
      <!-- General: for people -->
      <div v-if="segment === 'general'" class="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
        <div class="min-w-0">
          <label :for="`${part}-name`" class="block text-sm font-medium text-slate-700">Name</label>
          <input
            v-if="part === 'new'"
            id="new-name"
            :value="creating!.name"
            type="text"
            maxlength="64"
            autocomplete="off"
            placeholder="e.g. Person"
            class="field"
            :aria-invalid="tried && problems.some((p) => p.segment === 'general')"
            @input="updateNew({ name: ($event.target as HTMLInputElement).value })"
          >
          <input v-else id="about-name" v-model="about.name" type="text" maxlength="64" autocomplete="off" class="field" :aria-invalid="tried && problems.some((p) => p.segment === 'general')">
          <ul v-if="notes.length" class="mt-2 flex flex-col gap-1 text-sm text-amber-800">
            <li v-for="n in notes" :key="n">{{ n }}</li>
          </ul>
          <label :for="`${part}-description`" class="mt-5 block text-sm font-medium text-slate-700">Description <span class="font-normal text-slate-500">Optional</span></label>
          <textarea
            v-if="part === 'new'"
            id="new-description"
            :value="creating!.description"
            rows="3"
            maxlength="280"
            placeholder="e.g. Someone we stay in touch with: their name and how to reach them."
            class="field resize-none"
            @input="updateNew({ description: ($event.target as HTMLTextAreaElement).value })"
          />
          <textarea v-else id="about-description" v-model="about.description" rows="3" maxlength="280" class="field resize-none" />
          <p class="mt-2 text-xs text-slate-500">Only this experiment keeps the description and appearance. They’re for people: changing them never makes a version.</p>
        </div>
        <AppearancePicker
          :model-value="appearance"
          :name="name"
          :meta="cardMeta"
          :id-prefix="part"
          @update:model-value="part === 'new' ? updateNew({ appearance: $event }) : (about.appearance = $event)"
        />
      </div>

      <!-- Model: building it from property types; its rows are how it reads -->
      <div v-else-if="segment === 'model' && draft">
        <ModelBuilder :draft="draft" :id-prefix="part" @update:draft="part === 'new' ? updateNew({ draft: $event }) : setEvolving(workspace.id, id, $event)" />
        <div class="lg:pl-[12.5rem]">
          <div v-if="part === 'next' && evolving" class="mt-6 rounded-2xl bg-slate-50 p-4 text-sm ring-1 ring-slate-200/70" aria-live="polite">
            <h2 class="font-semibold text-slate-900">What changes from version {{ evolving.basedOn }}</h2>
            <p v-if="!changes.length" class="mt-1 text-slate-500">Nothing yet.</p>
            <ul v-else class="mt-1 list-disc pl-5 text-slate-700">
              <li v-for="(c, i) in changes" :key="i">{{ changeWords(c) }}</li>
            </ul>
            <p class="mt-3 text-xs text-slate-500">
              Version {{ evolving.basedOn }} stays exactly as it is, and so does every other version. Whatever uses a version keeps using it:
              nothing moves to version {{ nextNumber }} by itself.
              <template v-if="changes.some((c) => c.kind !== 'added')">Information that fits version {{ evolving.basedOn }} won’t fit version {{ nextNumber }}.</template>
            </p>
          </div>
        </div>
      </div>

      <!-- Preview: optional, live, and never needed to create anything -->
      <LivePreview
        v-else-if="segment === 'preview' && draft"
        v-model:entries="example"
        v-model:extra="extra"
        v-model:advanced="advanced"
        :fields="draft.fields"
        :name="part === 'new' ? name : `${name}, version ${nextNumber}`"
        :appearance="appearance"
        :id-prefix="part"
        @reset="example = resetEntries(draft.fields); extra = null"
      />
    </div>

    <!-- The one action, in every segment -->
    <div class="flex flex-wrap items-center gap-3 border-t border-slate-100 px-5 pt-4 pb-5 sm:px-6">
      <ul v-if="tried && problems.length" class="w-full text-sm text-red-700" aria-live="polite">
        <li v-for="p in problems" :key="p.text" class="flex flex-wrap items-baseline gap-x-2">
          {{ p.text }}
          <button v-if="p.segment !== segment" type="button" class="link text-xs" @click="segment = p.segment">Go to {{ LABELS[p.segment] }}</button>
        </li>
      </ul>
      <button type="button" class="btn-primary w-auto rounded-full px-5 py-2.5 text-sm" data-editor-action @click="act">{{ action }}</button>
      <button type="button" class="link text-sm" @click="cancel">{{ part === 'next' ? 'Discard draft' : 'Cancel' }}</button>
      <span v-if="part !== 'about'" class="ml-auto hidden items-center gap-1.5 text-xs text-slate-500 sm:flex">
        <DefinitionsIcon name="lock" class="size-3" />
        {{ part === 'new' ? 'Version 1' : `Version ${nextNumber}` }} never changes once made
      </span>
    </div>

    <LeaveDialog
      :losing="asking?.losing ?? null"
      :title="words.title"
      :intro="words.intro"
      :confirm="words.confirm"
      :stay="words.stay"
      @stay="answer(false)"
      @leave="answer(true)"
    />
  </section>
</template>
