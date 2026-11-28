<script setup lang="ts">
// General: the Mapping's contracts, top to bottom in the order information flows. Input: the exact
// Definition version the Mapping reads, read-only, beside what reaches the Transform along its
// connections (a Transform doesn't choose what it's sent; nothing here reconciles the two). Then
// what to create, and the output's structure inside that choice: an existing Definition version,
// used as it is, or the Transform's own output, whose properties are added, renamed, retyped and
// removed here. Changing the output changes a contract (Apply freezes a new Definition version and
// gives it a new Mapping). Read-only contracts are compact overviews (ContractOverview): a large one
// shows what it holds first and its structure on demand, so the output stays close at any size.
import { type DefinitionRef, type DefinitionVersion, type FieldType, sameDefinition } from '#shared/features/definitions'
import { DEFINITIONS, WORKSPACE, definitionLabel } from '../features/experiment'
import { type Configuration, type TransformDraft, catalogue, inputIn, inputOf, labelOf, outputOf, scopeOf } from './config'
import DesignerIcon from './DesignerIcon.vue'
import ContractOverview from './ContractOverview.vue'
import { FLAT, READING } from './reading'
import { asideReason, reconcile } from './switching'
import { DESIGNER_WORKSPACE, definitionsPath, runsIn } from '../definitions/designer'
import { fromPiece, removeAt, replaceAt } from './parts'
import type { DraftReview } from './preview'
import { type IncomingView, inputTree } from './studio'
import { describeSource } from './summary'

const props = defineProps<{
  draft: TransformDraft
  config: Configuration
  target: { definition: DefinitionVersion; label: string; isNew: boolean }
  structure: readonly string[]
  review: DraftReview
  /** The Definition version the draft reads. */
  input: DefinitionVersion
  /** What reaches the Transform along its connections. */
  incoming: IncomingView
  /** The input Definition version can't be resolved here: said so, never shown as empty. */
  inputUnresolved?: boolean
}>()
const emit = defineEmits<{ 'update:draft': [TransformDraft] }>()
const update = (next: Partial<TransformDraft>) => emit('update:draft', { ...props.draft, ...next })

const keyOf = (ref: DefinitionRef) => `${ref.id}@${ref.version}`
// Mappings are judged as the Transform version the step invokes reads them.
const reading = inject(READING, ref(FLAT))
const versionWords = (ref: DefinitionRef) => `${reading.value.resolve(ref)?.name ?? ref.id} · v${ref.version}`
/** Choosing another output: its properties at once, with mappings that fit it and nothing else. */
function switchTo(next: Partial<TransformDraft>) {
  const draft = { ...props.draft, ...next }
  // Resolved as the step resolves them (scopeOf): what can't be resolved here has no properties to fit.
  const scope = scopeOf(props.config, runsIn(workspace))
  emit('update:draft', reconcile(draft, inputIn(draft, scope).definition, outputOf(props.config, draft, scope).definition, reading.value))
}

// --- Input: what the Mapping reads, and what reaches the Transform ---
const reads = computed(() => inputOf(props.draft))
const readsLabel = computed(() => labelOf(props.config, reads.value))
const inputs = computed(() => inputTree(props.input, reading.value))
/** matches, differs, unknown (connected, nothing known reaches it) or none (not connected). */
const relation = computed(() => {
  const { step, ref } = props.incoming
  if (!step) return 'none'
  if (!ref) return 'unknown'
  return sameDefinition(ref, reads.value) ? 'matches' : 'differs'
})

