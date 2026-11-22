<!--
  The workspace navigation (concept E3, "The Workspace Frame"): Home, People and Settings in a
  small floating glass object, with a pink moon that glides to where you are.

    rail  From lg up: a slim vertical rail in Orbit's frame, directly beneath the logo. It lives
          in the workspace layout (pages/w/[id].vue), so it stays mounted between pages and the
          moon glides rather than jumps. Pages are kept clear of it by .workspace-stage.
    pill  Below lg: the same places in a bottom pill, above the safe area. .workspace-stage
          reserves its height so it never covers the end of a page; it steps aside while you
          type, so it can't cover a focused field or the keyboard's edge.

  Only one of the two is ever displayed, so only one navigation landmark exists at a time.
  With reduced motion, neither the entrance nor the moon moves.

  Where the workflow designer experiment exists (`nuxt dev`, Deploy Previews), a fourth place,
  Workflows, sits before Settings. The flag is fixed at build time (nuxt.config.ts), so production
  builds have exactly the three places above and the same markup as before.
-->
<script setup lang="ts">
import { workflowsPlace } from '../dev/workspace/place'

const props = defineProps<{ variant: 'rail' | 'pill'; workspaceId: string; canManage: boolean }>()
const route = useRoute()

// Production: the constant is false, so this is always [] and the Workflows place isn't in the build.
const extra = computed(() => (import.meta.env.ORBIT_PLAYGROUND === true ? [workflowsPlace(props.workspaceId)] : []))
const places = computed(() => workspacePlaces(props.workspaceId, props.canManage, extra.value))
const current = computed(() => placeOf(route.path, props.workspaceId, extra.value))
const four = computed(() => places.value.length === 4)
const index = computed(() => places.value.findIndex((p) => p.key === current.value))
const icon = (key: Place) => (key === 'settings' && !props.canManage ? 'about' : key)
</script>

<template>
  <!-- Rail: a lane over the whole stage, laid out by the same frame as the header. -->
  <div v-if="variant === 'rail'" class="pointer-events-none absolute inset-0 z-10 hidden lg:block">
    <div class="orbit-frame h-full pt-14">
      <nav aria-label="Workspace" class="pointer-events-auto sticky top-6 w-fit animate-rail-in">
        <ul class="relative flex flex-col rounded-[1.75rem] border border-white/80 bg-white/70 p-1.5 shadow-lg shadow-slate-900/[0.06] ring-1 ring-slate-900/5 backdrop-blur-md">
          <li
            aria-hidden="true"
            class="pointer-events-none absolute inset-x-1.5 top-1.5 h-15 rounded-[1.375rem] bg-accent-50/90 ring-1 ring-accent-200/60 transition-transform duration-500 ease-[cubic-bezier(0.22,0.8,0.24,1)]"
            :style="{ transform: `translateY(${index * 100}%)` }"
          >
            <span class="absolute top-2 right-2.5 size-1.5 rounded-full bg-accent-400" />
          </li>
          <li v-for="p in places" :key="p.key" class="relative">
            <NuxtLink
              :to="p.to"
              :aria-current="p.key === current ? 'page' : undefined"
              class="flex h-15 w-16 flex-col items-center justify-center gap-1 rounded-[1.375rem] text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
              :class="p.key === current ? 'text-accent-700' : 'text-slate-500 hover:text-slate-800'"
            >
              <WorkspaceNavIcon :name="icon(p.key)" class="size-[18px]" />
              {{ p.label }}
            </NuxtLink>
          </li>
        </ul>
      </nav>
    </div>
  </div>

  <!-- Pill: phones and narrow windows. -->
  <nav
    v-else
    aria-label="Workspace"
    class="workspace-pill fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] z-10 flex animate-pill-in justify-center px-4 lg:hidden"
  >
    <ul class="relative grid rounded-full border border-white/80 bg-white/75 p-1 shadow-lg shadow-slate-900/[0.08] ring-1 ring-slate-900/5 backdrop-blur-md" :class="four ? 'grid-cols-4' : 'grid-cols-3'">
      <li
        aria-hidden="true"
        :class="four ? 'w-[calc((100%-0.5rem)/4)]' : 'w-[calc((100%-0.5rem)/3)]'"
        class="pointer-events-none absolute inset-y-1 left-1 rounded-full bg-accent-50/90 ring-1 ring-accent-200/60 transition-transform duration-500 ease-[cubic-bezier(0.22,0.8,0.24,1)]"
        :style="{ transform: `translateX(${index * 100}%)` }"
      >
        <span class="absolute top-1.5 right-3 size-1.5 rounded-full bg-accent-400" />
      </li>
      <li v-for="p in places" :key="p.key" class="relative">
        <NuxtLink
          :to="p.to"
          :aria-current="p.key === current ? 'page' : undefined"
          class="flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-full py-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
          :class="[four ? 'min-w-20 px-2' : 'min-w-22 px-4', p.key === current ? 'text-accent-700' : 'text-slate-500 hover:text-slate-800']"
        >
          <WorkspaceNavIcon :name="icon(p.key)" class="size-4" />
          {{ p.label }}
        </NuxtLink>
      </li>
    </ul>
  </nav>
</template>
