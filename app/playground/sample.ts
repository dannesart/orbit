// NAVIGATION PLAYGROUND (exploration only, never merged). Everything the playground shows
// lives here: sample workspaces held in the browser, no API calls, no database.
// Remove the playground: delete app/playground, app/components/playground,
// app/pages/playground and the one early return in app/middleware/auth.global.ts.

export type ConceptKey = 'a' | 'b' | 'c' | 'd'
export type Place = 'home' | 'people' | 'settings'
export type Standing = 'Owner' | 'Steward' | 'Member'

export interface SamplePerson { name: string | null; you: boolean; standing: Standing }
export interface SampleWorkspace { id: string; name: string; description: string | null; people: SamplePerson[] }

export const places: { key: Place; label: string }[] = [
  { key: 'home', label: 'Home' },
  { key: 'people', label: 'People' },
  { key: 'settings', label: 'Settings' },
]

export const concepts: Record<ConceptKey, {
  letter: string
  name: string
  idea: string
  gains: string[]
  costs: string[]
  arrival: string
}> = {
  a: {
    letter: 'A',
    name: 'The Quiet Line',
    idea: 'Three words in a hairline row under the header. The active place is marked by a pink line where it meets the border.',
    gains: ['Instantly familiar: everyone knows where to look', 'Always visible, so People and Settings are one click from anywhere', 'Scales to a few more places without redesign'],
    costs: ['Adds a second band above Arrival, so Home reads as "one tab of three"', 'Mildly administrative: the shape of a product with sections'],
    arrival: 'Arrival keeps its content, but sits under a row of choices.',
  },
  b: {
    letter: 'B',
    name: 'The Floating Orbit',
    idea: 'A small glass pill that floats at the bottom of the screen, its pink "moon" gliding to the place you choose. The top of every page is left to identity alone.',
    gains: ['The header stays exactly as it is today', 'Thumb-reachable on phones, where it feels native', 'Playful in an Orbit way: the moving moon echoes the halo'],
    costs: ['Always hovering over content: a permanent object on a page that wants stillness', 'Bottom navigation is unusual on desktop', 'Needs extra space at the bottom of every page'],
    arrival: 'Arrival’s top is untouched, but something now floats in front of it.',
  },
  c: {
    letter: 'C',
    name: 'The Workspace Rail',
    idea: 'A slim vertical rail on the left with icons and labels. On phones it folds into a drawer opened from the header.',
    gains: ['Clear sense of a persistent place with rooms', 'Most room to grow if Orbit gains more destinations'],
    costs: ['Heaviest structure for three places', 'Pushes Arrival off-centre and frames it as an app screen', 'On phones, navigation hides behind a menu button'],
    arrival: 'Arrival becomes the first room of an application.',
  },
  d: {
    letter: 'D',
    name: 'The Contextual Menu',
    idea: 'No navigation bar at all. Places live in the workspace menu you already know, and the header names where you are when you leave Home.',
    gains: ['Arrival is exactly today’s Arrival: nothing added', 'Navigation belongs to the workspace, which is what it is', 'One pattern on desktop and phone'],
    costs: ['Least discoverable: People and Settings are one click deeper', 'Relies on content links like “See everyone” for the common path'],
    arrival: 'Arrival is untouched; navigation appears only when asked for.',
  },
}

const northwind: SampleWorkspace = {
  id: 'northwind',
  name: 'Northwind',
  description: 'Planning the spring launch',
  people: [
    { name: 'Alex', you: true, standing: 'Owner' },
    { name: 'Grace', you: false, standing: 'Steward' },
    { name: 'Lin', you: false, standing: 'Member' },
    { name: 'Noor', you: false, standing: 'Member' },
  ],
}

const garden: SampleWorkspace = {
  id: 'garden',
  name: 'Garden Club',
  description: null,
  people: [{ name: 'Alex', you: true, standing: 'Owner' }],
}

export const you = { name: 'Alex', email: 'alex@example.com' }

/** The sample workspaces, held in the browser only; edits in Settings change these and nothing else. */
export function useSampleWorkspaces() {
  const all = useState<SampleWorkspace[]>('pg-workspaces', () => structuredClone([northwind, garden]))
  const currentId = useState('pg-current', () => 'northwind')
  const current = computed(() => all.value.find((w) => w.id === currentId.value)!)
  return { all, currentId, current }
}

export function placeHref(concept: ConceptKey, place: Place) {
  return place === 'home' ? `/playground/navigation/${concept}` : `/playground/navigation/${concept}/${place}`
}
