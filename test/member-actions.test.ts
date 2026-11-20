// Changing someone's place from People, apart from its components: the exact requests, one
// confirmation before removal or transfer, refreshing after every outcome, and calm answers to
// conflicts.
import { describe, expect, it } from 'vitest'
import {
  STALE_NOTICE, actionLabel, choiceLabel, conflictMessage, createMemberActions, membershipRequest, menuChoices, ownershipRequest,
  transferCopy, type MembershipRequest,
} from '../app/utils/memberActions'

const WS = 'w-1'
const MIA = { id: 'm-1', name: 'Mia' }

/**
 * `reload`: what refresh() does: load the current state (true), fail to (false), or throw.
 * `reply`: what the server answers a successful request with.
 */
function harness(fail?: unknown, reload: 'current' | 'failed' | 'throws' = 'current', reply?: unknown) {
  const sent: MembershipRequest[] = []
  let refreshed = 0
  const actions = createMemberActions({
    workspaceId: () => WS,
    workspaceName: () => 'Harbour',
    send: async (request) => { sent.push(request); if (fail) throw fail; return reply },
    refresh: async () => {
      refreshed++
      if (reload === 'throws') throw new Error('network')
      return reload === 'current'
    },
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

describe('when People can’t be loaded again afterwards (regression)', () => {
  for (const reload of ['failed', 'throws'] as const) {
    it(`reports a successful change truthfully, without presenting the list as current: reload ${reload}`, async () => {
      const { actions, sent, refreshed } = harness(undefined, reload)
      await actions.choose(MIA, 'promote')
      expect(sent).toHaveLength(1) // the change itself is neither undone nor retried
      expect(refreshed()).toBe(1) // nor is the reload retried
      expect(actions.notice.value).toEqual({ text: `Mia is now a Steward. ${STALE_NOTICE}`, problem: true })
      expect(actions.busy.value).toBeNull()
    })
  }

  it('never says “this is how things are now” about a list that wasn’t reloaded', async () => {
    for (const reason of ['role_changed', 'forbidden']) {
      const { actions } = harness(refusal(reason === 'forbidden' ? 403 : 409, reason), 'failed')
      await actions.choose(MIA, 'remove')
      await actions.confirmRemoval()
      expect(actions.notice.value?.text, reason).not.toContain('This is how things are now')
      expect(actions.notice.value?.text, reason).toContain(STALE_NOTICE)
      expect(actions.notice.value?.problem).toBe(true)
    }
  })

  it('after a removal too', async () => {
    const { actions } = harness(undefined, 'failed')
    await actions.choose(MIA, 'remove')
    await actions.confirmRemoval()
    expect(actions.notice.value).toEqual({ text: `Mia was removed from Harbour. ${STALE_NOTICE}`, problem: true })
    expect(actions.removing.value).toBeNull()
  })

  it('keeps the plain message when the reload did succeed', async () => {
    const { actions } = harness(refusal(409, 'role_changed'))
    await actions.choose(MIA, 'promote')
    expect(actions.notice.value?.text).toBe('Mia’s responsibilities changed in the meantime, so nothing was changed. This is how things are now.')
    expect(conflictMessage(refusal(409, 'role_changed'), MIA, false)).toBe('Mia’s responsibilities changed in the meantime, so nothing was changed.')
  })
})

describe('handing someone ownership', () => {
  const OWNERSHIP = { method: 'POST', path: '/api/workspaces/w-1/members/m-1/ownership' }

  it('is offered only where the server says transferable, beside the server’s actions, removal last', () => {
    expect(menuChoices({ actions: ['promote', 'remove'], transferable: true })).toEqual(['promote', 'transfer', 'remove'])
    expect(menuChoices({ actions: ['demote', 'remove'], transferable: true })).toEqual(['demote', 'transfer', 'remove'])
    expect(menuChoices({ actions: ['promote', 'remove'], transferable: false })).toEqual(['promote', 'remove'])
    expect(menuChoices({ actions: ['remove'], transferable: false })).toEqual(['remove']) // a steward's menu
    expect(menuChoices({ actions: [], transferable: false })).toEqual([])
    expect(menuChoices({ actions: [], transferable: true })).toEqual(['transfer']) // decided by the server alone
    expect(choiceLabel.transfer).toBe('Transfer ownership')
    expect(Object.keys(actionLabel)).toEqual(['promote', 'demote', 'remove']) // the server's vocabulary is unchanged
  })

  it('makes exactly a POST to the member’s ownership, with no body', () => {
    const request = ownershipRequest(WS, 'm-1')
    expect(request).toEqual(OWNERSHIP)
    expect('body' in request).toBe(false)
    expect(ownershipRequest('a/b', 'c?d').path).toBe('/api/workspaces/a%2Fb/members/c%3Fd/ownership')
  })

  it('asks once first, and sends nothing until confirmed', async () => {
    const { actions, sent, refreshed } = harness(undefined, 'current', { revokedInvitations: 0 })
    await actions.choose(MIA, 'transfer')
    expect(actions.transferring.value).toEqual(MIA)
    expect(actions.removing.value).toBeNull()
    expect(actions.busy.value).toBeNull()
    expect([sent, refreshed()]).toEqual([[], 0])
    await actions.confirmTransfer()
    expect(sent).toEqual([OWNERSHIP])
    expect(refreshed()).toBe(1)
    expect(actions.transferring.value).toBeNull()
    expect(actions.notice.value).toEqual({ text: 'Mia now owns Harbour. You’re a Steward here.', problem: false })
  })

  it('keeps ownership where it is if cancelled: nothing is sent or reloaded', async () => {
    const { actions, sent, refreshed } = harness()
    await actions.choose(MIA, 'transfer')
    expect(actions.cancelTransfer()).toBe(true)
    expect(actions.transferring.value).toBeNull()
    await actions.confirmTransfer() // nothing left to confirm
    expect([sent, refreshed(), actions.notice.value]).toEqual([[], 0, null])
  })

  it('is one request at a time: no second submission, no cancelling or other change while it is with the server', async () => {
    let finish: (value: unknown) => void = () => {}
    const sent: MembershipRequest[] = []
    const actions = createMemberActions({
      workspaceId: () => WS, workspaceName: () => 'Harbour',
      send: (r) => { sent.push(r); return new Promise((resolve) => { finish = resolve }) },
      refresh: async () => true,
    })
    await actions.choose(MIA, 'transfer')
    const pending = actions.confirmTransfer()
    expect(actions.busy.value).toBe('m-1') // the page shows it is in progress; nothing else has changed
    await actions.confirmTransfer() // a second press
    expect(actions.cancelTransfer()).toBe(false)
    await actions.choose({ id: 'm-2', name: 'Sam' }, 'promote')
    await actions.choose({ id: 'm-2', name: 'Sam' }, 'remove')
    expect(actions.removing.value).toBeNull()
    finish({ revokedInvitations: 0 })
    await pending
    expect(sent).toEqual([OWNERSHIP])
    expect(actions.busy.value).toBeNull()
  })

  it('tells the former owner how many of their Steward invitations were withdrawn, as the server counted', async () => {
    const said = async (reply: unknown) => {
      const { actions } = harness(undefined, 'current', reply)
      await actions.choose(MIA, 'transfer')
      await actions.confirmTransfer()
      return actions.notice.value?.text
    }
    expect(await said({ revokedInvitations: 0 })).toBe('Mia now owns Harbour. You’re a Steward here.')
    expect(await said({ revokedInvitations: 1 })).toBe('Mia now owns Harbour. You’re a Steward here. The Steward invitation you’d sent was withdrawn.')
    expect(await said({ revokedInvitations: 3 })).toBe('Mia now owns Harbour. You’re a Steward here. The 3 Steward invitations you’d sent were withdrawn.')
    for (const odd of [null, undefined, {}, { revokedInvitations: '2' }, { revokedInvitations: -1 }, { revokedInvitations: 1.5 }]) {
      expect(await said(odd), JSON.stringify(odd)).toBe('Mia now owns Harbour. You’re a Steward here.') // never a count it wasn't given
    }
  })

  it('names someone without a name gently', async () => {
    const { actions } = harness(undefined, 'current', { revokedInvitations: 0 })
    await actions.choose({ id: 'm-3', name: null }, 'transfer')
    await actions.confirmTransfer()
    expect(actions.notice.value?.text).toBe('This person now owns Harbour. You’re a Steward here.')
  })

  const refusals: [string, unknown, string][] = [
    ['no longer the owner (stale page)', refusal(403, 'forbidden'), 'You can no longer do that here. This is how things are now.'],
    ['the recipient is no longer here', refusal(404, 'not_found'), 'Mia is no longer part of this workspace.'],
    ['anything else', new Error('network'), 'That didn’t work. Please try again.'],
  ]
  for (const [label, error, message] of refusals) {
    it(`says so calmly when refused, shows how things are now, and never retries: ${label}`, async () => {
      const { actions, sent, refreshed } = harness(error)
      await actions.choose(MIA, 'transfer')
      await actions.confirmTransfer()
      expect(sent).toEqual([OWNERSHIP])
      expect(refreshed()).toBe(1)
      expect(actions.notice.value).toEqual({ text: message, problem: true })
      expect(actions.transferring.value).toBeNull()
    })
  }

  for (const reload of ['failed', 'throws'] as const) {
    it(`reports a transfer that succeeded as done, never as current, when People can’t be reloaded: reload ${reload}`, async () => {
      const { actions, sent, refreshed } = harness(undefined, reload, { revokedInvitations: 1 })
      await actions.choose(MIA, 'transfer')
      await actions.confirmTransfer()
      expect([sent.length, refreshed()]).toEqual([1, 1]) // neither the transfer nor the reload is retried
      expect(actions.notice.value).toEqual({
        text: `Mia now owns Harbour. You’re a Steward here. The Steward invitation you’d sent was withdrawn. ${STALE_NOTICE}`,
        problem: true,
      })
    })
  }

  it('never says “this is how things are now” about a stale list after a refused transfer', async () => {
    const { actions } = harness(refusal(403, 'forbidden'), 'failed')
    await actions.choose(MIA, 'transfer')
    await actions.confirmTransfer()
    expect(actions.notice.value).toEqual({ text: `You can no longer do that here. ${STALE_NOTICE}`, problem: true })
  })
})

describe('the confirmation before handing someone ownership', () => {
  it('says who, which workspace, and what changes for both of them and for invitations', () => {
    expect(transferCopy({ name: 'Mia', role: 'member' }, 'Harbour')).toEqual({
      title: 'Make Mia the owner of Harbour?',
      who: 'Mia is a Member here now.',
      points: [
        'They’ll have full control of Harbour right away, including changing your role or removing you.',
        'You’ll stay, as a Steward.',
        'Only they will be able to transfer ownership again.',
        'Any Steward invitations you’ve sent that are still pending will be withdrawn. Member invitations stay as they are.',
      ],
    })
    expect(transferCopy({ name: 'Sam', role: 'admin' }, 'Harbour').who).toBe('Sam is a Steward here now.')
  })

  it('describes someone without a name by what People shows, without inventing anything', () => {
    const copy = transferCopy({ name: null, role: 'admin' }, 'Harbour')
    expect(copy.title).toBe('Make this person the owner of Harbour?')
    expect(copy.who).toBe('They haven’t added a name yet, and are a Steward here now.')
  })

  it('tells two people with the same name apart only by their current role (the limit of what People shows)', () => {
    const stewardSam = transferCopy({ name: 'Sam', role: 'admin' }, 'Harbour')
    const memberSam = transferCopy({ name: 'Sam', role: 'member' }, 'Harbour')
    expect(stewardSam.who).not.toBe(memberSam.who)
    // Same name and same role: the words are identical. The request still names the membership
    // whose menu was opened, so it always reaches that person; the words alone can't say which.
    expect(transferCopy({ name: 'Sam', role: 'member' }, 'Harbour')).toEqual(memberSam)
  })
})
