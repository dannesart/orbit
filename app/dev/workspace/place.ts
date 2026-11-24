// The experiments' places in the workspace navigation: Workflows (the workflow entry experiment)
// and Definitions (Experiment #7). Kept out of app/utils/workspaceNav.ts so that builds without
// the experiments contain no trace of them: WorkspaceNav only calls this behind the build-time
// constant, which is false in production, so the call and this module drop.
//
// Two places, not one inside the other: Workflows use Definitions, but Definitions don't belong to
// Workflows. Each is its own destination, at its own route, and shows as itself when you're there.
import type { PlaceLink } from '../../utils/workspaceNav'

export const workflowsPlace = (workspaceId: string): PlaceLink => ({ key: 'workflows', label: 'Workflows', to: `/w/${workspaceId}/workflows` })
export const definitionsPlace = (workspaceId: string): PlaceLink => ({ key: 'definitions', label: 'Definitions', to: `/w/${workspaceId}/definitions` })

/** Both, in the navigation's order: Workflows, then the Definitions they use. */
export const experimentPlaces = (workspaceId: string): PlaceLink[] => [workflowsPlace(workspaceId), definitionsPlace(workspaceId)]
