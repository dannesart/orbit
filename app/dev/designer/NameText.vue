<script setup lang="ts">
// A property name, exactly as written, that wraps where its words meet when it's longer than its
// space: "preferredNameForInternal / Communication", never "preferredNameForInternalCommunicati / on".
// Only break opportunities (<wbr>) at camelCase and separator boundaries: the text itself, what's read
// aloud and what's copied are the name unchanged. A single word longer than the space still wraps
// (its container keeps overflow-wrap as the last resort).
const props = defineProps<{ name: string }>()
/** The name in parts, each ending where a new word starts: before a capital after a lowercase letter or digit, or after _ - . */
const parts = computed(() => props.name.split(/(?<=[a-z0-9])(?=[A-Z])|(?<=[_\-.])/))
</script>

<template><template v-for="(part, i) in parts" :key="i">{{ part }}<wbr v-if="i < parts.length - 1"></template></template>
