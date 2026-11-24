<!--
  The workspace navigation: Home, People and Settings, in one of two forms.

    rail  From lg up: a compact white rail of icons in Orbit's frame, beneath the header, with
          Orbit's mark at its top and Settings set apart below a divider. Each icon is named
          (aria-label) and shows its name in a tooltip on hover and on keyboard focus; Escape
          hides the tooltip. It lives in the workspace layout (pages/w/[id].vue), so it stays
          mounted between pages. Pages are kept clear of it by .workspace-stage.
    pill  Below lg: the same places with their names in a bottom pill, above the safe area, and a
          pink moon that glides to where you are. .workspace-stage reserves its height so it never
          covers the end of a page; it steps aside while you type, so it can't cover a focused
          field or the keyboard's edge.

  Only one of the two is ever displayed, so only one navigation landmark exists at a time.
  With reduced motion, nothing moves (main.css).

  Where the experiments exist (`nuxt dev`, Deploy Previews), two more places, Workflows and then
  Definitions, sit before Settings: each its own destination (Workflows use Definitions; they
  don't own them). The flag is fixed at build time (nuxt.config.ts), so production builds have
  exactly the three places above.
-->
<script setup lang="ts">
import { experimentPlaces } from '../dev/workspace/place'

const props = defineProps<{ variant: 'rail' | 'pill'; workspaceId: string; canManage: boolean }>()
const route = useRoute()

// Production: the constant is false, so this is always [] and the experiments' places aren't in the build.
const extra = computed(() => (import.meta.env.ORBIT_PLAYGROUND === true ? experimentPlaces(props.workspaceId) : []))
const places = computed(() => workspacePlaces(props.workspaceId, props.canManage, extra.value))
const current = computed(() => placeOf(route.path, props.workspaceId, extra.value))
const index = computed(() => places.value.findIndex((p) => p.key === current.value))
const icon = (key: string) => (key === 'settings' && !props.canManage ? 'about' : key)

// The rail: the places, then Settings on its own below a divider.
const primary = computed(() => places.value.filter((p) => p.key !== 'settings'))
const settings = computed(() => places.value.filter((p) => p.key === 'settings'))

// Escape hides the tooltips (they can't be dismissed otherwise without moving away) until the
// pointer leaves the rail or focus moves to another place.
const hushed = ref(false)

// The pill: one column per place. Production's three columns keep exactly their old classes.
const pill = computed(() => places.value.length === 5
  ? { cols: 'grid-cols-5', moon: 'w-[calc((100%-0.5rem)/5)]', item: 'min-w-16 px-1 text-[11px]' }
  : { cols: 'grid-cols-3', moon: 'w-[calc((100%-0.5rem)/3)]', item: 'min-w-22 px-4 text-xs' })
</script>

<template>
  <!-- Rail: a lane over the whole stage, laid out by the same frame as the header. -->
  <div v-if="variant === 'rail'" class="pointer-events-none absolute inset-0 z-10 hidden lg:block">
    <div class="orbit-frame h-full pt-14">
      <nav
        aria-label="Workspace"
        class="workspace-rail pointer-events-auto sticky top-6 w-fit animate-rail-in"
        :class="{ 'workspace-rail--hushed': hushed }"
        @keydown.escape="hushed = true"
        @focusin="hushed = false"
        @pointerleave="hushed = false"
      >
        <div class="flex w-[3.875rem] flex-col items-center gap-2 rounded-2xl border border-slate-200/80 bg-white p-2 shadow-lg shadow-slate-900/[0.05]">
          <OrbitSymbol class="my-1.5 size-6" />
          <span aria-hidden="true" class="h-px w-6 bg-slate-200" />
          <template v-for="(group, g) in [primary, settings]" :key="g">
            <span v-if="g === 1" aria-hidden="true" class="h-px w-6 bg-slate-200" />
            <ul class="flex flex-col gap-2">
              <li v-for="p in group" :key="p.key">
                <NuxtLink
                  :to="p.to"
                  :aria-label="p.label"
                  :aria-current="p.key === current ? 'page' : undefined"
                  class="group relative flex size-11 items-center justify-center rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-2"
                  :class="p.key === current ? 'bg-accent-50 text-accent-600' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'"
                >
                  <WorkspaceNavIcon :name="icon(p.key)" class="size-5" />
                  <span aria-hidden="true" class="workspace-rail-tip pointer-events-none absolute top-1/2 left-full z-10 ml-3 -translate-y-1/2 rounded-lg bg-slate-900 px-2.5 py-1 text-xs font-medium whitespace-nowrap text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100">
                    {{ p.label }}
                  </span>
                </NuxtLink>
              </li>
            </ul>
          </template>
        </div>
      </nav>
    </div>
  </div>

  <!-- Pill: phones and narrow windows. -->
  <nav
    v-else
    aria-label="Workspace"
    class="workspace-pill fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] z-10 flex animate-pill-in justify-center px-4 lg:hidden"
  >
    <ul class="relative grid rounded-full border border-white/80 bg-white/75 p-1 shadow-lg shadow-slate-900/[0.08] ring-1 ring-slate-900/5 backdrop-blur-md" :class="pill.cols">
      <li
        aria-hidden="true"
        :class="pill.moon"
        class="pointer-events-none absolute inset-y-1 left-1 rounded-full bg-accent-50/90 ring-1 ring-accent-200/60 transition-transform duration-500 ease-[cubic-bezier(0.22,0.8,0.24,1)]"
        :style="{ transform: `translateX(${index * 100}%)` }"
      />
      <li v-for="p in places" :key="p.key" class="relative">
        <NuxtLink
          :to="p.to"
          :aria-current="p.key === current ? 'page' : undefined"
          class="flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-full py-2 font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
          :class="[pill.item, p.key === current ? 'text-accent-700' : 'text-slate-500 hover:text-slate-800']"
        >
          <WorkspaceNavIcon :name="icon(p.key)" class="size-4" />
          {{ p.label }}
        </NuxtLink>
      </li>
    </ul>
  </nav>
</template>

<style>
.workspace-rail--hushed .workspace-rail-tip { opacity: 0 !important; }
</style>
