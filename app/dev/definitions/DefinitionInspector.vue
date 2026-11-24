<script setup lang="ts">
// One Definition, in a floating inspector beside the catalogue (a sheet on phones): its name, the
// version shown and whose it is, its description, the properties of that version, its other
// versions on demand, and what can be done with it, under the icon and colour chosen for it. Nothing is edited here: a new version, or a
// new name or description, is made in its own view (DefinitionEditor), on purpose.
import type { DefinitionVersion } from '#shared/features/definitions'
import { ORBIT_DESCRIPTIONS, ORBIT_PROVIDED, draftFrom, typeWords } from './model'
import { findMade, setEvolving, shelfOf } from './store'
import { definitionsPath } from './designer'
import DefinitionTile from './DefinitionTile.vue'
import DefinitionsIcon from './DefinitionsIcon.vue'

const props = defineProps<{ workspace: { id: string; name: string }; id: string; version: number | null; created: number | null }>()
const emit = defineEmits<{ close: [] }>()

const made = computed(() => findMade(props.workspace.id, props.id))
const provided = computed(() => ORBIT_PROVIDED.filter((d) => d.id === props.id))
const versions = computed<readonly DefinitionVersion[]>(() => made.value?.versions ?? provided.value)
const name = computed(() => made.value?.name ?? provided.value[0]?.name ?? '')
const description = computed(() => made.value?.description ?? ORBIT_DESCRIPTIONS[props.id] ?? '')
const latest = computed(() => versions.value.at(-1))
const shown = computed(() => versions.value.find((v) => v.version === props.version) ?? latest.value)
const versionTo = (v: number) => ({ query: { d: props.id, v: String(v) } })

// Earlier versions, on demand: open from the start only when an earlier one is shown.
const history = ref(!!shown.value && shown.value.version !== latest.value?.version)

const designerFor = (v: DefinitionVersion) =>
  `/dev/designer?back=${encodeURIComponent(definitionsPath(props.workspace.id, props.id, v.version))}&output=${encodeURIComponent(`${v.id}@${v.version}`)}`

// A new version starts from the version shown, in its own view. A draft already started is continued.
const draft = computed(() => shelfOf(props.workspace.id).evolving[props.id] ?? null)
const nextNumber = computed(() => versions.value.length + 1)
function newVersion() {
  if (!draft.value && shown.value) setEvolving(props.workspace.id, props.id, draftFrom(shown.value))
  navigateTo({ query: { d: props.id, next: null } })
}

const heading = ref<HTMLElement>()
onMounted(() => heading.value?.focus())
const iconButton = 'grid size-9 shrink-0 place-items-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500'
</script>

