// The invitation experience's behaviour, apart from its components (no DOM in this repo's
// tests): the invite dialog's request and link, copying, and what an invitation's page shows.
import { describe, expect, it } from 'vitest'
import { arrivalOf, copyText, createInvitationEditor, invitationLink, isInvitationPath, roleName } from '../app/utils/invitations'
import { safeDestination, signInPath, welcomePath } from '../app/utils/returnTo'

const ID = '0b6f7f5e-3c9a-4c1e-9b1a-2d6c1f8e9a01'
const ORIGIN = 'https://orbi-t.netlify.app'

function editorWith(roles: ('member' | 'admin')[], create = async (_: unknown) => ({ id: ID })) {
  const requests: unknown[] = []
  const editor = createInvitationEditor({
    roles: () => roles,
    create: async (request) => { requests.push(request); return create(request) },
    origin: () => ORIGIN,
  })
  return { editor, requests }
}

describe('inviting someone', () => {
  it('sends exactly { email, role }, and then shows the link to share, built from the page’s own origin', async () => {
    const { editor, requests } = editorWith(['member', 'admin'])
    editor.start()
    editor.email.value = '  friend@example.com '
    editor.role.value = 'admin'
    expect(await editor.submit()).toBe(true)
    expect(requests).toEqual([{ email: 'friend@example.com', role: 'admin' }])
    expect(Object.keys(requests[0] as object)).toEqual(['email', 'role'])
    expect(editor.link.value).toBe(`${ORIGIN}/invitations/${ID}`)
    expect(editor.invited.value).toBe('friend@example.com')
    expect(await editor.submit()).toBe(false) // one invitation per submission: the link is showing
  })

  it('offers only the roles the server says this person may offer; Member by default', () => {
    const owner = editorWith(['member', 'admin']).editor
    owner.start()
    expect(owner.roles.value).toEqual(['member', 'admin'])
    expect(owner.role.value).toBe('member')
    const steward = editorWith(['member']).editor
    steward.start()
    expect(steward.roles.value).toEqual(['member'])
  })

  it('never sends a role it wasn’t offered', async () => {
    const { editor, requests } = editorWith(['member'])
    editor.start()
    editor.email.value = 'friend@example.com'
    editor.role.value = 'admin' // as if forced in the page
    expect(await editor.submit()).toBe(false)
    expect(requests).toEqual([])
    expect(editor.error.value).toBe('You can’t offer that role.')
  })

  it('doesn’t open for someone who may not invite', () => {
    const { editor } = editorWith([])
    editor.start()
    expect(editor.open.value).toBe(false)
  })

  it('asks for an address before sending anything, and shows the server’s answer when it refuses', async () => {
    const { editor, requests } = editorWith(['member'], async () => {
      throw { data: { statusMessage: 'That address already has a pending invitation to this workspace.' } }
    })
    editor.start()
    expect(await editor.submit()).toBe(false)
    expect(editor.error.value).toBe('Enter their email address.')
    expect(requests).toEqual([])
    editor.email.value = 'twice@example.com'
    expect(await editor.submit()).toBe(false)
    expect(editor.error.value).toBe('That address already has a pending invitation to this workspace.')
    expect(editor.link.value).toBeNull()
    expect(editor.open.value).toBe(true) // what was typed stays
  })

  it('starts fresh for the next invitation, and can’t be dismissed while creating', async () => {
    let finish: (v: { id: string }) => void = () => {}
    const { editor } = editorWith(['member', 'admin'], () => new Promise((r) => { finish = r }))
    editor.start()
    editor.email.value = 'a@example.com'
    editor.role.value = 'admin'
    const pending = editor.submit()
    expect(editor.cancel()).toBe(false)
    finish({ id: ID })
    await pending
    editor.again()
    expect([editor.email.value, editor.role.value, editor.link.value]).toEqual(['', 'member', null])
    expect(editor.cancel()).toBe(true)
  })
})

describe('invitation links', () => {
  it('are the origin and the invitation’s id, and nothing else', () => {
    expect(invitationLink(ORIGIN, ID)).toBe(`${ORIGIN}/invitations/${ID}`)
    expect(invitationLink(ORIGIN, 'a/b?c')).toBe(`${ORIGIN}/invitations/a%2Fb%3Fc`)
  })

  it('are copied when the browser allows it, and reported when it doesn’t', async () => {
    const written: string[] = []
    expect(await copyText('x', { writeText: async (t: string) => { written.push(t) } })).toBe(true)
    expect(written).toEqual(['x'])
    expect(await copyText('x', { writeText: async () => { throw new Error('denied') } })).toBe(false)
    expect(await copyText('x', undefined)).toBe(false)
  })

  it('survive signing in and the name question, and lead back to the invitation', () => {
    const path = `/invitations/${ID}`
    expect(safeDestination(path)).toBe(path)
    expect(signInPath(path)).toBe(`/sign-in?next=${encodeURIComponent(path)}`)
    expect(welcomePath(path)).toBe(`/welcome?back=${encodeURIComponent(path)}`)
  })

  it('name an invitation page that signed-out visitors may open, and nothing else', () => {
    expect(isInvitationPath(`/invitations/${ID}`)).toBe(true)
    expect(isInvitationPath(`/invitations/${ID}/`)).toBe(true)
    for (const path of ['/invitations', '/invitations/', `/invitations/${ID}/accept`, '/w/x', '/invitationsX/y']) {
      expect(isInvitationPath(path), path).toBe(false)
    }
  })
})

describe('what an invitation’s page shows', () => {
  const preview = { workspaceName: 'Harbour', role: 'admin' as const }
  const mine = (status: 'pending' | 'accepted' | 'declined' | 'revoked' | 'expired', acceptable = status === 'pending') => ({
    id: ID, workspace: { id: 'w', name: 'Harbour', description: null }, role: 'admin' as const, invitedBy: 'Olive',
    expiresAt: '2026-12-04T00:00:00Z', status, acceptable, closedAt: null,
  })

  it('signed out: the preview and a way to sign in, or nothing if it can’t be accepted', () => {
    expect(arrivalOf({ signedIn: false, preview, invitation: null })).toEqual({ kind: 'sign_in', preview })
    expect(arrivalOf({ signedIn: false, preview: null, invitation: null })).toEqual({ kind: 'unavailable' })
  })

  it('signed in as its recipient: answer it, or be told honestly what became of it', () => {
    expect(arrivalOf({ signedIn: true, preview, invitation: mine('pending') }).kind).toBe('answer')
    expect(arrivalOf({ signedIn: true, preview: null, invitation: mine('pending', false) }).kind).toBe('no_longer_valid')
    for (const status of ['accepted', 'declined', 'revoked', 'expired'] as const) {
      expect(arrivalOf({ signedIn: true, preview: null, invitation: mine(status) }).kind, status).toBe('answered')
    }
  })

  it('signed in as someone else: the preview, and nothing of the recipient’s', () => {
    expect(arrivalOf({ signedIn: true, preview, invitation: null })).toEqual({ kind: 'someone_else', preview })
    expect(arrivalOf({ signedIn: true, preview: null, invitation: null })).toEqual({ kind: 'unavailable' })
  })

  it('never uses the recipient’s own view when signed out', () => {
    expect(arrivalOf({ signedIn: false, preview: null, invitation: mine('pending') })).toEqual({ kind: 'unavailable' })
  })

  it('names the roles as the product does', () => {
    expect([roleName('member'), roleName('admin')]).toEqual(['Member', 'Steward'])
  })
})
