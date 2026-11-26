<script setup lang="ts">
// Said once, up front, when the Transform version runs use can't take these contracts at all
// (local objects or other Definitions inside them): the same refusal the boundary makes before
// running. Not a problem to fix in Mapping, so it suggests nothing to map; what it can't make is
// marked on its own rows.
defineProps<{ text: string }>()
</script>

<template>
  <div role="status" class="rounded-2xl bg-amber-50/70 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200/70" data-unsupported-contract>
    <p class="font-medium">Not supported by this Transform version</p>
    <p class="mt-0.5 text-xs">{{ text }}</p>
  </div>
</template>
