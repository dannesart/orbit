import type { InvitationStatus } from './invitations'

/**
 * How the invitation endpoints answer when a domain operation says no. The one mapping from
 * domain results to HTTP, so every endpoint answers the same reason the same way. Each error
 * carries `data.reason` (the domain's own word), and `data.status` when it is no longer pending,
 * so clients never have to parse messages. Authorization itself is decided in
 * server/utils/invitations.ts; this only reports what was decided.
 */
export type InvitationFailure =
  | { reason: 'invalid_body' | 'invalid_email' | 'invalid_role' | 'not_found' | 'forbidden' | 'already_invited' | 'no_longer_valid' }
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
    case 'invalid_role':
      return createError({ statusCode: 422, statusMessage: 'An invitation offers the role member or admin.', data: { ...data, field: 'role' } })
    case 'not_found':
      return createError({ statusCode: 404, statusMessage: notFound, data })
    case 'forbidden':
      // Members manage no invitations; stewards offer and withdraw Member invitations only.
      return createError({ statusCode: 403, statusMessage: 'You can’t do that with this workspace’s invitations.', data })
    case 'no_longer_valid':
      return createError({ statusCode: 409, statusMessage: 'This invitation can no longer be accepted as it was offered.', data })
    case 'already_invited':
      return createError({ statusCode: 409, statusMessage: 'That address already has a pending invitation to this workspace.', data })
    case 'not_pending':
      return createError({ statusCode: 409, statusMessage: NO_LONGER[failure.status], data })
  }
}
