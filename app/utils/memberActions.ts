import { ref } from 'vue'
import type { MembershipAction } from '~~/server/utils/authority'
import type { Role } from '~~/server/utils/workspaces'

/**
 * Changing someone's place in a workspace, from People, apart from the components. Which actions
 * a person has is the server's `actions` for each member (its authority model), and whether
 * ownership may be handed to them is the server's `transferable`; nothing here decides who may do
 * what. Every change waits for the server: nothing is changed on the page until it confirms, and
 * afterwards the workspace is loaded again as the server sees it.
 */

/** Human words for the server's actions. */
export const actionLabel: Record<MembershipAction, string> = {
  promote: 'Make Steward',
  demote: 'Make Member',
  remove: 'Remove from workspace',
}

/**
 * What can be chosen for a person: the server's actions, plus handing them ownership. 'transfer'
 * exists only here, in the page; the server's `actions` vocabulary never contains it (it says
 * `transferable` instead), so browsers that predate transfer never meet a value they don't know.
 */
export type PersonChoice = MembershipAction | 'transfer'

export const choiceLabel: Record<PersonChoice, string> = { ...actionLabel, transfer: 'Transfer ownership' }

/**
 * The menu for one person, exactly as the server allows: its actions, and Transfer ownership only
 * when `transferable` is true. Removal stays last.
 */
export function menuChoices(member: { actions: readonly MembershipAction[]; transferable: boolean }): PersonChoice[] {
  const kept = member.actions.filter((a) => a !== 'remove')
  return [...kept, ...(member.transferable ? ['transfer' as const] : []), ...(member.actions.includes('remove') ? ['remove' as const] : [])]
}

export interface MembershipRequest {
  method: 'PATCH' | 'DELETE' | 'POST'
  path: string
  body?: { role: 'admin' | 'member' }
}

const memberPath = (workspaceId: string, membershipId: string) =>
  `/api/workspaces/${encodeURIComponent(workspaceId)}/members/${encodeURIComponent(membershipId)}`

/** The one request each action makes: exactly `{ role }` to change it, no body to remove. */
export function membershipRequest(workspaceId: string, membershipId: string, action: MembershipAction): MembershipRequest {
  const path = memberPath(workspaceId, membershipId)
  if (action === 'remove') return { method: 'DELETE', path }
  return { method: 'PATCH', path, body: { role: action === 'promote' ? 'admin' : 'member' } }
}

/** Handing ownership to a member: a POST with no body, naming them by membership id. */
export function ownershipRequest(workspaceId: string, membershipId: string): MembershipRequest {
  return { method: 'POST', path: `${memberPath(workspaceId, membershipId)}/ownership` }
}

const requestFor = (workspaceId: string, membershipId: string, choice: PersonChoice) =>
  choice === 'transfer' ? ownershipRequest(workspaceId, membershipId) : membershipRequest(workspaceId, membershipId, choice)

export interface Person { id: string; name: string | null }
const called = (person: Person) => person.name ?? 'This person'

/**
 * The confirmation before handing someone ownership, in words. People shows names only (never
 * addresses), so the person is described by what the page already shows about them: their name,
 * or that they haven't added one, and their current place here. The request itself names their
 * membership, so it always reaches the person whose menu was opened.
 */
export function transferCopy(person: { name: string | null; role: Role }, workspaceName: string) {
  const place = person.role === 'admin' ? 'a Steward' : 'a Member'
  return {
    title: `Make ${person.name ?? 'this person'} the owner of ${workspaceName}?`,
    who: person.name
      ? `${person.name} is ${place} here now.`
      : `They haven’t added a name yet, and are ${place} here now.`,
    points: [
      `They’ll have full control of ${workspaceName} right away, including changing your role or removing you.`,
      'You’ll stay, as a Steward.',
      'Only they will be able to transfer ownership again.',
      'Any Steward invitations you’ve sent that are still pending will be withdrawn. Member invitations stay as they are.',
    ],
  }
}

/** Said whenever People couldn't be loaded again: what is shown may not be current. */
export const STALE_NOTICE = 'People couldn’t be updated, so the list may be out of date. Reload the page to see the latest.'

/**
 * What to say when the server didn't make the change: calmly, and without retrying anything.
 * "This is how things are now" only when the list was in fact loaded again (`fresh`).
 */