// --- Output ---
/** What can be chosen: the catalogue, as far as the step's workspace resolves it (scopeOf). */
const choosable = computed(() => { const { resolve } = scopeOf(props.config, runsIn(workspace)); return catalogue(props.config.offered).filter((d) => resolve(d) !== null) })
function setCatalogue(key: string) {
  const d = choosable.value.find((x) => keyOf(x) === key)
  if (d) switchTo({ catalogue: { id: d.id, version: d.version } })
}
const outputs = computed(() => inputTree(props.target.definition, reading.value))
const aside = computed(() => (props.draft.aside ?? []).map((p) => ({
  name: p.name || 'Unnamed', source: describeSource(fromPiece(p.piece)), reason: asideReason(p, props.input, props.target.definition, props.target.label, reading.value),
})))
// What can be chosen, by where it comes from (Experiment #7). Only what this workspace may use:
// another workspace's Definitions aren't listed at all, not even disabled.
const workspace = inject(DESIGNER_WORKSPACE, null)
// Only what the step's workspace resolves (the authority's rule, scopeOf), whatever was offered.
const usable = computed(() => { const { resolve } = scopeOf(props.config, runsIn(workspace)); return (props.config.offered ?? []).filter((o) => resolve(o.definition) !== null) })
const made = computed(() => usable.value.filter((o) => o.source === 'workspace').map((o) => o.definition))
const provided = computed(() => usable.value.filter((o) => o.source === 'orbit').map((o) => o.definition))
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
const panel = 'rounded-3xl bg-white p-5 ring-1 ring-slate-200/80 sm:p-6'
const eyebrow = 'text-[11px] font-semibold tracking-wide text-slate-500 uppercase'
const card = 'flex w-full cursor-pointer items-start gap-2.5 rounded-2xl p-3 text-left ring-1 transition'
const control = 'rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-xs outline-none transition focus:border-accent-500 focus:ring-2 focus:ring-accent-100'
</script>

