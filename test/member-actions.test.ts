// Changing someone's place from People, apart from its components: the exact requests, one
// confirmation before removal, refreshing after every outcome, and calm answers to conflicts.
import { describe, expect, it } from 'vitest'
import { actionLabel, conflictMessage, createMemberActions, membershipRequest, type MembershipRequest } from '../app/utils/memberActions'

const WS = 'w-1'
const MIA = { id: 'm-1', name: 'Mia' }

function harness(fail?: unknown) {
  const sent: MembershipRequest[] = []
  let refreshed = 0
  const actions = createMemberActions({
    workspaceId: () => WS,
    workspaceName: () => 'Harbour',
    send: async (request) => { sent.push(request); if (fail) throw fail },
    refresh: async () => { refreshed++ },
  })
  return { actions, sent, refreshed: () => refreshed }
}
const refusal = (statusCode: number, reason: string) => ({ statusCode, data: { statusCode, data: { reason } } })

describe('the words and the requests', () => {
  it('uses human words, not promote and demote', () => {
    expect(actionLabel).toEqual({ promote: 'Make Steward', demote: 'Make Member', remove: 'Remove from workspace' })
  })

  it('makes exactly { role } to change responsibilities and no body to remove', () => {
    expect(membershipRequest(WS, 'm-1', 'promote')).toEqual({ method: 'PATCH', path: '/api/workspaces/w-1/members/m-1', body: { role: 'admin' } })
    expect(membershipRequest(WS, 'm-1', 'demote')).toEqual({ method: 'PATCH', path: '/api/workspaces/w-1/members/m-1', body: { role: 'member' } })
    expect(membershipRequest(WS, 'm-1', 'remove')).toEqual({ method: 'DELETE', path: '/api/workspaces/w-1/members/m-1' })
    expect(membershipRequest('a/b', 'c?d', 'remove').path).toBe('/api/workspaces/a%2Fb/members/c%3Fd')
  })
})

describe('changing responsibilities', () => {
  it('happens at once, waits for the server, then shows how things are', async () => {
    const { actions, sent, refreshed } = harness()
    const pending = actions.choose(MIA, 'promote')
    expect(actions.busy.value).toBe('m-1') // nothing changes on the page until the server answers
    await pending
    expect(sent).toEqual([{ method: 'PATCH', path: '/api/workspaces/w-1/members/m-1', body: { role: 'admin' } }])
    expect(refreshed()).toBe(1)
    expect(actions.notice.value).toEqual({ text: 'Mia is now a Steward.', problem: false })
    expect(actions.busy.value).toBeNull()
    expect(actions.removing.value).toBeNull() // no confirmation for this
  })

  it('takes one change at a time', async () => {
    const { actions, sent } = harness()
    const first = actions.choose(MIA, 'demote')
    await actions.choose({ id: 'm-2', name: 'Sam' }, 'promote') // ignored while the first is with the server
    await first
    expect(sent).toHaveLength(1)
    expect(actions.notice.value?.text).toBe('Mia is now a Member.')
  })
})

describe('removing someone', () => {
  it('asks once first, and sends nothing until confirmed', async () => {
    const { actions, sent, refreshed } = harness()
    await actions.choose(MIA, 'remove')
    expect(actions.removing.value).toEqual(MIA)
    expect(sent).toEqual([])
    await actions.confirmRemoval()
    expect(sent).toEqual([{ method: 'DELETE', path: '/api/workspaces/w-1/members/m-1' }])
    expect(refreshed()).toBe(1)
    expect(actions.removing.value).toBeNull()
    expect(actions.notice.value).toEqual({ text: 'Mia was removed from Harbour.', problem: false })
  })

  it('keeps them if cancelled: nothing is sent', async () => {
    const { actions, sent, refreshed } = harness()
    await actions.choose(MIA, 'remove')
    expect(actions.cancelRemoval()).toBe(true)
    expect(actions.removing.value).toBeNull()
    await actions.confirmRemoval() // nothing left to confirm
    expect(sent).toEqual([])
    expect(refreshed()).toBe(0)
  })

  it('can’t be cancelled while it is with the server', async () => {
    let finish: () => void = () => {}
    const sent: MembershipRequest[] = []
    const actions = createMemberActions({
      workspaceId: () => WS, workspaceName: () => 'Harbour',
      send: (r) => { sent.push(r); return new Promise<void>((resolve) => { finish = resolve }) },
      refresh: async () => {},
    })
    await actions.choose(MIA, 'remove')
    const pending = actions.confirmRemoval()
    expect(actions.cancelRemoval()).toBe(false)
    await actions.confirmRemoval() // not sent twice
    finish()
    await pending
    expect(sent).toHaveLength(1)
  })
})

describe('when the server doesn’t make the change', () => {
  const cases: [string, unknown, string][] = [
    ['stewardship_offered', refusal(409, 'stewardship_offered'), 'The owner has offered Mia stewardship, so only the owner can remove them while that offer stands.'],
    ['role_changed', refusal(409, 'role_changed'), 'Mia’s responsibilities changed in the meantime, so nothing was changed. This is how things are now.'],
    ['forbidden (authority lost)', refusal(403, 'forbidden'), 'You can no longer do that here. This is how things are now.'],
    ['not_found (already gone)', refusal(404, 'not_found'), 'Mia is no longer part of this workspace.'],
    ['anything else', new Error('network'), 'That didn’t work. Please try again.'],
  ]
  for (const [label, error, message] of cases) {
    it(`says so calmly, shows how things are now, and never retries: ${label}`, async () => {
      const { actions, sent, refreshed } = harness(error)
      await actions.choose(MIA, 'remove')
      await actions.confirmRemoval()
      expect(sent).toEqual([{ method: 'DELETE', path: '/api/workspaces/w-1/members/m-1' }]) // once, as asked
      expect(refreshed()).toBe(1)
      expect(actions.notice.value).toEqual({ text: message, problem: true })
    })
  }

  it('never turns a refused change into another action', async () => {
    const { actions, sent } = harness(refusal(409, 'role_changed'))
    await actions.choose(MIA, 'promote')
    expect(sent.map((r) => [r.method, r.body])).toEqual([['PATCH', { role: 'admin' }]])
  })

  it('names someone without a name gently', () => {
    expect(conflictMessage(refusal(404, 'not_found'), { id: 'x', name: null })).toBe('This person is no longer part of this workspace.')
  })
})
