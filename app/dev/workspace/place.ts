// The Workflows place's link (the workflow entry experiment). Kept out of app/utils/workspaceNav.ts
// so that builds without the experiment contain no trace of it: WorkspaceNav only calls this
// behind the build-time constant, which is false in production, so the call and this module drop.
import type { Place, PlaceLink } from '../../utils/workspaceNav'

export const workflowsPlace = (workspaceId: string): PlaceLink => ({ key: 'workflows', label: 'Workflows', to: `/w/${workspaceId}/workflows` })

/**
 * Experiment #7: the workspace's Definitions have no navigation item of their own. They're reached
 * from the Workflows place, so the navigation shows you there while you're in them.
 */
export function experimentPlaceOf(path: string, workspaceId: string): Place | null {
  const rest = path.replace(/[?#].*$/, '').replace(/\/+$/, '')
  return rest === `/w/${workspaceId}/definitions` ? 'workflows' : null
}
