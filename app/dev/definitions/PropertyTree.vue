<script setup lang="ts">
// One level of the model (the top level, or one local object's properties) and, inside each object
// on it, the next level: the same rows, the same editor, all the way down. Each level is its own
// drop target, lit up only while something is over it, so where a drop will land is never a guess.
// The builder (ModelBuilder.vue) owns the draft and every action; a level only shows and asks.
//
// A reference shows the Definition it names, with its icon, colour and exact version, and unfolds to
// what that version contains, read-only (ContractTree): it's another Definition's, never edited
// here. Its own name and requiredness are this Definition's, and editable. Another version is
// only ever chosen on purpose (Use version N), and the Definition can be opened in the catalogue
// without losing this draft (drafts stay on the shelf).
import { type FieldType, type PropertyPath } from '#shared/features/definitions'
import { BUILDER } from './builder'
import { type DraftField, placesFor, typeWords, updateField } from './model'
import ContractTree from './ContractTree.vue'
import DefinitionTile from './DefinitionTile.vue'
import DefinitionsIcon from './DefinitionsIcon.vue'
import PropertyTree from './PropertyTree.vue'

const props = defineProps<{ fields: readonly DraftField[]; parent: number | null; path: PropertyPath }>()
const b = inject(BUILDER)!
const { open, dragging, dropAt, idPrefix } = b

const SCALARS: FieldType[] = ['string', 'number', 'boolean']
const label = (f: DraftField, i: number) => f.name.trim() || `Property ${i + 1}`
const here = computed(() => dropAt.value?.parent === props.parent)
const isTarget = computed(() => b.target.value === props.parent)
const placeName = computed(() => b.where(props.path))
const count = (n: number) => (n === 1 ? '1 property' : `${n} properties`)
const typeLabel = (f: DraftField) => (f.type === 'object' ? `Object · ${count(f.fields?.length ?? 0)}` : f.type === 'reference' ? b.catalogue.value.label(f.definition!) : typeWords[f.type])
const set = (key: number, change: Parameters<typeof updateField>[2]) => b.update(updateField(b.draft.value, key, change))
const blockOf = (f: DraftField) => (f.definition ? b.catalogue.value.find(f.definition.id) : null)
const resolved = (f: DraftField) => (f.definition ? b.catalogue.value.resolve(f.definition) : null)
const foldable = (f: DraftField) => f.type === 'object' || (f.type === 'reference' && !!resolved(f))
const isOpen = (f: DraftField) => (f.type === 'object' ? !b.folded.value.has(f.key) : b.unfolded.value.has(f.key))
const flipOpen = (f: DraftField) => (f.type === 'object' ? b.fold(f.key) : b.unfold(f.key))
/** Another version, chosen in the row's editor but not used until "Use version N". */
const pending = ref<Record<number, number>>({})
const pendingFor = (f: DraftField) => pending.value[f.key] ?? f.definition!.version
function useVersion(f: DraftField) {
  set(f.key, { definition: { id: f.definition!.id, version: pendingFor(f) } })
  const { [f.key]: _, ...rest } = pending.value
  pending.value = rest
}

const segment = 'flex-1 whitespace-nowrap rounded-full px-2 py-1.5 text-xs font-medium transition sm:px-3 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent-500'
const small = 'grid size-8 place-items-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 disabled:opacity-30 disabled:hover:bg-transparent'
</script>

