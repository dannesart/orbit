/** The places inside a workspace, in the order the navigation shows them. */
export type Place = 'home' | 'people' | 'settings'

export interface PlaceLink {
  key: Place
  label: string
  to: string
}

/**
 * Home, People and the workspace's settings. Settings is named for what you can do there:
 * "Settings" for the owner and stewards, "About" for members (it's read-only for them).
 */
export function workspacePlaces(workspaceId: string, canManage: boolean): PlaceLink[] {
  const base = `/w/${workspaceId}`
  return [
    { key: 'home', label: 'Home', to: base },
    { key: 'people', label: 'People', to: `${base}/people` },
    { key: 'settings', label: canManage ? 'Settings' : 'About', to: `${base}/settings` },
  ]
}

/** Which place a path inside the workspace is; anything else in it counts as Home. */
export function placeOf(path: string, workspaceId: string): Place {
  const rest = path.replace(/[?#].*$/, '').replace(/\/+$/, '').slice(`/w/${workspaceId}`.length)
  if (rest === '/people') return 'people'
  if (rest === '/settings') return 'settings'
  return 'home'
}