export function conflictMessage(error: unknown, person: Person, fresh = true): string {
  const e = error as { statusCode?: number; data?: { data?: { reason?: string } } }
  const reason = e?.data?.data?.reason
  const name = called(person)
  const now = fresh ? ' This is how things are now.' : ''
  if (reason === 'stewardship_offered') return `The owner has offered ${name} stewardship, so only the owner can remove them while that offer stands.`
  if (reason === 'role_changed') return `${name}’s responsibilities changed in the meantime, so nothing was changed.${now}`
  if (reason === 'forbidden') return `You can no longer do that here.${now}`
  if (reason === 'not_found' || e?.statusCode === 404) return `${name} is no longer part of this workspace.`
  return 'That didn’t work. Please try again.'
}

/** How many Steward invitations a transfer withdrew, as the server counted them (or null if unknown). */
const withdrawnCount = (result: unknown): number | null => {
  const n = (result as { revokedInvitations?: unknown } | null)?.revokedInvitations
  return typeof n === 'number' && Number.isInteger(n) && n >= 0 ? n : null
}

function doneMessage(choice: PersonChoice, person: Person, workspaceName: string, result: unknown): string {
  const name = called(person)
  if (choice === 'promote') return `${name} is now a Steward.`
  if (choice === 'demote') return `${name} is now a Member.`
  if (choice === 'remove') return `${name} was removed from ${workspaceName}.`
  const n = withdrawnCount(result)
  const withdrawn = n === 1 ? ' The Steward invitation you’d sent was withdrawn.'
    : n && n > 1 ? ` The ${n} Steward invitations you’d sent were withdrawn.` : ''
  return `${name} now owns ${workspaceName}. You’re a Steward here.${withdrawn}`
}

export function createMemberActions(options: {
  workspaceId: () => string
  workspaceName: () => string
  send: (request: MembershipRequest) => Promise<unknown>
  /**
   * Loads the workspace (and anything shown with it) again, as the server sees it now. Resolves
   * true only when what is shown is now current; false (or a throw) means it may not be.
   */
  refresh: () => Promise<boolean>
}) {
  /** The membership whose change is with the server. */
  const busy = ref<string | null>(null)
  /** The person whose removal is waiting for confirmation. */
  const removing = ref<Person | null>(null)
  /** The person who would become owner, waiting for confirmation. */
  const transferring = ref<Person | null>(null)
  const notice = ref<{ text: string; problem: boolean } | null>(null)

  /**
   * Two separate facts, each told truthfully: whether the server made the change, and whether
   * the list was loaded again afterwards. A change that succeeded is never undone or retried
   * because the reload failed; the list is just never presented as current when it may not be.
   */
  async function perform(person: Person, choice: PersonChoice) {
    busy.value = person.id
    notice.value = null
    let refused: unknown = null
    let result: unknown = null
    try {
      result = await options.send(requestFor(options.workspaceId(), person.id, choice))
    } catch (error) {
      refused = error ?? new Error('refused')
    }
    // Either way, load how things are now: the change, or why it didn't happen.
    const fresh = await options.refresh().then((current) => current === true, () => false)
    const outcome = refused ? conflictMessage(refused, person, fresh) : doneMessage(choice, person, options.workspaceName(), result)
    notice.value = { text: fresh ? outcome : `${outcome} ${STALE_NOTICE}`, problem: !!refused || !fresh }
    busy.value = null
  }

  /** Changing responsibilities happens at once; removal and transfer ask once first. */
  async function choose(person: Person, choice: PersonChoice) {
    if (busy.value) return
    if (choice === 'remove') {
      removing.value = person
      return
    }
    if (choice === 'transfer') {
      transferring.value = person
      return
    }
    await perform(person, choice)
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

  async function confirmTransfer() {
    const person = transferring.value
    if (!person || busy.value) return
    await perform(person, 'transfer')
    transferring.value = null
  }

  /** Ownership stays where it is; nothing is sent. Not while the transfer is with the server. */
  function cancelTransfer() {
    if (busy.value) return false
    transferring.value = null
    return true
  }

  return { busy, removing, transferring, notice, choose, confirmRemoval, cancelRemoval, confirmTransfer, cancelTransfer }
}
