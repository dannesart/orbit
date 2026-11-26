<script setup lang="ts">
// Building an output object, property by property (Transform v3): a local object, or a value of
// exactly the referenced Definition version. Its presence is explicit:
//   required  always built
//   optional  left out, always built, or built when a source object is present
// Then its own properties, each a value (the focused editor's own value editor) or, deeper, another
// object built the same way. Whether it all fits is the domain's check (the review's issues, at
// their exact paths); inside an object built when a source object is present, the value pickers
// apply that guarantee with the domain's own rule (GUARANTEED). Nothing here decides availability.
import { type DefinitionRef, type DefinitionVersion, type Field, type PropertyPath, isScalarField, propertyPathWords } from '#shared/features/definitions'
import { type Path, type Presence, objectPaths } from '#shared/features/mappings'
import DefinitionsIcon from '../definitions/DefinitionsIcon.vue'
import ConstructionEditor from './ConstructionEditor.vue'
import ValueSlot from './ValueSlot.vue'
import type { DraftProperty, Piece } from './parts'
import { type Example, friendlyIssue } from './preview'
import { FLAT, GUARANTEED, READING, type ReviewIssue } from './reading'

type Construct = Extract<Piece, { kind: 'construct' }>
const props = defineProps<{
  piece: Construct | null
  /** The output property being built, as its contract has it (a local object or a reference). */
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
/** The exact version a reference names, by its own (publication-time) name. */
const versionWords = (ref: DefinitionRef) => `${reading.value.resolve(ref)?.name ?? ref.id} · v${ref.version}`
const fields = computed<readonly Field[] | null>(() => {
  if (props.target.type === 'object') return props.target.fields
  if (props.target.type === 'reference') return reading.value.resolve(props.target.definition)?.fields ?? null
  return null
})

// --- Presence ---
const mode = computed(() => (!props.piece ? 'out' : props.piece.presence.when))
const sources = computed(() => objectPaths(props.input, reading.value.resolve))
const keyOf = (p: PropertyPath) => JSON.stringify(p)
function build(presence: Presence) {
  emit('set', { kind: 'construct', presence, properties: props.piece?.properties ?? [] })
}
function choose(next: 'out' | 'always' | 'present') {
  if (next === 'out') return emit('set', null)
  if (next === 'always') return build({ when: 'always' })
  const first = sources.value[0]
  if (first) build({ when: 'present', source: first.path })
}
// Inside, the condition's source object is known to be present (and so is everything on its way).
provide(GUARANTEED, computed(() => (props.piece?.presence.when === 'present' ? [...inherited.value, props.piece.presence.source] : inherited.value)))

// --- Its properties ---
const childOf = (name: string) => props.piece?.properties.find((p) => p.name === name)?.piece ?? null
function setChild(name: string, next: Piece | null) {
  if (!props.piece) return
  const rest = props.piece.properties.filter((p) => p.name !== name)
  const at = props.piece.properties.findIndex((p) => p.name === name)
  const properties: DraftProperty[] = next === null ? rest : at < 0 ? [...props.piece.properties, { name, piece: next }] : props.piece.properties.map((p) => (p.name === name ? { name, piece: next } : p))
  emit('set', { ...props.piece, properties })
}
const extras = computed(() => (props.piece?.properties ?? []).filter((p) => !fields.value?.some((f) => f.name === p.name)))
const same = (a: Path, b: Path) => a.length === b.length && a.every((x, i) => x === b[i])
/** Problems about exactly this place: the object itself, its presence, or a property of it that has no value. */
const here = (at: Path) => props.issues.filter((i) => same(i.path, at)).map(friendlyIssue)
const own = computed(() => [...here(props.path), ...here([...props.path, 'presence'])])
const typeWords: Record<string, string> = { string: 'text', number: 'number', boolean: 'yes or no', object: 'object', reference: 'Definition' }
const segment = 'rounded-full px-3 py-1 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500'
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

    <div class="mt-3">
      <p v-if="!optional" class="text-sm text-slate-700">
        Always built<span class="text-slate-500">: it’s required.</span>
        <button v-if="!piece" type="button" class="btn-primary ml-2 w-auto rounded-full px-3 py-1 text-xs" data-build @click="build({ when: 'always' })">Build it</button>
      </p>
      <div v-else class="flex flex-wrap items-center gap-2">
        <div class="flex rounded-full bg-slate-100 p-0.5" role="radiogroup" :aria-label="`When ${propertyPathWords(path.map(String))} is made`" data-presence>
          <button v-for="m in (['out', 'always', 'present'] as const)" :key="m" type="button" role="radio" :aria-checked="mode === m" :disabled="m === 'present' && !sources.length" :class="[segment, mode === m ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900 disabled:opacity-40']" :data-presence-mode="m" @click="choose(m)">
            {{ m === 'out' ? 'Leave out' : m === 'always' ? 'Always' : 'When present' }}
          </button>
        </div>
        <label v-if="piece?.presence.when === 'present'" class="flex items-center gap-1.5 text-xs text-slate-600">
          built when
          <select :value="keyOf(piece.presence.source)" class="rounded-lg border border-slate-200 bg-white py-1 pr-7 pl-2 font-mono text-xs text-slate-800 outline-none focus:border-accent-500 focus:ring-2 focus:ring-accent-100" data-presence-source @change="build({ when: 'present', source: JSON.parse(($event.target as HTMLSelectElement).value) })">
            <option v-for="s in sources" :key="keyOf(s.path)" :value="keyOf(s.path)">{{ propertyPathWords(s.path) }}{{ s.optional.length ? '' : ' (always there)' }}</option>
          </select>
          is present
        </label>
      </div>
      <p v-if="optional && !piece" class="mt-1.5 text-xs text-slate-500">Left out: the output won’t have it.</p>
      <ul v-if="own.length" class="mt-1.5 flex flex-col gap-0.5 text-sm text-red-700">
        <li v-for="p in own" :key="p">{{ p }}</li>
      </ul>
    </div>

    <!-- Its properties, as its contract has them -->
    <ul v-if="piece && fields" class="mt-3 flex flex-col gap-3 border-l-2 pl-4" :class="target.type === 'reference' ? 'border-dashed border-slate-200' : 'border-slate-100'">
      <li v-for="f in fields" :key="f.name" :data-construction-property="[...path, f.name].join(' › ')">
        <div class="mb-1.5 flex flex-wrap items-baseline gap-2">
          <span class="font-mono text-sm font-semibold text-slate-900">{{ f.name }}</span>
          <span class="text-xs text-slate-500">{{ typeWords[f.type] }}</span>
          <span class="text-xs" :class="f.optional === true ? 'text-slate-400' : 'text-slate-500'">{{ f.optional === true ? 'optional' : 'required' }}</span>
          <button v-if="isScalarField(f) && childOf(f.name)" type="button" class="link ml-auto text-xs text-slate-500" :aria-label="`Clear ${f.name}’s value`" @click="setChild(f.name, null)">Clear</button>
        </div>
        <ConstructionEditor
          v-if="!isScalarField(f)"
          :piece="(childOf(f.name)?.kind === 'construct' ? childOf(f.name) : null) as Construct | null"
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
    <p v-else-if="piece && !fields" class="mt-2 text-sm text-amber-800">{{ target.type === 'reference' ? `${versionWords(target.definition)} can’t be found here.` : '' }}</p>
    <p v-if="piece && !piece.properties.length && fields?.every((f) => f.optional === true)" class="mt-2 text-xs text-slate-500">Nothing in it yet: it’s made empty, which its contract allows.</p>
  </div>
</template>
