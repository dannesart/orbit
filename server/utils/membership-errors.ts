import type { ChangeMemberResult, RemoveMemberResult } from './memberships'
import type { TransferOwnershipResult } from './ownership'

/**
 * How the membership endpoints answer when a domain operation says no: the one mapping from
 * domain results to HTTP for them, as invitation-errors.ts is for invitations. Each error carries
 * `data.reason`, the domain's own word, and `data.role` when the target's role changed meanwhile.
 * What is allowed is decided in the domain (authority.ts, memberships.ts); this only reports it.
 */
export type MembershipFailure = Exclude<ChangeMemberResult | RemoveMemberResult | TransferOwnershipResult, { ok: true }>

export function membershipFailure(failure: MembershipFailure) {
  switch (failure.reason) {
    case 'invalid_role':
      return createError({ statusCode: 422, statusMessage: 'A role is member or admin.', data: { reason: failure.reason, field: 'role' } })
    case 'not_found':
      // Outsiders, other workspaces' memberships and unknown ids alike: nothing is confirmed.
      return createError({ statusCode: 404, statusMessage: 'Member not found', data: { reason: failure.reason } })
    case 'forbidden':
      return createError({ statusCode: 403, statusMessage: 'You can’t do that to this person’s place here.', data: { reason: failure.reason } })
    case 'stewardship_offered':
      return createError({ statusCode: 409, statusMessage: 'The owner has offered this person stewardship; only the owner can remove them while that offer stands.', data: { reason: failure.reason } })
    case 'role_changed':
      return createError({ statusCode: 409, statusMessage: 'This person’s role changed in the meantime.', data: { reason: failure.reason, role: failure.role } })
  }
}
