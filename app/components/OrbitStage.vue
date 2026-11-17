<!-- Centered card on the ambient orbit backdrop, shared by sign-in and workspace creation. -->
<template>
  <main class="relative grid min-h-dvh place-items-center overflow-hidden px-4 py-12">
    <div class="pointer-events-none absolute inset-0 grid place-items-center" aria-hidden="true">
      <div class="absolute size-120 rounded-full bg-indigo-200/40 blur-3xl" />
      <div class="absolute size-152 rounded-full border border-indigo-100" />
      <div class="absolute size-224 rounded-full border border-indigo-100/70" />
      <div class="absolute size-152 animate-orbit">
        <span class="absolute -top-1.5 left-1/2 size-3 rounded-full bg-indigo-300" />
      </div>
      <div class="absolute size-224 animate-orbit [animation-direction:reverse] [animation-duration:40s]">
        <span class="absolute top-1/2 -left-1 size-2 rounded-full bg-violet-300" />
      </div>
    </div>

    <div class="relative w-full max-w-md animate-rise">
      <div class="mb-10 flex justify-center">
        <OrbitMark class="text-lg" />
      </div>
      <div class="rounded-3xl border border-white bg-white/80 p-8 shadow-xl shadow-indigo-900/5 backdrop-blur">
        <slot />
      </div>
      <div class="mt-6 text-center text-sm text-slate-400">
        <slot name="footer" />
      </div>
    </div>
  </main>
</template>
