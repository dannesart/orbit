<!--
  Playground: a page at a real viewport size (so its own breakpoints apply), scaled down to fit
  the space available. `width`/`height` are the viewport; omit them to fill the space at 1:1.
-->
<script setup lang="ts">
const props = defineProps<{ src: string; title: string; width?: number; height?: number; device?: 'phone' | 'desktop' }>()
const box = useTemplateRef<HTMLElement>('box')
const space = reactive({ w: 0, h: 0 })
let observer: ResizeObserver | undefined
onMounted(() => {
  observer = new ResizeObserver(([entry]) => {
    space.w = entry!.contentRect.width
    space.h = entry!.contentRect.height
  })
  observer.observe(box.value!)
})
onBeforeUnmount(() => observer?.disconnect())

const chrome = computed(() => (props.device === 'phone' ? 20 : props.device === 'desktop' ? 30 : 0))
const fixed = computed(() => !!(props.width && props.height))
const scale = computed(() => {
  if (!fixed.value || !space.w || !space.h) return 1
  return Math.min(space.w / (props.width! + (props.device === 'phone' ? 20 : 0)), (space.h) / (props.height! + chrome.value), 1)
})
</script>

<template>
  <div ref="box" class="relative min-h-0 min-w-0 overflow-hidden">
    <div
      v-if="fixed"
      class="absolute top-1/2 left-1/2 origin-center"
      :style="{ transform: `translate(-50%, -50%) scale(${scale})`, width: `${width! + (device === 'phone' ? 20 : 0)}px`, height: `${height! + chrome}px` }"
    >
      <!-- Phone: a quiet device outline. Desktop: a window bar. -->
      <div v-if="device === 'phone'" class="size-full rounded-[2.75rem] bg-slate-900 p-2.5 shadow-2xl shadow-slate-900/25">
        <iframe :src="src" :title="title" class="size-full rounded-[2.2rem] bg-slate-50" />
      </div>
      <div v-else class="flex size-full flex-col overflow-hidden rounded-xl bg-white shadow-2xl shadow-slate-900/15 ring-1 ring-slate-900/10">
        <div class="flex h-[30px] shrink-0 items-center gap-1.5 border-b border-slate-200 bg-slate-100 px-3" aria-hidden="true">
          <span class="size-2.5 rounded-full bg-slate-300" /><span class="size-2.5 rounded-full bg-slate-300" /><span class="size-2.5 rounded-full bg-slate-300" />
        </div>
        <iframe :src="src" :title="title" class="min-h-0 w-full flex-1 bg-slate-50" />
      </div>
    </div>
    <iframe v-else :src="src" :title="title" class="absolute inset-0 size-full rounded-xl bg-slate-50 shadow-xl shadow-slate-900/10 ring-1 ring-slate-900/10" />
  </div>
</template>
