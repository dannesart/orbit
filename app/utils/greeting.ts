/**
 * A natural greeting for the local hour. Late at night it is usually a plain hello, and only
 * occasionally (`chance` below 0.25) a wink, so it never becomes a catchphrase.
 */
export function greeting(name: string, hour: number, chance = Math.random()): string {
  if (hour >= 5 && hour < 12) return `Good morning, ${name}.`
  if (hour >= 12 && hour < 18) return `Good afternoon, ${name}.`
  if (hour >= 18 && hour < 23) return `Good evening, ${name}.`
  return chance < 0.25 ? `Still up, ${name}?` : `Hello, ${name}.`
}
