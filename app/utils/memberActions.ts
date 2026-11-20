import { ref } from 'vue'
import type { MembershipAction } from '~~/server/utils/authority'

/**
 * Changing someone's place in a workspace, from People, apart from the components. Which actions
 * a person has is the server's `actions` for each member (its authority model); nothing here
 * decides who may do what. Every change waits for the server: nothing is changed on the page
 * until it confirms, and afterwards the workspace is loaded again as the server sees it.
 */

/** Human words for the server's actions. */
export const actionLabel: Record<MembershipAction, string> = {
  promote: 'Make Steward',
  demote: 'Make Member',
  remove: 'Remove from workspace',
}

export interface MembershipRequest {
  method: 'PATCH' | 'DELETE'
  path: string
  body?: { role: 'admin' | 'member' }
}

/** The one request each action makes: exactly `{ role }` to change it, no body to remove. */
export function membershipRequest(workspaceId: string, membershipId: string, action: MembershipAction): MembershipRequest {
  const path = `/api/workspaces/${encodeURIComponent(workspaceId)}/members/${encodeURIComponent(membershipId)}`
  if (action === 'remove') return { method: 'DELETE', path }
  return { method: 'PATCH', path, body: { role: action === 'promote' ? 'admin' : 'member' } }
}

export interface Person { id: string; name: string | null }
const called = (person: Person) => person.name ?? 'This person'

/** What to say when the server didn't make the change: calmly, and without retrying anything. */
export function conflictMessage(error: unknown, person: Person): string {
  const e = error as { statusCode?: number; data?: { data?: { reason?: string } } }
  const reason = e?.data?.data?.reason
  const name = called(person)
  if (reason === 'stewardship_offered') return `The owner has offered ${name} stewardship, so only the owner can remove them while that offer stands.`
  if (reason === 'role_changed') return `${name}’s responsibilities changed in the meantime, so nothing was changed. This is how things are now.`
  if (reason === 'forbidden') return 'You can no longer do that here. This is how things are now.'
  if (reason === 'not_found' || e?.statusCode === 404) return `${name} is no longer part of this workspace.`
  return 'That didn’t work. Please try again.'
}

function doneMessage(action: MembershipAction, person: Person, workspaceName: string): string {
  const name = called(person)
  if (action === 'promote') return `${name} is now a Steward.`
  if (action === 'demote') return `${name} is now a Member.`
  return `${name} was removed from ${workspaceName}.`
}

export function createMemberActions(options: {
  workspaceId: () => string
  workspaceName: () => string
  send: (request: MembershipRequest) => Promise<unknown>
  /** Loads the workspace (and anything shown with it) again, as the server sees it now. */
  refresh: () => Promise<unknown>
}) {
  /** The membership whose change is with the server. */
  const busy = ref<string | null>(null)
  /** The person whose removal is waiting for confirmation. */
  const removing = ref<Person | null>(null)
  const notice = ref<{ text: string; problem: boolean } | null>(null)

  async function perform(person: Person, action: MembershipAction) {
    busy.value = person.id
    notice.value = null
    try {
      await options.send(membershipRequest(options.workspaceId(), person.id, action))
      notice.value = { text: doneMessage(action, person, options.workspaceName()), problem: false }
    } catch (error) {
      notice.value = { text: conflictMessage(error, person), problem: true }
    } finally {
      // Either way, show how things are now: the change, or why it didn't happen.
      await options.refresh()
      busy.value = null
    }
  }

  /** Changing responsibilities happens at once; removal asks once first. */
  async function choose(person: Person, action: MembershipAction) {
    if (busy.value) return
    if (action === 'remove') {
      removing.value = person
      return
    }
    await perform(person, action)
  }

  async function confirmRemoval() {
    const person = removing.value
    if (!person || busy.value) return
    await perform(person, 'remove')
    removing.value = null
  }

  /** Keeps them; nothing is sent. Not while the removal is with the server. */
  function cancelRemoval() {
    if (busy.value) return false
    removing.value = null
    return true
  }

  return { busy, removing, notice, choose, confirmRemoval, cancelRemoval }
}
