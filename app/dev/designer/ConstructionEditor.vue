<script setup lang="ts">
// Making an output object (Transform v3): a local object, or a value of exactly the referenced
// Definition version.
//
// A referenced value is made one of two explicitly different ways, chosen on purpose and never
// switched silently:
//   build  property by property, as below
//   copy   a whole value of exactly the same Definition version, from the input (Phase 4.4)
// A local object has no identity to match, so it is only ever built.
//
// Building: its presence is explicit (required: always built; optional: left out, always built, or
// built when a chosen source object is present), then its own properties, each a value (the focused
// editor's own value editor) or, deeper, another object made the same way.
//
// Whether it all fits is the domain's check (the review's issues, at their exact paths); inside an
// object built when a source object is present, the value pickers apply that guarantee with the
// domain's own rule (GUARANTEED). What may be copied, and whether it may be absent, comes from the
// contract (objectPaths, notGuaranteed). Nothing here decides compatibility or availability.
import { type DefinitionRef, type DefinitionVersion, type Field, type PropertyPath, isScalarField, propertyPathWords, refOf, sameDefinition } from '#shared/features/definitions'
import { type Path, type Presence, notGuaranteed, objectPaths } from '#shared/features/mappings'
import DefinitionsIcon from '../definitions/DefinitionsIcon.vue'
import ConstructionEditor from './ConstructionEditor.vue'
import ValueSlot from './ValueSlot.vue'
import type { DraftProperty, Piece } from './parts'
import { type Example, friendlyIssue } from './preview'
import { FLAT, GUARANTEED, READING, type ReviewIssue, absenceWords } from './reading'

type Construct = Extract<Piece, { kind: 'construct' }>
type Copy = Extract<Piece, { kind: 'copy' }>
const props = defineProps<{
  piece: Construct | Copy | null
  /** The output property being made, as its contract has it (a local object or a reference). */
  target: Field
  /** Its place in the output, outermost first. */
  path: Path
  /** All of the top-level property's problems; each shown where it belongs. */
  issues: readonly ReviewIssue[]
  input: DefinitionVersion
  example: Example
}>()
const emit = defineEmits<{ set: [Piece | null] }>()

const reading = inject(READING, ref(FLAT))
const inherited = inject(GUARANTEED, ref<readonly PropertyPath[]>([]))
const optional = computed(() => props.target.optional === true)
const isReference = computed(() => props.target.type === 'reference')
/** The exact version a reference names, by its own (publication-time) name. */
const versionWords = (ref: DefinitionRef) => `${reading.value.resolve(ref)?.name ?? ref.id} · v${ref.version}`
const fields = computed<readonly Field[] | null>(() => {
  if (props.target.type === 'object') return props.target.fields
  if (props.target.type === 'reference') return reading.value.resolve(props.target.definition)?.fields ?? null
  return null
})
const built = computed(() => (props.piece?.kind === 'construct' ? props.piece : null))
const copied = computed(() => (props.piece?.kind === 'copy' ? props.piece : null))

// --- Build or copy (references only): chosen on purpose; the other way's work is kept while switching here ---
const way = computed(() => (!props.piece ? 'out' : props.piece.kind))
const kept = { construct: null as Construct | null, copy: null as Copy | null }
function useWay(next: 'out' | 'construct' | 'copy') {
  if (built.value) kept.construct = built.value
  if (copied.value) kept.copy = copied.value
  if (next === 'out') return emit('set', null)
  if (next === 'construct') return emit('set', kept.construct ?? { kind: 'construct', presence: { when: 'always' }, properties: [] })
  // What to copy is chosen on purpose: nothing until then (draft work, refused by the check).
  emit('set', kept.copy ?? { kind: 'copy', from: null })
}

// --- Presence (building) ---
const mode = computed(() => (!built.value ? 'out' : built.value.presence.when))
const sources = computed(() => objectPaths(props.input, reading.value.resolve))
const keyOf = (p: PropertyPath) => JSON.stringify(p)
function build(presence: Presence) {
  emit('set', { kind: 'construct', presence, properties: built.value?.properties ?? [] })
}
function choose(next: 'out' | 'always' | 'present') {
  if (next === 'out') return emit('set', null)
  if (next === 'always') return build({ when: 'always' })
  // Which source object is chosen on purpose: none until then (draft work, refused by the check).
  if (built.value?.presence.when !== 'present') build({ when: 'present', source: [] })
}
// Inside, the condition's source object is known to be present (and so is everything on its way).
provide(GUARANTEED, computed(() => (built.value?.presence.when === 'present' ? [...inherited.value, built.value.presence.source] : inherited.value)))

