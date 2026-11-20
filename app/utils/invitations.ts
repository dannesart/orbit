import { computed, ref } from 'vue'
import type { InvitationPreview, RecipientInvitation } from '~~/server/utils/invitations'
import type { Role } from '~~/server/utils/workspaces'

/** The product's names for the roles an invitation can offer. */
export const roleName = (role: Role) => (role === 'admin' ? 'Steward' : 'Member')

/** What an offered role means, in one sentence, said the same way before and after signing in. */
export const roleMeaning: Record<Role, string> = {
  member: 'You’ll belong here and take part.',
  admin: 'You’ll belong here, take part and help look after it.',
}

/**
 * An invitation's link, built in the browser from the origin the person is actually using
 * (window.location.origin): never from a server-side Host header, which a request can set.
 * The id is the whole token; nothing about the recipient is in the link.
 */
export const invitationLink = (origin: string, id: string) => `${origin}/invitations/${encodeURIComponent(id)}`

/** Copies text to the clipboard. False when the browser won't (then the link stays shown to copy by hand). */
export async function copyText(text: string, clipboard: Pick<Clipboard, 'writeText'> | undefined): Promise<boolean> {
  if (!clipboard) return false
  try {
    await clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

export interface InvitationRequest { email: string; role: Role }

/**
 * Inviting someone, apart from the dialog element: an email and a role (the roles offered are
 * the server's `invitationRoles`, never decided here), one action, then the link to share.
 * The request is exactly { email, role }. Nothing claims an email was sent: Orbit sends none.
 */
export function createInvitationEditor(options: {
  roles: () => Role[]
  create: (request: InvitationRequest) => Promise<{ id: string }>
  origin: () => string
}) {
  const open = ref(false)
  const email = ref('')
  const role = ref<Role>('member')
  const error = ref('')
  const saving = ref(false)
  const link = ref<string | null>(null)
  const invited = ref('')
  const roles = computed(() => options.roles())

  function reset() {
    email.value = ''
    role.value = roles.value[0] ?? 'member'
    error.value = ''
    link.value = null
    invited.value = ''
  }

  /** Opens it for a new invitation; does nothing for someone who may not invite. */
  function start() {
    if (open.value || roles.value.length === 0) return
    reset()
    open.value = true
  }

  /** Closes it, unless an invitation is being created. */
  function cancel() {
    if (saving.value) return false
    open.value = false
    return true
  }

  /** Returns whether an invitation was created (the link is then shown). */
  async function submit() {
    if (!open.value || saving.value || link.value) return false
    error.value = ''
    const request: InvitationRequest = { email: email.value.trim(), role: role.value }
    if (!request.email) {
      error.value = 'Enter their email address.'
      return false
    }
    if (!roles.value.includes(request.role)) {
      error.value = 'You can’t offer that role.' // the server would refuse it too
      return false
    }
    saving.value = true
    try {
      const created = await options.create(request)
      invited.value = request.email
      link.value = invitationLink(options.origin(), created.id)
      return true
    } catch (e: any) {
      error.value = e?.data?.statusMessage || 'That didn’t work. Please try again.'
      return false
    } finally {
      saving.value = false
    }
  }

  return { open, email, role, roles, error, saving, link, invited, start, cancel, submit, again: reset }
}

/**
 * What someone opening an invitation's link sees, from what the server will tell them:
 *   sign_in         signed out, and the invitation can be accepted (the public preview)
 *   answer          signed in as its recipient, and it can be accepted
 *   no_longer_valid its recipient, pending, but its offer no longer stands
 *   answered        its recipient, and it was accepted, declined, withdrawn or has expired
 *   someone_else    signed in, but it is addressed to another email address
 *   unavailable     nothing to show: unknown, or not acceptable and not theirs (or signed out)
 * The recipient's own view (`detail`) exists only for the account it was addressed to.
 */
export type Arrival =
  | { kind: 'sign_in' | 'someone_else'; preview: InvitationPreview }
  | { kind: 'answer' | 'no_longer_valid' | 'answered'; invitation: RecipientInvitation }
  | { kind: 'unavailable' }

export function arrivalOf(input: { signedIn: boolean; preview: InvitationPreview | null; invitation: RecipientInvitation | null }): Arrival {
  const { signedIn, preview, invitation } = input
  if (signedIn && invitation) {
    if (invitation.status !== 'pending') return { kind: 'answered', invitation }
    return { kind: invitation.acceptable ? 'answer' : 'no_longer_valid', invitation }
  }
  if (!preview) return { kind: 'unavailable' }
  return { kind: signedIn ? 'someone_else' : 'sign_in', preview }
}

/**
 * The heading for each step of arriving at an invitation, so that signing in reads as one
 * journey: invited, then ready to join. Never a step that accepts by itself.
 */
export function arrivalTitle(arrival: Arrival, workspaceName: string): string {
  switch (arrival.kind) {
    case 'sign_in': return `You’ve been invited to join ${workspaceName}`
    case 'answer': return `You’re ready to join ${workspaceName}`
    case 'someone_else': return `An invitation to join ${workspaceName}`
    case 'no_longer_valid':
    case 'answered': return `Your invitation to join ${workspaceName}`
    case 'unavailable': return 'This invitation isn’t available'
  }
}

/** Whether a path is an invitation's page: open to signed-out visitors, for its public preview. */
export const isInvitationPath = (path: string) => /^\/invitations\/[^/]+\/?$/.test(path)
