import type { Member } from '~~/server/utils/workspaces'

/** How Orbit names someone's place in a workspace. Steward is the product name for `admin`. */
export type Standing = 'Owner' | 'Steward' | 'Member'

/** The owner is named Owner whatever their membership role (ownership is owner_id, not a role). */
export function standingOf(member: Pick<Member, 'role' | 'owner'>): Standing {
  if (member.owner) return 'Owner'
  return member.role === 'admin' ? 'Steward' : 'Member'
}

/**
 * Everyone, by name, with unnamed people last: belonging comes first, so nobody is ranked by
 * responsibility. Roles are shown beside each name, quietly and alike.
 */
export function sortPeople<T extends Pick<Member, 'name'>>(members: readonly T[]): T[] {
  return [...members].sort((a, b) =>
    (a.name === null ? 1 : 0) - (b.name === null ? 1 : 0)
    || (a.name ?? '').localeCompare(b.name ?? ''),
  )
}
