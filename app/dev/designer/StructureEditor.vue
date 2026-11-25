<script setup lang="ts">
// Structure: what information the Transform's output contains. An existing Definition version,
// used as it is, or the Transform's own output, whose properties are added, renamed, retyped and
// removed here. Changing it changes a contract (Apply freezes a new Definition version and gives
// it a new Mapping), so it lives apart from mapping values and says so.
import type { DefinitionRef, DefinitionVersion, FieldType, PropertyType } from '#shared/features/definitions'
import { A1, DEFINITIONS, WORKSPACE, definitionLabel, shapeOf } from '../features/experiment'
import { type Configuration, type TransformDraft, catalogue, labelOf, outputOf } from './config'
import { asideReason, reconcile } from './switching'
import { DESIGNER_WORKSPACE, definitionsPath } from '../definitions/designer'
import { fromPiece, removeAt, replaceAt } from './parts'
import type { DraftReview } from './preview'
import { describeSource } from './summary'

const props = defineProps<{
  draft: TransformDraft
  config: Configuration
  target: { definition: DefinitionVersion; label: string; isNew: boolean }
  structure: readonly string[]
  review: DraftReview
}>()
const emit = defineEmits<{ 'update:draft': [TransformDraft] }>()
const update = (next: Partial<TransformDraft>) => emit('update:draft', { ...props.draft, ...next })

const keyOf = (ref: DefinitionRef) => `${ref.id}@${ref.version}`
/** Choosing another output: its properties at once, with mappings that fit it and nothing else. */
function switchTo(next: Partial<TransformDraft>) {
  const draft = { ...props.draft, ...next }
  emit('update:draft', reconcile(draft, A1, outputOf(props.config, draft).definition))
}
function setCatalogue(key: string) {
  const d = catalogue(props.config.offered).find((x) => keyOf(x) === key)
  if (d) switchTo({ catalogue: { id: d.id, version: d.version } })
}
const aside = computed(() => (props.draft.aside ?? []).map((p) => ({
  name: p.name || 'Unnamed', source: describeSource(fromPiece(p.piece)), reason: asideReason(p, A1, props.target.definition, props.target.label),
})))
// What can be chosen, by where it comes from (Experiment #7). Only what this workspace may use:
// another workspace's Definitions aren't listed at all, not even disabled.
const workspace = inject(DESIGNER_WORKSPACE, null)
const made = computed(() => (props.config.offered ?? []).filter((o) => o.source === 'workspace').map((o) => o.definition))
const provided = computed(() => (props.config.offered ?? []).filter((o) => o.source === 'orbit').map((o) => o.definition))
const samples = DEFINITIONS.filter((d) => d.workspaceId === WORKSPACE)
const chosenSource = computed(() => props.config.offered?.find((o) => keyOf(o.definition) === keyOf(props.draft.catalogue))?.source ?? 'sample')
const latestLocal = computed(() => props.config.locals.at(-1))
const fields = computed(() => props.target.definition.fields)
const properties = computed(() => props.draft.properties)
const root = ref<HTMLElement>()

const setFields = (next: DefinitionVersion['fields'], nextProperties = properties.value) =>
  update({ local: { ...props.draft.local, fields: next }, properties: nextProperties })
/** Renaming a property keeps its mapping with it. */
function rename(i: number, name: string) {
  const old = fields.value[i]!.name
  const index = old ? properties.value.findIndex((p) => p.name === old) : -1
  setFields(replaceAt(fields.value, i, { ...fields.value[i]!, name }), index >= 0 ? replaceAt(properties.value, index, { ...properties.value[index]!, name }) : properties.value)
}
const retype = (i: number, type: FieldType) => setFields(replaceAt(fields.value, i, { ...fields.value[i]!, type }))
/** Removing a property removes its mapping too (Undo brings both back). */
function removeField(i: number) {
  const name = fields.value[i]!.name
  const shared = fields.value.some((f, j) => j !== i && f.name === name)
  const index = name && !shared ? properties.value.findIndex((p) => p.name === name) : -1
  setFields(removeAt(fields.value, i), index >= 0 ? removeAt(properties.value, index) : properties.value)
}
function addField() {
  const taken = new Set(fields.value.map((f) => f.name))
  let name = 'newProperty'
  for (let n = 2; taken.has(name); n++) name = `newProperty${n}`
  const at = fields.value.length
  setFields([...fields.value, { name, type: 'string' }])
  nextTick(() => {
    const input = root.value?.querySelector<HTMLInputElement>(`[data-structure-row="${at}"] input`)
    input?.focus()
    input?.select()
  })
}
const mappingOf = (name: string) => {
  const p = properties.value.find((x) => x.name === name)
  return p ? describeSource(fromPiece(p.piece)) : null
}
const typeWords: Record<PropertyType, string> = { string: 'text', number: 'number', boolean: 'yes or no', object: 'object', reference: 'Definition' }
const card = 'flex w-full cursor-pointer items-start gap-2.5 rounded-2xl p-3 text-left ring-1 transition'
const control = 'rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-xs outline-none transition focus:border-accent-500 focus:ring-2 focus:ring-accent-100'
</script>

