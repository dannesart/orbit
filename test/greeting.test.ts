import { describe, expect, it } from 'vitest'
import { greeting } from '../app/utils/greeting'

describe('greeting', () => {
  it('follows the local time of day', () => {
    expect(greeting('Ada', 5)).toBe('Good morning, Ada.')
    expect(greeting('Ada', 11)).toBe('Good morning, Ada.')
    expect(greeting('Ada', 12)).toBe('Good afternoon, Ada.')
    expect(greeting('Ada', 17)).toBe('Good afternoon, Ada.')
    expect(greeting('Ada', 18)).toBe('Good evening, Ada.')
    expect(greeting('Ada', 22)).toBe('Good evening, Ada.')
  })

  it('is usually a plain hello late at night, and only occasionally a wink', () => {
    for (const hour of [23, 0, 2, 4]) {
      expect(greeting('Ada', hour, 0.9)).toBe('Hello, Ada.')
      expect(greeting('Ada', hour, 0.1)).toBe('Still up, Ada?')
    }
    const winks = Array.from({ length: 1000 }, (_, i) => greeting('Ada', 1, i / 1000)).filter((g) => g.startsWith('Still'))
    expect(winks).toHaveLength(250)
  })

  it('never winks during the day', () => {
    for (let hour = 5; hour < 23; hour++) expect(greeting('Ada', hour, 0)).not.toMatch(/Still up/)
  })
})
