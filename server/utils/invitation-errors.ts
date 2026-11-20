import type { InvitationStatus } from './invitations'

/**
 * How the invitation endpoints answer when a domain operation says no. The one mapping from
 * domain results to HTTP, so every endpoint answers the same reason the same way. Each error
 * carries `data.reason` (the domain's own word), and `data.status` when it is no longer pending,
 * so clients never have to parse messages. Authorization itself is decided in
 * server/utils/invitations.ts; this only reports what was decided.
 */
export type InvitationFailure =
  | { reason: 'invalid_body' | 'invalid_email' | 'not_found' | 'forbidden' | 'already_invited' }
  | { reason: 'not_pending'; status: InvitationStatus }

const NO_LONGER: Record<InvitationStatus, string> = {
  pending: 'This invitation is no longer pending.', // not reached: a pending one is answered
  expired: 'This invitation has expired.',
  revoked: 'This invitation was withdrawn.',
  declined: 'This invitation was declined.',
  accepted: 'This invitation has already been accepted.',
}

/**
 * `notFound` names what wasn't found: the workspace, for the workspace's invitation endpoints
 * (whose outsiders must not learn it exists), otherwise the invitation.
 */
export function invitationFailure(failure: InvitationFailure, notFound = 'Invitation not found') {
  const data = 'status' in failure ? { reason: failure.reason, status: failure.status } : { reason: failure.reason }
  switch (failure.reason) {
    case 'invalid_body':
      return createError({ statusCode: 422, statusMessage: 'Send the invitation as an object with an email.', data })
    case 'invalid_email':
      return createError({ statusCode: 422, statusMessage: 'That doesn’t look like an email address.', data: { ...data, field: 'email' } })
    case 'not_found':
      return createError({ statusCode: 404, statusMessage: notFound, data })
    case 'forbidden':
      return createError({ statusCode: 403, statusMessage: 'Only this workspace’s owner and stewards can manage its invitations.', data })
    case 'already_invited':
      return createError({ statusCode: 409, statusMessage: 'That address already has a pending invitation to this workspace.', data })
    case 'not_pending':
      return createError({ statusCode: 409, statusMessage: NO_LONGER[failure.status], data })
  }
}