<template>
  <div
    :data-level="parent ?? 'top'"
    class="relative rounded-2xl transition"
    :class="here ? 'bg-accent-50/50 ring-2 ring-accent-300 ring-offset-4 ring-offset-white' : ''"
    @dragover="b.over($event, parent)"
    @dragleave="b.leave"
    @drop="b.drop($event, parent)"
  >
    <ul v-if="fields.length" class="flex flex-col gap-1.5">
      <li v-for="(f, i) in fields" :key="f.key" :data-row="f.key" class="relative">
        <div v-if="here && dropAt?.index === i" class="absolute inset-x-2 -top-1 z-10 h-0.5 rounded-full bg-accent-500" aria-hidden="true" />
        <div data-row-card class="rounded-xl border bg-white transition" :class="open === f.key ? 'border-accent-200 shadow-sm' : 'border-slate-200/80 hover:border-slate-300'">
          <div class="flex items-center gap-1 pr-2">
            <button
              type="button"
              data-handle
              draggable="true"
              :aria-label="`Move ${label(f, i)}: arrow keys`"
              class="grid h-11 w-7 shrink-0 cursor-grab place-items-center rounded-l-xl text-slate-300 transition hover:text-slate-500 focus-visible:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 active:cursor-grabbing"
              @dragstart="b.startRow($event, f.key)"
              @dragend="b.end"
              @keydown="b.handleKey($event, f.key)"
            >
              <DefinitionsIcon name="grip" class="size-4" />
            </button>
            <!-- Folding an object, or unfolding a reference: its own small control, apart from opening the row's editor. -->
            <button
              v-if="foldable(f)"
              type="button"
              data-fold
              :aria-expanded="isOpen(f)"
              :aria-label="`${isOpen(f) ? 'Hide' : 'Show'} what ${label(f, i)} contains`"
              class="grid size-6 shrink-0 place-items-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
              @click="flipOpen(f)"
            >
              <DefinitionsIcon name="chevron" class="size-3.5 transition-transform" :class="{ 'rotate-90': isOpen(f) }" />
            </button>
            <span v-else class="w-6 shrink-0" aria-hidden="true" />
            <button
              type="button"
              data-row-toggle
              :aria-expanded="open === f.key"
              :aria-controls="`${idPrefix}-row-${f.key}`"
              class="flex min-w-0 flex-1 items-center gap-3 rounded-lg py-2 pr-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
              @click="b.toggle(f.key)"
            >
              <DefinitionTile v-if="f.type === 'reference'" :appearance="blockOf(f)?.appearance ?? null" size="xs" class="mx-0.5" />
              <span v-else class="grid size-7 shrink-0 place-items-center rounded-lg" :class="f.type === 'object' ? 'bg-accent-50 text-accent-600' : 'bg-slate-100 text-slate-600'">
                <DefinitionsIcon :name="f.type" class="size-4" />
              </span>
              <span class="min-w-0 flex-1 truncate font-mono text-sm" :class="f.name.trim() ? 'text-slate-900' : 'text-slate-400 italic'">{{ f.name.trim() || 'unnamed' }}</span>
              <span v-if="f.type === 'reference' && !resolved(f)" class="shrink-0 text-xs font-medium text-red-700" data-unresolved>{{ typeLabel(f) }} can’t be found</span>
              <span v-else class="hidden min-w-0 shrink items-center gap-1 truncate text-xs text-slate-500 sm:flex">
                <DefinitionsIcon v-if="f.type === 'reference'" name="reference" class="size-3 shrink-0 text-slate-400" />
                <DefinitionsIcon v-if="blockOf(f)?.provided" name="lock" class="size-3 shrink-0 text-slate-400" />
                <span class="truncate">{{ typeLabel(f) }}</span>
              </span>
              <span class="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium" :class="f.optional ? 'bg-slate-100 text-slate-500' : 'bg-accent-50 text-accent-700'">{{ f.optional ? 'Optional' : 'Required' }}</span>
              <DefinitionsIcon name="chevron" class="size-4 shrink-0 text-slate-400 transition-transform" :class="{ 'rotate-90': open === f.key }" />
            </button>
          </div>

          <!-- The row's own editor -->
          <div v-if="open === f.key" :id="`${idPrefix}-row-${f.key}`" class="flex flex-col gap-3 border-t border-slate-100 px-4 pt-3 pb-4" @keydown.escape.stop="open = null">
            <div>
              <label :for="`${idPrefix}-name-${f.key}`" class="text-xs font-medium text-slate-600">Name</label>
              <input
                :id="`${idPrefix}-name-${f.key}`"
                :value="f.name"
                type="text"
                maxlength="64"
                autocomplete="off"
                :placeholder="f.type === 'object' ? 'e.g. Contact' : f.type === 'reference' ? 'e.g. Candidate' : 'e.g. First name'"
                class="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-accent-500 focus:ring-2 focus:ring-accent-100"
                @input="set(f.key, { name: ($event.target as HTMLInputElement).value })"
                @keydown.enter.prevent="open = null"
              >
            </div>
            <!-- A reference: exactly which version, changed only on purpose, and a way to look at it. -->
            <div v-if="f.type === 'reference'" class="flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 ring-1 ring-slate-200/70" data-reference-version>
              <DefinitionTile :appearance="blockOf(f)?.appearance ?? null" size="xs" />
              <span class="min-w-0 truncate text-sm font-medium text-slate-900">{{ blockOf(f)?.name ?? f.definition!.id }}</span>
              <select
                v-if="blockOf(f) && blockOf(f)!.versions.length > 1"
                :value="pendingFor(f)"
                :aria-label="`Version of ${blockOf(f)!.name} for ${label(f, i)}`"
                class="rounded-lg border border-slate-200 bg-white py-1 pr-7 pl-2 text-xs font-medium text-slate-700 outline-none focus:border-accent-500 focus:ring-2 focus:ring-accent-100"
                @change="pending = { ...pending, [f.key]: Number(($event.target as HTMLSelectElement).value) }"
              >
                <option v-for="v in [...blockOf(f)!.versions].reverse()" :key="v.version" :value="v.version">Version {{ v.version }}{{ v.version === f.definition!.version ? ' · in use' : v.version === blockOf(f)!.versions.at(-1)!.version ? ' · latest' : '' }}</option>
              </select>
              <span v-else class="rounded-lg bg-white px-2 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-200">Version {{ f.definition!.version }}</span>
              <button v-if="pendingFor(f) !== f.definition!.version" type="button" class="rounded-full bg-accent-600 px-3 py-1 text-xs font-medium text-white transition hover:bg-accent-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-2" data-use-version @click="useVersion(f)">
                Use version {{ pendingFor(f) }}
              </button>
              <NuxtLink v-if="blockOf(f)" :to="{ query: { d: f.definition!.id, v: String(f.definition!.version) } }" class="link ml-auto flex items-center gap-1 text-xs" data-open-reference>
                Open <DefinitionsIcon name="open" class="size-3" />
              </NuxtLink>
            </div>
            <div class="flex flex-wrap gap-3">
              <div v-if="SCALARS.includes(f.type as FieldType)" role="radiogroup" :aria-label="`What ${label(f, i)} holds`" class="flex min-w-56 flex-1 rounded-full bg-slate-100 p-0.5">
                <label v-for="t in SCALARS" :key="t" :class="[segment, 'flex cursor-pointer items-center justify-center gap-1.5', f.type === t ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800']">
                  <input type="radio" class="sr-only" :name="`${idPrefix}-type-${f.key}`" :checked="f.type === t" @change="set(f.key, { type: t })">
                  <DefinitionsIcon :name="t" class="size-3.5" />{{ typeWords[t] }}
                </label>
              </div>
              <div role="radiogroup" :aria-label="`Whether ${label(f, i)} is required`" class="flex min-w-44 flex-1 rounded-full bg-slate-100 p-0.5">
                <label v-for="o in [false, true]" :key="String(o)" :class="[segment, 'flex cursor-pointer items-center justify-center', f.optional === o ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800']">
                  <input type="radio" class="sr-only" :name="`${idPrefix}-optional-${f.key}`" :checked="f.optional === o" @change="set(f.key, { optional: o })">
                  {{ o ? 'Optional' : 'Required' }}
                </label>
              </div>
            </div>
            <div class="flex flex-wrap items-center gap-1">
              <button type="button" data-move="up" :class="small" :disabled="i === 0" :aria-label="`Move ${label(f, i)} up`" title="Move up" @click="b.move(f.key, -1)">
                <DefinitionsIcon name="up" class="size-4" />
              </button>
              <button type="button" data-move="down" :class="small" :disabled="i === fields.length - 1" :aria-label="`Move ${label(f, i)} down`" title="Move down" @click="b.move(f.key, 1)">
                <DefinitionsIcon name="down" class="size-4" />
              </button>
              <!-- Into another object (or out to the top level), without dragging. -->
              <label v-if="placesFor(b.draft.value, f.key).length > 1" class="ml-1 flex items-center gap-1.5 text-xs text-slate-500">
                <span>In</span>
                <select
                  :value="parent ?? ''"
                  data-move-into
                  class="max-w-44 rounded-lg border border-slate-200 bg-white py-1 pr-7 pl-2 text-xs text-slate-700 outline-none focus:border-accent-500 focus:ring-2 focus:ring-accent-100"
                  :aria-label="`Move ${label(f, i)} into`"
                  @change="b.moveInto(f.key, ($event.target as HTMLSelectElement).value === '' ? null : Number(($event.target as HTMLSelectElement).value))"
                >
                  <option v-for="p in placesFor(b.draft.value, f.key)" :key="p.key ?? 'top'" :value="p.key ?? ''">{{ b.where(p.path) }}</option>
                </select>
              </label>
              <button type="button" class="ml-auto rounded-full px-3 py-1.5 text-xs font-medium text-red-700 transition hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500" @click="b.remove(f.key)">
                Remove {{ label(f, i) }}
              </button>
            </div>
          </div>
        </div>

        <!-- A local object's own properties: the next level, indented under it -->
        <div v-if="f.type === 'object' && !b.folded.value.has(f.key)" class="mt-1.5 ml-3.5 border-l-2 border-slate-100 pl-3" :data-children="f.key">
          <PropertyTree :fields="f.fields ?? []" :parent="f.key" :path="[...path, f.name]" />
        </div>
        <!-- What a referenced version contains: another Definition's, read-only -->
        <div v-else-if="f.type === 'reference' && b.unfolded.value.has(f.key) && resolved(f)" class="mt-1 ml-3.5 rounded-r-xl border-l-2 border-dashed border-slate-200 py-1 pr-2 pl-3" :data-reference-contents="f.key">
          <p class="flex items-center gap-1 text-[11px] text-slate-400"><DefinitionsIcon name="lock" class="size-3" /> {{ typeLabel(f) }}, as published · read-only</p>
          <ContractTree :fields="resolved(f)!.fields" :catalogue="b.catalogue.value" :level="path.length + 2" :path="[...path, f.name]" />
        </div>
      </li>
    </ul>
    <div v-if="here && dropAt?.index === fields.length && fields.length" class="mt-1 h-0.5 rounded-full bg-accent-500" aria-hidden="true" />

    <!-- Where new properties go: always there at the top level; inside an object, a quieter "Add here". -->
    <p
      v-if="parent === null"
      class="flex items-center justify-center gap-2 rounded-xl border border-dashed px-4 text-sm transition"
      :class="[fields.length ? 'mt-2 py-3' : 'py-10', here && dragging === 'block' ? 'border-accent-400 text-accent-700' : 'border-slate-300 text-slate-500']"
    >
      <DefinitionsIcon name="plus" class="size-4" />
      <span v-if="dragging === 'block'">Drop to add it {{ here ? 'here' : 'where you let go' }}</span>
      <template v-else>
        <!-- Phones can't drag here: they're told what works. -->
        <span class="lg:hidden">{{ fields.length ? 'Choose a type above to add another' : 'Choose a type above to add the first property' }}</span>
        <span class="hidden lg:inline">{{ fields.length ? 'Drag a type here, or choose one to add another property' : 'Drag a type here, or choose one, to add the first property' }}</span>
      </template>
    </p>
    <button
      v-else
      type="button"
      data-add-here
      :aria-pressed="isTarget"
      class="flex w-full items-center gap-2 rounded-xl border border-dashed px-3 text-left text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
      :class="[fields.length ? 'mt-1.5 py-2' : 'py-3', here || isTarget ? 'border-accent-400 bg-accent-50/40 text-accent-700' : 'border-slate-200 text-slate-500 hover:border-accent-300 hover:text-accent-700']"
      @click="b.setTarget(isTarget ? null : parent)"
    >
      <DefinitionsIcon name="plus" class="size-3.5" />
      <span v-if="dragging === 'block' && here">Drop to add it into {{ placeName }}</span>
      <span v-else-if="isTarget">Adding into {{ placeName }}: choose a block</span>
      <span v-else>{{ fields.length ? `Add to ${placeName}` : `Empty. Add properties to ${placeName}` }}</span>
    </button>
  </div>
</template>
