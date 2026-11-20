import { describe, expect, it } from 'vitest'
import { sortPeople, standingOf } from '../app/utils/people'

describe('how Orbit names someone’s place in a workspace', () => {
  it('maps ownership and membership roles to Owner, Steward and Member', () => {
    expect(standingOf({ role: 'admin', owner: true })).toBe('Owner')
    expect(standingOf({ role: 'admin', owner: false })).toBe('Steward')
    expect(standingOf({ role: 'member', owner: false })).toBe('Member')
  })

  it('names the owner Owner whatever their membership role', () => {
    expect(standingOf({ role: 'member', owner: true })).toBe('Owner')
  })

  it('lists everyone by name, unnamed people last, never ranked by responsibility', () => {
    const people = [
      { name: 'Zoë', role: 'member', owner: false },
      { name: null, role: 'member', owner: false },
      { name: 'Bea', role: 'admin', owner: false },
      { name: 'Ada', role: 'member', owner: false },
      { name: 'Yusuf', role: 'admin', owner: true },
      { name: 'Ari', role: 'admin', owner: false },
    ] as const
    expect(sortPeople(people).map((p) => p.name)).toEqual(['Ada', 'Ari', 'Bea', 'Yusuf', 'Zoë', null])
  })
})