<template>
  <div ref="root">
    <section aria-labelledby="create-heading">
      <h3 id="create-heading" class="text-sm font-semibold text-slate-900">What should this Transform create?</h3>
      <div class="mt-2 grid gap-2 sm:grid-cols-2" role="radiogroup" aria-labelledby="create-heading">
        <label :class="[card, draft.use === 'catalogue' ? 'bg-accent-50/70 ring-accent-300' : 'bg-white ring-slate-200 hover:bg-slate-50']">
          <input type="radio" name="output-use" class="mt-0.5 accent-accent-600" :checked="draft.use === 'catalogue'" @change="switchTo({ use: 'catalogue' })">
          <span><span class="block text-sm font-medium text-slate-900">An existing Definition</span><span class="block text-xs text-slate-500">Shared, used exactly as it is</span></span>
        </label>
        <label :class="[card, draft.use === 'local' ? 'bg-accent-50/70 ring-accent-300' : 'bg-white ring-slate-200 hover:bg-slate-50']">
          <input type="radio" name="output-use" class="mt-0.5 accent-accent-600" :checked="draft.use === 'local'" @change="switchTo({ use: 'local' })">
          <span><span class="block text-sm font-medium text-slate-900">Its own output</span><span class="block text-xs text-slate-500">Shaped here, only for this Transform</span></span>
        </label>
      </div>

      <div v-if="draft.use === 'catalogue'" class="mt-4">
        <label for="output-definition" class="block text-xs font-medium text-slate-600">Definition and version</label>
        <select id="output-definition" :value="keyOf(draft.catalogue)" :class="[control, 'mt-1 w-full']" @change="setCatalogue(($event.target as HTMLSelectElement).value)">
          <optgroup v-if="workspace && made.length" :label="`Made in ${workspace.name}`">
            <option v-for="d in made" :key="keyOf(d)" :value="keyOf(d)">{{ labelOf(config, d) }}</option>
          </optgroup>
          <optgroup label="Provided by Orbit (samples)">
            <option v-for="d in provided" :key="keyOf(d)" :value="keyOf(d)">{{ labelOf(config, d) }}</option>
          </optgroup>
          <optgroup label="The Designer’s samples">
            <option v-for="d in samples" :key="keyOf(d)" :value="keyOf(d)">{{ definitionLabel(d) }}</option>
          </optgroup>
        </select>
        <p v-if="workspace" class="mt-1.5 text-xs text-slate-500">
          <template v-if="!made.length">Definitions made in {{ workspace.name }} are listed here.</template>
          Definitions are made and changed in
          <NuxtLink :to="chosenSource === 'workspace' ? definitionsPath(workspace.id, draft.catalogue.id, draft.catalogue.version) : definitionsPath(workspace.id)" class="link">{{ workspace.name }}’s Definitions</NuxtLink>.
        </p>
        <ul class="mt-3 divide-y divide-slate-100 rounded-2xl bg-white ring-1 ring-slate-200">
          <li v-for="f in fields" :key="f.name" class="flex items-center gap-3 px-4 py-2 text-sm">
            <span class="font-mono font-semibold text-slate-900">{{ f.name }}</span>
            <span class="text-xs text-slate-500">{{ typeWords[f.type] }}</span>
          </li>
        </ul>
        <p class="mt-2 text-xs text-slate-500">
          <template v-if="chosenSource === 'workspace'">{{ target.label }} is made in {{ workspace?.name }}’s Definitions, exactly this version. It can’t change here.</template>
          <template v-else-if="chosenSource === 'orbit'">{{ target.label }} is provided by Orbit. Nobody in a workspace can change it.</template>
          <template v-else>{{ target.label }} is shared, so it can’t change here.</template>
          To shape the output yourself, choose “Its own output”.
        </p>
      </div>

      <div v-else class="mt-4">
        <label for="output-name" class="block text-xs font-medium text-slate-600">Name</label>
        <input id="output-name" :value="draft.local.name" type="text" autocomplete="off" placeholder="e.g. Person summary" :class="[control, 'mt-1 w-full']" @input="update({ local: { ...draft.local, name: ($event.target as HTMLInputElement).value } })">
        <p class="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-amber-200">
          This is a contract.
          <template v-if="target.isNew">Applying freezes it as {{ draft.local.name || 'the output' }} v{{ target.definition.version }} and starts a Mapping for it<template v-if="latestLocal">; v{{ latestLocal.version }} stays exactly as it was</template>.</template>
          <template v-else>It matches v{{ target.definition.version }}, already frozen. Changing it makes a new version when applied.</template>
        </p>

        <ul class="mt-3 flex flex-col gap-2" aria-label="Its properties">
          <li v-for="(f, i) in fields" :key="i" :data-structure-row="i" class="rounded-2xl bg-white p-3 ring-1 ring-slate-200">
            <div class="flex flex-wrap items-end gap-2">
              <label class="flex min-w-0 flex-1 flex-col gap-1 text-xs font-medium text-slate-600">
                Property name
                <input :value="f.name" type="text" autocomplete="off" spellcheck="false" placeholder="propertyName" :class="[control, 'font-mono']" @input="rename(i, ($event.target as HTMLInputElement).value)">
              </label>
              <label class="flex flex-col gap-1 text-xs font-medium text-slate-600">
                Type
                <select :value="f.type" :class="control" :aria-label="`Type of ${f.name || 'this property'}`" @change="retype(i, ($event.target as HTMLSelectElement).value as FieldType)">
                  <option value="string">text</option>
                  <option value="number">number</option>
                  <option value="boolean">yes or no</option>
                </select>
              </label>
              <button type="button" class="link pb-2 text-sm" :aria-label="`Remove the property ${f.name || '(no name)'} and its mapping`" @click="removeField(i)">Remove</button>
            </div>
            <p class="mt-1.5 truncate text-xs text-slate-500">
              <template v-if="f.name && mappingOf(f.name)">← {{ mappingOf(f.name) }}</template>
              <template v-else>Not mapped yet</template>
            </p>
          </li>
        </ul>
        <button
          type="button"
          class="mt-2 flex w-full items-center justify-center gap-1.5 rounded-2xl border border-dashed border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:border-accent-300 hover:bg-accent-50 hover:text-accent-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
          @click="addField"
        >
          <span aria-hidden="true">+</span> Add output property
        </button>
      </div>
      <ul v-if="structure.length" class="mt-2 flex flex-col gap-0.5 text-sm text-red-700">
        <li v-for="p in structure" :key="p">{{ p }}</li>
      </ul>
    </section>

    <section v-if="review.extras.length" aria-labelledby="extras-heading" class="mt-5 rounded-2xl bg-amber-50/70 p-4 ring-1 ring-amber-200">
      <div class="flex items-baseline gap-3">
        <h4 id="extras-heading" class="mr-auto text-sm font-semibold text-slate-900">Mappings with no property to fill</h4>
        <button v-if="review.extras.length > 1" type="button" class="link text-sm" @click="update({ properties: properties.filter((_, i) => !review.extras.some((x) => x.index === i)) })">Remove all {{ review.extras.length }}</button>
      </div>
      <p class="mt-0.5 text-xs text-slate-600">Kept exactly as they are, in case you want them back. {{ target.label }} has no place for them.</p>
      <ul class="mt-3 flex flex-col gap-3">
        <li v-for="x in review.extras" :key="x.index" class="flex items-start gap-3">
          <div class="min-w-0 flex-1">
            <p class="text-sm text-slate-800"><span class="font-mono font-semibold">{{ properties[x.index]!.name || 'Unnamed' }}</span> ← {{ describeSource(fromPiece(properties[x.index]!.piece)) }}</p>
            <p class="text-xs text-amber-800">{{ x.reason }}</p>
          </div>
          <button type="button" class="link shrink-0 text-sm" :aria-label="`Remove the mapping for ${properties[x.index]!.name || 'the unnamed value'}`" @click="update({ properties: removeAt(properties, x.index) })">Remove</button>
        </li>
      </ul>
    </section>
    <details v-if="aside.length" class="mt-4 rounded-2xl bg-slate-50 px-4 py-3 ring-1 ring-slate-200/80">
      <summary class="cursor-pointer text-sm text-slate-700">
        {{ aside.length === 1 ? 'One earlier mapping is' : `${aside.length} earlier mappings are` }} set aside
      </summary>
      <p class="mt-1 text-xs text-slate-500">
        They don’t fit {{ target.label }}, so they aren’t part of this draft and won’t be applied. They’re kept as they are and come back if you choose a Definition they fit again.
      </p>
      <ul class="mt-2 flex flex-col gap-2">
        <li v-for="(x, i) in aside" :key="i" class="text-sm text-slate-700">
          <span class="font-mono font-semibold">{{ x.name }}</span> ← {{ x.source }}
          <span class="block text-xs text-slate-500">{{ x.reason }}</span>
        </li>
      </ul>
    </details>
    <p class="mt-4 font-mono text-xs text-slate-400">{{ shapeOf(target.definition) }}</p>
  </div>
</template>