<template>
  <aside
    data-definition-inspector
    :aria-label="`${name || 'Definition'}: inspector`"
    class="fixed inset-x-0 bottom-0 z-30 flex max-h-[80dvh] animate-rise flex-col overflow-hidden rounded-t-3xl border border-slate-200/80 bg-white shadow-2xl shadow-slate-900/15 lg:inset-x-auto lg:top-20 lg:right-6 lg:bottom-auto lg:max-h-[calc(100dvh-6.5rem)] lg:w-[24rem] lg:rounded-3xl lg:shadow-xl lg:shadow-slate-900/10"
    @keydown.escape="emit('close')"
  >
    <div class="mx-auto mt-2 h-1 w-10 rounded-full bg-slate-200 lg:hidden" aria-hidden="true" />

    <template v-if="!versions.length">
      <div class="flex items-center gap-3 px-5 pt-3 pb-2 lg:pt-4">
        <h2 ref="heading" tabindex="-1" class="min-w-0 flex-1 text-base font-semibold text-slate-900 focus:outline-none">This Definition isn’t here</h2>
        <button type="button" :class="iconButton" aria-label="Close the inspector" title="Close" @click="emit('close')">
          <DefinitionsIcon name="close" class="size-4" />
        </button>
      </div>
      <p class="px-5 pb-5 text-sm text-slate-600">It may have been made in this tab before a reload: Definitions made here last only as long as the tab.</p>
    </template>

    <template v-else-if="shown">
      <!-- Header -->
      <div class="flex items-center gap-3 px-5 pt-3 pb-4 lg:pt-4">
        <DefinitionTile :appearance="made?.appearance ?? null" size="sm" />
        <div class="min-w-0 flex-1">
          <h2 ref="heading" tabindex="-1" class="truncate text-base leading-tight font-semibold text-slate-900 focus:outline-none">{{ name }}</h2>
          <p class="flex items-center gap-1 text-xs text-slate-500">
            <DefinitionsIcon v-if="!made" name="lock" class="size-3" />
            <span>Version {{ shown.version }}<template v-if="versions.length > 1"> of {{ versions.length }}</template> · {{ made ? workspace.name : 'Provided by Orbit' }}</span>
          </p>
        </div>
        <NuxtLink v-if="made" :to="{ query: { d: id, about: null } }" :class="iconButton" aria-label="Change name, description or appearance" title="Name and appearance">
          <DefinitionsIcon name="pencil" class="size-4" />
        </NuxtLink>
        <button type="button" :class="iconButton" aria-label="Close the inspector" title="Close" @click="emit('close')">
          <DefinitionsIcon name="close" class="size-4" />
        </button>
      </div>

      <div class="min-h-0 flex-1 overflow-y-auto px-5 pb-4">
        <p v-if="created === shown.version" class="mb-4 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800 ring-1 ring-emerald-200" role="status">
          Version {{ shown.version }} is made.<template v-if="shown.version > 1"> Version {{ shown.version - 1 }} is exactly as it was.</template>
        </p>
        <p v-if="description" class="text-sm text-slate-600">{{ description }}</p>

        <section aria-labelledby="properties-heading" :class="description ? 'mt-6' : ''">
          <div class="mb-1 flex items-center gap-2">
            <h3 id="properties-heading" class="text-sm font-semibold text-slate-900">Properties</h3>
            <span class="text-xs text-slate-500">{{ shown.fields.length }}</span>
          </div>
          <ul class="divide-y divide-slate-100">
            <li v-for="f in shown.fields" :key="f.name" class="flex items-center justify-between gap-3 py-2 text-sm">
              <span class="min-w-0 truncate font-medium text-slate-900">{{ f.name }}</span>
              <span class="shrink-0 text-xs text-slate-500">{{ typeWords[f.type] }}</span>
            </li>
          </ul>
          <p v-if="made && shown.name !== name" class="mt-2 text-xs text-slate-500">Made when it was called {{ shown.name }}.</p>
        </section>

        <section v-if="versions.length > 1" class="mt-6">
          <button
            type="button"
            class="flex w-full items-center gap-2 rounded-lg text-left text-sm font-semibold text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
            :aria-expanded="history"
            aria-controls="definition-versions"
            @click="history = !history"
          >
            Version history <span class="text-xs font-normal text-slate-500">{{ versions.length }}</span>
            <DefinitionsIcon name="chevron" class="ml-auto size-4 text-slate-400 transition-transform" :class="{ 'rotate-90': history }" />
          </button>
          <nav v-show="history" id="definition-versions" class="mt-2" aria-label="Versions">
            <ul class="flex flex-col gap-1">
              <li v-for="v in [...versions].reverse()" :key="v.version">
                <NuxtLink
                  :to="versionTo(v.version)"
                  replace
                  :aria-current="v.version === shown.version ? 'page' : undefined"
                  class="flex items-center justify-between rounded-xl px-3 py-2 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
                  :class="v.version === shown.version ? 'bg-accent-50 font-medium text-accent-800' : 'text-slate-700 hover:bg-slate-50'"
                >
                  <span>Version {{ v.version }}<template v-if="v.version === latest?.version"> · latest</template></span>
                  <span class="text-xs text-slate-500">{{ v.fields.length === 1 ? '1 property' : `${v.fields.length} properties` }}</span>
                </NuxtLink>
              </li>
            </ul>
          </nav>
        </section>
      </div>

      <div class="flex flex-wrap items-center gap-2 border-t border-slate-100 px-5 pt-3 pb-4">
        <NuxtLink :to="designerFor(shown)" class="btn-primary w-auto rounded-full px-4 py-2 text-sm">Use version {{ shown.version }} in the Designer</NuxtLink>
        <button
          v-if="made"
          type="button"
          class="rounded-full px-4 py-2 text-sm font-medium text-accent-700 ring-1 ring-accent-200 transition hover:bg-accent-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
          @click="newVersion"
        >
          {{ draft ? `Continue version ${nextNumber}` : 'New version' }}
        </button>
      </div>
    </template>
  </aside>
</template>
