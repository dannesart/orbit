// The Workflows place's link (the workflow entry experiment). Kept out of app/utils/workspaceNav.ts
// so that builds without the experiment contain no trace of it: WorkspaceNav only calls this
// behind the build-time constant, which is false in production, so the call and this module drop.
import type { PlaceLink } from '../../utils/workspaceNav'

export const workflowsPlace = (workspaceId: string): PlaceLink => ({ key: 'workflows', label: 'Workflows', to: `/w/${workspaceId}/workflows` })
