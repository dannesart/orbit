/**
 * The workspace last opened in this browser, remembered per device for a year. It holds only
 * an id, never anything about the workspace, and is checked against your memberships before
 * use (see pickWorkspace), so a stale or foreign value simply falls back.
 */
export const useLastWorkspace = () =>
  useCookie<string | null>('orbit_last_workspace', {
    default: () => null,
    sameSite: 'lax',
    secure: !import.meta.dev,
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  })
