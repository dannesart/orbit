/**
 * The places inside a workspace: Home, People and Settings. Builds with experiments add their own
 * (`extra`, keyed by their own names), so this file names none of them.
 */
export type Place = 'home' | 'people' | 'settings' | (string & {})

export interface PlaceLink {
  key: Place
  label: string
  to: string
}

/**
 * Home, People and the workspace's settings. Settings is named for what you can do there:
 * "Settings" for the owner and stewards, "About" for members (it's read-only for them).
 * `extra` places (only experiments, in builds that have them) follow Home, before People;
 * production passes none, so a workspace has exactly these three.
 */
export function workspacePlaces(workspaceId: string, canManage: boolean, extra: readonly PlaceLink[] = []): PlaceLink[] {
  const base = `/w/${workspaceId}`
  return [
    { key: 'home', label: 'Home', to: base },
    ...extra,
    { key: 'people', label: 'People', to: `${base}/people` },
    { key: 'settings', label: canManage ? 'Settings' : 'About', to: `${base}/settings` },
  ]
}

/** Which place a path inside the workspace is; anything else in it counts as Home. */
export function placeOf(path: string, workspaceId: string, extra: readonly PlaceLink[] = []): Place {
  const base = `/w/${workspaceId}`
  const rest = path.replace(/[?#].*$/, '').replace(/\/+$/, '').slice(base.length)
  if (rest === '/people') return 'people'
  if (rest === '/settings') return 'settings'
  return extra.find((p) => p.to === base + rest)?.key ?? 'home'
}