// --- Copying: every referenced value in the input (and the input itself), with its exact version ---
const candidates = computed(() => [
  { path: [] as PropertyPath, definition: refOf(props.input), optional: [] as readonly PropertyPath[] },
  ...objectPaths(props.input, reading.value.resolve).filter((o) => o.definition).map((o) => ({ path: o.path, definition: o.definition!, optional: o.optional })),
].map((c) => {
  const wanted = props.target.type === 'reference' ? props.target.definition : null
  const fits = !!wanted && sameDefinition(c.definition, wanted)
  const why = fits || !wanted ? '' : c.definition.id === wanted.id ? 'another version' : 'another Definition'
  return { ...c, fits, why, absence: absenceWords(notGuaranteed(c.optional, inherited.value)) }
}))
const candidateWords = (c: { path: PropertyPath; definition: DefinitionRef }) => `${c.path.length ? propertyPathWords(c.path) : 'The whole input'} · ${versionWords(c.definition)}`
const copyFrom = (key: string) => emit('set', { kind: 'copy', from: JSON.parse(key) })

// --- Its properties (building) ---
const childOf = (name: string) => built.value?.properties.find((p) => p.name === name)?.piece ?? null
const objectChild = (name: string) => { const c = childOf(name); return c?.kind === 'construct' || c?.kind === 'copy' ? c : null }
function setChild(name: string, next: Piece | null) {
  const piece = built.value
  if (!piece) return
  const rest = piece.properties.filter((p) => p.name !== name)
  const at = piece.properties.findIndex((p) => p.name === name)
  const properties: DraftProperty[] = next === null ? rest : at < 0 ? [...piece.properties, { name, piece: next }] : piece.properties.map((p) => (p.name === name ? { name, piece: next } : p))
  emit('set', { ...piece, properties })
}
const extras = computed(() => (built.value?.properties ?? []).filter((p) => !fields.value?.some((f) => f.name === p.name)))
const same = (a: Path, b: Path) => a.length === b.length && a.every((x, i) => x === b[i])
/** Problems about exactly this place: the object itself, its presence, or a property of it that has no value. */
const here = (at: Path) => props.issues.filter((i) => same(i.path, at)).map(friendlyIssue)
const own = computed(() => [...here(props.path), ...here([...props.path, 'presence'])])
const typeWords: Record<string, string> = { string: 'text', number: 'number', boolean: 'yes or no', object: 'object', reference: 'Definition' }
const segment = 'rounded-full px-3 py-1 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500'
const control = 'rounded-lg border border-slate-200 bg-white py-1 pr-7 pl-2 font-mono text-xs text-slate-800 outline-none focus:border-accent-500 focus:ring-2 focus:ring-accent-100'
</script>

