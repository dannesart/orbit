// NAVIGATION PLAYGROUND (exploration only, never merged). Everything the playground shows
// lives here: sample workspaces held in the browser, no API calls, no database.
// Remove the playground: delete app/playground, app/components/playground,
// app/pages/playground and the one early return in app/middleware/auth.global.ts.

export type ConceptKey = 'a' | 'b' | 'c' | 'd' | 'e1' | 'e2' | 'e3'

/**
 * Orbit's shared frame: the bounded content area of the workspace header (WorkspaceHeader.vue
 * uses exactly these classes). The playground header and E3's rail both take it from here, so
 * the rail lines up with the logo by construction, at every width, instead of by offsets.
 */
export const frame = { gutter: 'mx-auto px-4 sm:px-6 lg:px-8', width: 'max-w-7xl' }
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
  e1: {
    letter: 'E1',
    name: 'Edge Floating Rail',
    idea: 'C’s icons and labels on B’s glass: a small floating rail near the left edge of the window, its pink moon gliding between places. On phones and narrow windows it becomes a bottom pill.',
    gains: ['All three places one click away, always', 'Leaves Arrival exactly centred, with the header for identity only', 'Reads as a small Orbit object, not a sidebar'],
    costs: ['On wide screens it sits far from the content, at the edge of attention', 'A permanent object in the margin, even on Arrival'],
    arrival: 'Arrival stays centred; a small object rests in the margin.',
  },
  e2: {
    letter: 'E2',
    name: 'Content Companion',
    idea: 'The same floating rail, placed just outside the content column and level with the top of the page, so it belongs to what you are reading rather than to the window. On phones and narrow windows it becomes a bottom pill.',
    gains: ['All three places one click away, close to where the eye already is', 'Arrival stays centred; the rail feels like part of the page', 'Doesn’t drift away from content on very wide screens'],
    costs: ['Needs a wide window: below 1024 px it switches to the bottom pill', 'Closer to the content, so slightly more present on Arrival'],
    arrival: 'Arrival stays centred, with a quiet companion beside it.',
  },
  e3: {
    letter: 'E3',
    name: 'The Workspace Frame',
    idea: 'The same floating rail, aligned with the left edge of Orbit’s header content, directly beneath the logo. It belongs to Orbit’s frame, so it stays put whatever the page’s layout. If a page’s content would ever reach it, it steps aside into the bottom pill.',
    gains: ['Same place on every page, whatever its width', 'Logo, rail and header read as one frame', 'Never drifts to the window edge on wide screens'],
    costs: ['Further from narrow content than E2 on mid-size screens', 'A permanent object beside Arrival, like E1 and E2'],
    arrival: 'Arrival stays centred; the rail belongs to the frame around it.',
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