<template>
  <div ref="root" class="flex flex-col">
    <!-- Input: what the Mapping reads, read-only, and where it comes from -->
    <section :class="panel" aria-labelledby="input-heading" data-general-input>
      <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div class="min-w-0 flex-1">
          <h2 id="input-heading" :class="eyebrow">Input</h2>
          <p class="mt-1 text-base font-semibold text-slate-900" data-input-pinned>{{ readsLabel }}</p>
        </div>
        <p
          class="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1"
          :class="{
            'bg-accent-50 text-accent-800 ring-accent-200': relation === 'matches',
            'bg-amber-50 text-amber-900 ring-amber-200': relation === 'differs',
            'bg-slate-50 text-slate-600 ring-slate-200': relation === 'unknown' || relation === 'none',
          }"
          :data-input-relation="relation"
        >
          <DesignerIcon v-if="relation === 'matches'" name="check" class="size-3.5" />
          <DesignerIcon v-else-if="relation === 'differs'" name="error" class="size-3.5" />
          <template v-if="relation === 'none'">Not connected</template>
          <template v-else>From {{ incoming.step }}</template>
        </p>
      </div>
      <p v-if="relation === 'differs'" class="mt-2 text-xs text-amber-900" data-input-differs>{{ incoming.step }} hands on {{ labelOf(config, incoming.ref!) }}. This Mapping reads {{ readsLabel }} and stays as it is.</p>
      <p v-else-if="relation === 'unknown'" class="mt-2 text-xs text-slate-500">Nothing known reaches {{ incoming.step }} yet.</p>
      <div class="mt-4 border-t border-slate-100 pt-3">
        <ContractOverview v-if="inputs.length" :nodes="inputs" :label="versionWords" :name="readsLabel" />
        <p v-else class="text-sm" :class="inputUnresolved ? 'text-red-700' : 'text-slate-500'">{{ inputUnresolved ? 'It can’t be found here.' : 'It has no properties.' }}</p>
      </div>
    </section>

    <div class="flex justify-center py-2 text-slate-300" aria-hidden="true">
      <DesignerIcon name="chevron" class="size-5 rotate-90" />
    </div>

    <!-- What to create, and the output's structure inside that choice -->
    <section :class="panel" aria-labelledby="create-heading" data-general-output>
      <h2 id="create-heading" :class="eyebrow">What do you want to create?</h2>
      <div class="mt-3 grid gap-2 sm:grid-cols-2" role="radiogroup" aria-labelledby="create-heading">
        <label :class="[card, draft.use === 'catalogue' ? 'bg-accent-50/70 ring-accent-300' : 'bg-white ring-slate-200 hover:bg-slate-50']">
          <input type="radio" name="output-use" class="mt-0.5 accent-accent-600" :checked="draft.use === 'catalogue'" @change="switchTo({ use: 'catalogue' })">
          <span><span class="block text-sm font-medium text-slate-900">An existing Definition</span><span class="block text-xs text-slate-500">Shared, used as it is</span></span>
        </label>
        <label :class="[card, draft.use === 'local' ? 'bg-accent-50/70 ring-accent-300' : 'bg-white ring-slate-200 hover:bg-slate-50']">
          <input type="radio" name="output-use" class="mt-0.5 accent-accent-600" :checked="draft.use === 'local'" @change="switchTo({ use: 'local' })">
          <span><span class="block text-sm font-medium text-slate-900">A custom output</span><span class="block text-xs text-slate-500">Shaped here, for this Transform</span></span>
        </label>
      </div>

      <div v-if="draft.use === 'catalogue'" class="mt-5" data-output-existing>
        <label for="output-definition" :class="eyebrow">Output</label>
        <select id="output-definition" :value="keyOf(draft.catalogue)" :class="[control, 'mt-1.5 w-full']" @change="setCatalogue(($event.target as HTMLSelectElement).value)">
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
        <p class="mt-1.5 text-xs text-slate-500">
          <template v-if="chosenSource === 'workspace' && workspace">Made in <NuxtLink :to="definitionsPath(workspace.id, draft.catalogue.id, draft.catalogue.version)" class="link">{{ workspace.name }}’s Definitions</NuxtLink>; it can’t change here.</template>
          <template v-else-if="chosenSource === 'orbit'">Provided by Orbit; nobody in a workspace can change it.</template>
          <template v-else>Shared; it can’t change here.</template>
          <template v-if="workspace && chosenSource !== 'workspace'"> Definitions are made in <NuxtLink :to="definitionsPath(workspace.id)" class="link">{{ workspace.name }}’s Definitions</NuxtLink>.</template>
        </p>
        <div class="mt-3 border-t border-slate-100 pt-3" data-output-properties>
          <ContractOverview v-if="outputs.length" :nodes="outputs" :label="versionWords" :name="target.label" plain />
          <p v-else class="text-sm text-slate-500">{{ target.label }} has no properties.</p>
        </div>
      </div>

      <div v-else class="mt-5" data-output-custom>
        <label for="output-name" :class="eyebrow">Output name</label>
        <input id="output-name" :value="draft.local.name" type="text" autocomplete="off" placeholder="e.g. Person summary" :class="[control, 'mt-1.5 w-full']" @input="update({ local: { ...draft.local, name: ($event.target as HTMLInputElement).value } })">
        <p class="mt-1.5 text-xs text-amber-800">
          This is a contract.
          <template v-if="target.isNew">Apply freezes it as {{ draft.local.name || 'the output' }} v{{ target.definition.version }}<template v-if="latestLocal">; v{{ latestLocal.version }} stays as it was</template>.</template>
          <template v-else>It matches v{{ target.definition.version }}; changing it makes a new version.</template>
        </p>

        <ul class="mt-4 flex flex-col gap-2" aria-label="Its properties">
          <li v-for="(f, i) in fields" :key="i" :data-structure-row="i" class="rounded-2xl bg-slate-50/70 p-3 ring-1 ring-slate-200">
            <div class="flex flex-wrap items-end gap-2">
              <label class="flex min-w-0 flex-1 basis-40 flex-col gap-1 text-xs font-medium text-slate-600">
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

      <section v-if="review.extras.length" aria-labelledby="extras-heading" class="mt-5 rounded-2xl bg-amber-50/70 p-4 ring-1 ring-amber-200">
        <div class="flex items-baseline gap-3">
          <h3 id="extras-heading" class="mr-auto text-sm font-semibold text-slate-900">Mappings with no property to fill</h3>
          <button v-if="review.extras.length > 1" type="button" class="link text-sm" @click="update({ properties: properties.filter((_, i) => !review.extras.some((x) => x.index === i)) })">Remove all {{ review.extras.length }}</button>
        </div>
        <p class="mt-0.5 text-xs text-slate-600">Kept as they are. {{ target.label }} has no place for them.</p>
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
        <p class="mt-1 text-xs text-slate-500">They don’t fit {{ target.label }} and won’t be applied. They come back if you choose a Definition they fit again.</p>
        <ul class="mt-2 flex flex-col gap-2">
          <li v-for="(x, i) in aside" :key="i" class="text-sm text-slate-700">
            <span class="font-mono font-semibold">{{ x.name }}</span> ← {{ x.source }}
            <span class="block text-xs text-slate-500">{{ x.reason }}</span>
          </li>
        </ul>
      </details>
    </section>
  </div>
</template>
