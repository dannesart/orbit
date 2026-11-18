/**
 * Where `/` takes you: the workspace you were last in on this device, if it's still among the
 * workspaces the server says you belong to; otherwise the first of them (the most recent).
 * The remembered id is only ever a preference among those, never a way in.
 */
export function pickWorkspace<T extends { id: string }>(
  workspaces: readonly T[],
  remembered: string | null | undefined,
): T | undefined {
  return workspaces.find((workspace) => workspace.id === remembered) ?? workspaces[0]
}
