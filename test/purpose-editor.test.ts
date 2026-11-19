import { describe, expect, it, vi } from 'vitest'
import { createPurposeEditor, purposeToSave } from '../app/utils/purposeEditor'
import { parseDescription } from '../server/utils/workspaces'

/** A workspace whose save() behaves like useWorkspace's: it updates the purpose, or rejects like $fetch. */
function workspace(initial: string | null) {
  const state = { description: initial }
  const save = vi.fn(async (changes: { description: string | null }) => {
    state.description = changes.description
    return { description: changes.description }
  })
  return { state, save, editor: createPurposeEditor({ current: () => state.description, save }) }
}
const refusal = (statusMessage: string) => Object.assign(new Error('422'), { data: { statusMessage } })

describe('editing the purpose', () => {
  it('opens on the current purpose, with nothing sent', () => {
    const { editor, save } = workspace('Planning the spring launch')
    editor.start()
    expect(editor.open.value).toBe(true)
    expect(editor.draft.value).toBe('Planning the spring launch')
    expect(editor.error.value).toBe('')
    expect(save).not.toHaveBeenCalled()
  })

  it('saves through the workspace’s save(), then closes', async () => {
    const { editor, save, state } = workspace('Planning the spring launch')
    editor.start()
    editor.draft.value = '  Onboarding   new people '
    expect(await editor.submit()).toBe(true)
    expect(save).toHaveBeenCalledExactlyOnceWith({ description: 'Onboarding new people' })
    expect(state.description).toBe('Onboarding new people')
    expect(editor.open.value).toBe(false)
  })

  it('gives a workspace its first purpose', async () => {
    const { editor, save } = workspace(null)
    editor.start()
    expect(editor.draft.value).toBe('')
    editor.draft.value = 'A first purpose'
    expect(await editor.submit()).toBe(true)
    expect(save).toHaveBeenCalledWith({ description: 'A first purpose' })
  })

  it('clears the purpose when saved empty: a valid answer, with no separate Remove', async () => {
    for (const empty of ['', '   ']) {
      const { editor, save, state } = workspace('Temporary')
      editor.start()
      editor.draft.value = empty
      expect(await editor.submit()).toBe(true)
      expect(save).toHaveBeenCalledExactlyOnceWith({ description: null })
      expect(state.description).toBeNull()
      expect(editor.open.value).toBe(false)
    }
  })

  it('leaves the workspace unchanged on Cancel, Escape or the backdrop, and starts fresh next time', () => {
    const { editor, save, state } = workspace('Steady')
    editor.start()
    editor.draft.value = 'Something else entirely'
    expect(editor.cancel()).toBe(true)
    expect(editor.open.value).toBe(false)
    expect(save).not.toHaveBeenCalled()
    expect(state.description).toBe('Steady')
    editor.start()
    expect(editor.draft.value).toBe('Steady') // the abandoned draft is gone
  })

  it('keeps what was typed and stays open when the save fails, with the server’s reason', async () => {
    const { editor, save, state } = workspace('Steady')
    save.mockRejectedValueOnce(refusal('Only this workspace’s admins can change it.'))
    editor.start()
    editor.draft.value = 'My new purpose'
    expect(await editor.submit()).toBe(false)
    expect(editor.open.value).toBe(true)
    expect(editor.draft.value).toBe('My new purpose')
    expect(editor.error.value).toBe('Only this workspace’s admins can change it.')
    expect(state.description).toBe('Steady')

    // Trying again clears the error and, this time, saves
    expect(await editor.submit()).toBe(true)
    expect(editor.error.value).toBe('')
    expect(state.description).toBe('My new purpose')
  })

  it('says something plain when the failure has no reason (offline, server down)', async () => {
    const { editor, save } = workspace(null)
    save.mockRejectedValueOnce(new TypeError('fetch failed'))
    editor.start()
    editor.draft.value = 'Anything'
    await editor.submit()
    expect(editor.error.value).toBe('That didn’t save. Please try again.')
    expect(editor.open.value).toBe(true)
  })

  it('sends one save however often Save is pressed, and can’t be dismissed until it settles', async () => {
    const { editor, save } = workspace('Steady')
    let finish!: () => void
    save.mockImplementationOnce(() => new Promise((resolve) => { finish = () => resolve({}) }))
    editor.start()
    editor.draft.value = 'Pressed twice'

    const first = editor.submit()
    expect(editor.saving.value).toBe(true)
    expect(await editor.submit()).toBe(false) // a second press, or Enter, while saving
    expect(editor.cancel()).toBe(false) // Cancel, Escape or the backdrop while saving
    expect(editor.open.value).toBe(true)

    finish()
    expect(await first).toBe(true)
    expect(save).toHaveBeenCalledTimes(1)
    expect(editor.saving.value).toBe(false)
    expect(editor.open.value).toBe(false)
  })

  it('counts characters the way the server does, so emoji count once', () => {
    const { editor } = workspace(null)
    editor.start()
    editor.draft.value = '🪐'.repeat(10)
    expect(editor.remaining.value).toBe(270)
  })
})

describe('purposeToSave', () => {
  it('asks for exactly what the server would store', () => {
    for (const draft of ['', '   ', 'Planning', '  Planning   the spring\tlaunch ', 'a'.repeat(280)]) {
      expect({ description: purposeToSave(draft) }).toEqual(parseDescription(draft))
    }
  })
})
