import type { Member } from '~~/server/utils/workspaces'

/** How Orbit names someone's place in a workspace. Steward is the product name for `admin`. */
export type Standing = 'Owner' | 'Steward' | 'Member'

/** Ownership comes first: the owner is shown as Owner whatever their membership role. */
export function standingOf(member: Pick<Member, 'role' | 'owner'>): Standing {
  if (member.owner) return 'Owner'
  return member.role === 'admin' ? 'Steward' : 'Member'
}

const ORDER: Standing[] = ['Owner', 'Steward', 'Member']

/** The owner, then stewards, then members; by name within each, unnamed people last. */
export function sortPeople<T extends Pick<Member, 'role' | 'owner' | 'name'>>(members: readonly T[]): T[] {
  return [...members].sort((a, b) =>
    ORDER.indexOf(standingOf(a)) - ORDER.indexOf(standingOf(b))
    || (a.name === null ? 1 : 0) - (b.name === null ? 1 : 0)
    || (a.name ?? '').localeCompare(b.name ?? ''),
  )
}
