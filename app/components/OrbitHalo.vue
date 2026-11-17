<!--
  One faint orbit around its content, with a small moon that glides in once on arrival and
  then rests. No looping motion; with reduced motion the moon is simply already in place.
-->
<template>
  <div class="relative grid size-44 place-items-center" aria-hidden="true">
    <div class="absolute inset-0 animate-[halo-in_1.2s_ease-out_both] rounded-full border border-accent-100" />
    <div class="absolute inset-4 animate-[halo-in_1.2s_ease-out_150ms_both] rounded-full border border-accent-100/60" />
    <div class="absolute inset-0 animate-[moon-arrive_1.8s_cubic-bezier(0.22,0.8,0.24,1)_200ms_both]">
      <span class="absolute top-[14%] right-[14%] size-2.5 rounded-full bg-accent-300 shadow-[0_0_12px] shadow-accent-200" />
    </div>
    <slot />
  </div>
</template>
