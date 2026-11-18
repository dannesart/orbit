<!--
  One action in Orbit's small header menus (useMenu finds it by role="menuitem").
  The icon slot takes a 16×16 stroke icon; it inherits the colour, which turns pink with the
  text on hover and keyboard focus.
-->
<template>
  <button
    type="button" role="menuitem"
    class="group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-slate-700 transition outline-none hover:bg-accent-50 hover:text-accent-700 focus-visible:bg-accent-50 focus-visible:text-accent-700"
  >
    <span class="flex size-4 shrink-0 text-slate-400 transition group-hover:text-accent-600 group-focus-visible:text-accent-600" aria-hidden="true">
      <slot name="icon" />
    </span>
    <slot />
  </button>
</template>
