import { describe, expect, it } from 'vitest'
import { pickWorkspace } from '../app/utils/lastWorkspace'

// As listed by the API: only the caller's own workspaces, most recently created first.
const yours = [{ id: 'garden' }, { id: 'launch' }, { id: 'archive' }]

describe('where Orbit takes you on arrival', () => {
  it('returns you to the workspace you were last in, wherever it sits in the list', () => {
    expect(pickWorkspace(yours, 'launch')).toEqual({ id: 'launch' })
    expect(pickWorkspace(yours, 'archive')).toEqual({ id: 'archive' })
  })

  it('falls back to your most recent workspace when nothing is remembered', () => {
    expect(pickWorkspace(yours, null)).toEqual({ id: 'garden' })
    expect(pickWorkspace(yours, undefined)).toEqual({ id: 'garden' })
    expect(pickWorkspace(yours, '')).toEqual({ id: 'garden' })
  })

  it('never follows a remembered workspace you no longer belong to', () => {
    expect(pickWorkspace(yours, 'someone-elses')).toEqual({ id: 'garden' })
  })

  it('has nowhere to go when you belong to no workspace, whatever is remembered', () => {
    expect(pickWorkspace([], 'launch')).toBeUndefined()
  })
})
