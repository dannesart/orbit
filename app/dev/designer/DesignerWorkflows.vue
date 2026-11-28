<script setup lang="ts">
// The Designer page (development only): the experimental workflows (workflows.ts), one Designer each,
// kept alive while you switch between them, so each keeps its Record edits, draft, applied
// versions, canvas positions and runs for the session. Which one is on screen is in the address
// (?workflow=…; the simple one has none), so Back returns to the previous one. In memory only:
// nothing here is a Workflow model, and nothing is saved.
import SpatialDesigner from './SpatialDesigner.vue'
import { WORKFLOWS, WORKFLOW_RISK, type WorkflowRisk, workflowOf } from './workflows'

const route = useRoute()
const router = useRouter()
const current = computed(() => workflowOf(route.query.workflow))

// Each workflow's work, so leaving Orbit from any of them names what every one would lose.
const risks = new Map<string, () => readonly string[]>()
provide<WorkflowRisk>(WORKFLOW_RISK, {
  set: (id, risk) => (risk ? risks.set(id, risk) : risks.delete(id)),
  others: (id) => [...risks].filter(([other]) => other !== id).flatMap(([other, risk]) => risk().map((words) => `${workflowOf(other).name}: ${words}`)),
})

/** Switching: the other workflow, as you left it (or as it starts). Mapping Studio stays with its own workflow. */
function switchTo(id: string) {
  const { studio: _studio, workflow: _workflow, ...rest } = route.query
  router.push({ query: id === WORKFLOWS[0]!.id ? rest : { ...rest, workflow: id } })
}
</script>

<template>
  <KeepAlive>
    <SpatialDesigner :key="current.id" :workflow="current" :workflows="WORKFLOWS" @switch="switchTo" />
  </KeepAlive>
</template>