<template>
  <div class="min-w-0" :data-construction="path.join(' › ')">
    <!-- What it is, and whether it's made -->
    <div class="flex flex-wrap items-center gap-2 text-xs text-slate-500">
      <DefinitionsIcon :name="target.type === 'reference' ? 'reference' : 'object'" class="size-3.5 text-accent-500" />
      <span v-if="target.type === 'reference'" class="font-medium text-slate-700">{{ versionWords(target.definition) }}</span>
      <span v-else>A local object</span>
      <span class="rounded-full px-2 py-0.5 ring-1" :class="optional ? 'text-slate-500 ring-slate-200' : 'text-accent-700 ring-accent-200'">{{ optional ? 'Optional' : 'Required' }}</span>
    </div>

    <!-- A referenced value: built, or copied whole. Two different operations, chosen on purpose. -->
    <div v-if="isReference" class="mt-3 flex rounded-full bg-slate-100 p-0.5 w-fit" role="radiogroup" :aria-label="`How ${propertyPathWords(path.map(String))} is made`" data-way>
      <button v-for="w in (optional ? ['out', 'construct', 'copy'] as const : ['construct', 'copy'] as const)" :key="w" type="button" role="radio" :aria-checked="way === w" :class="[segment, way === w ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900']" :data-way-mode="w" @click="useWay(w)">
        {{ w === 'out' ? 'Leave out' : w === 'construct' ? 'Build it' : 'Copy a whole value' }}
      </button>
    </div>

    <!-- Copying: what, by its exact version; anything else is shown and can't be chosen -->
    <div v-if="copied" class="mt-3" data-copy>
      <label class="flex flex-wrap items-center gap-1.5 text-xs text-slate-600">
        Copy
        <select :value="copied.from ? keyOf(copied.from) : ''" :class="control" data-copy-source @change="copyFrom(($event.target as HTMLSelectElement).value)">
          <option value="" disabled>Choose a value to copy…</option>
          <option v-for="c in candidates" :key="keyOf(c.path)" :value="keyOf(c.path)" :disabled="!c.fits">{{ candidateWords(c) }}{{ c.fits ? (c.absence ? ` · ${c.absence}` : '') : ` · ${c.why}, can’t be copied` }}</option>
        </select>
      </label>
      <p class="mt-1.5 text-xs text-slate-500">
        Only a value of exactly {{ versionWords((target as Extract<Field, { type: 'reference' }>).definition) }} can be copied: copied as it is, with nothing rebuilt or filled in.
        <template v-if="!candidates.some((c) => c.fits)"> Nothing in {{ versionWords(refOf(input)) }} is, so build it instead.</template>
      </p>
      <ul v-if="own.length" class="mt-1.5 flex flex-col gap-0.5 text-sm text-red-700">
        <li v-for="p in own" :key="p">{{ p }}</li>
      </ul>
    </div>

    <p v-else-if="isReference && !piece && !optional" class="mt-1.5 text-xs text-amber-700">Required: build it, or copy a whole value.</p>
    <div v-else-if="!isReference || built" class="mt-3">
      <p v-if="!optional" class="text-sm text-slate-700">
        Always built<span class="text-slate-500">: it’s required.</span>
        <button v-if="!piece" type="button" class="btn-primary ml-2 w-auto rounded-full px-3 py-1 text-xs" data-build @click="build({ when: 'always' })">Build it</button>
      </p>
      <div v-else class="flex flex-wrap items-center gap-2">
        <div class="flex rounded-full bg-slate-100 p-0.5" role="radiogroup" :aria-label="`When ${propertyPathWords(path.map(String))} is made`" data-presence>
          <button v-for="m in (isReference ? ['always', 'present'] as const : ['out', 'always', 'present'] as const)" :key="m" type="button" role="radio" :aria-checked="mode === m" :disabled="m === 'present' && !sources.length" :class="[segment, mode === m ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900 disabled:opacity-40']" :data-presence-mode="m" @click="choose(m)">
            {{ m === 'out' ? 'Leave out' : m === 'always' ? 'Always' : 'When present' }}
          </button>
        </div>
        <label v-if="built?.presence.when === 'present'" class="flex items-center gap-1.5 text-xs text-slate-600">
          built when
          <select :value="built.presence.source.length ? keyOf(built.presence.source) : ''" :class="control" data-presence-source @change="build({ when: 'present', source: JSON.parse(($event.target as HTMLSelectElement).value) })">
            <option value="" disabled>Choose a source object…</option>
            <option v-for="s in sources" :key="keyOf(s.path)" :value="keyOf(s.path)">{{ propertyPathWords(s.path) }}{{ s.optional.length ? '' : ' (always there)' }}</option>
          </select>
          is present
        </label>
      </div>
      <ul v-if="own.length" class="mt-1.5 flex flex-col gap-0.5 text-sm text-red-700">
        <li v-for="p in own" :key="p">{{ p }}</li>
      </ul>
    </div>
    <p v-if="optional && !piece" class="mt-1.5 text-xs text-slate-500">Left out: the output won’t have it.</p>

    <!-- Its properties, as its contract has them -->
    <ul v-if="built && fields" class="mt-3 flex flex-col gap-3 border-l-2 pl-4" :class="target.type === 'reference' ? 'border-dashed border-slate-200' : 'border-slate-100'">
      <li v-for="f in fields" :key="f.name" :data-construction-property="[...path, f.name].join(' › ')">
        <div class="mb-1.5 flex flex-wrap items-baseline gap-2">
          <span class="font-mono text-sm font-semibold text-slate-900">{{ f.name }}</span>
          <span class="text-xs text-slate-500">{{ typeWords[f.type] }}</span>
          <span class="text-xs" :class="f.optional === true ? 'text-slate-400' : 'text-slate-500'">{{ f.optional === true ? 'optional' : 'required' }}</span>
          <button v-if="isScalarField(f) && childOf(f.name)" type="button" class="link ml-auto text-xs text-slate-500" :aria-label="`Clear ${f.name}’s value`" @click="setChild(f.name, null)">Clear</button>
        </div>
        <ConstructionEditor
          v-if="!isScalarField(f)"
          :piece="objectChild(f.name)"
          :target="f"
          :path="[...path, f.name]"
          :issues="issues"
          :input="input"
          :example="example"
          @set="setChild(f.name, $event)"
        />
        <ValueSlot v-else :piece="childOf(f.name)" :type="f.type" :path="[...path, f.name]" :issues="issues" :input="input" :example="example" :label="[...path, f.name].join(' › ')" @set="setChild(f.name, $event)" />
        <ul v-if="isScalarField(f) && !childOf(f.name) && here([...path, f.name]).length" class="mt-1 flex flex-col gap-0.5 text-sm" :class="f.optional === true ? 'text-slate-500' : 'text-amber-700'">
          <li v-for="p in here([...path, f.name])" :key="p">{{ p }}</li>
        </ul>
      </li>
      <li v-for="x in extras" :key="`extra-${x.name}`" class="text-sm text-amber-800">
        {{ x.name }}: {{ here([...path, x.name])[0] ?? 'not part of this object' }}
        <button type="button" class="link ml-2 text-xs" @click="setChild(x.name, null)">Remove</button>
      </li>
    </ul>
    <p v-else-if="built && !fields" class="mt-2 text-sm text-amber-800">{{ target.type === 'reference' ? `${versionWords(target.definition)} can’t be found here.` : '' }}</p>
    <p v-if="built && !built.properties.length && fields?.every((f) => f.optional === true)" class="mt-2 text-xs text-slate-500">Nothing in it yet: it’s made empty, which its contract allows.</p>
  </div>
</template>
