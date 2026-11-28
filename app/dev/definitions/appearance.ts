// A Definition's appearance: an icon and a colour, chosen by people to tell their Definitions apart.
// Presentation metadata, like a made Definition's name and description: kept beside its versions,
// never in one. Changing it makes no version, changes no identity, and plays no part in what a
// Definition accepts or what is compatible with it.
//
// The icons are Orbit's own outlines (16×16 grid, round caps, drawn by DefinitionGlyph.vue), in the
// same hand as the navigation's: no icon library.

export const COLORS = ['pink', 'purple', 'blue', 'cyan', 'green', 'yellow', 'orange', 'slate'] as const
export type DefinitionColor = (typeof COLORS)[number]

/** Each colour: its name for people, the tinted tile behind an icon, and its swatch. */
export const COLOR_STYLES: Readonly<Record<DefinitionColor, { label: string; tile: string; swatch: string }>> = {
  pink: { label: 'Pink', tile: 'bg-accent-50 text-accent-600', swatch: 'bg-accent-500' },
  purple: { label: 'Purple', tile: 'bg-purple-50 text-purple-600', swatch: 'bg-purple-500' },
  blue: { label: 'Blue', tile: 'bg-blue-50 text-blue-600', swatch: 'bg-blue-500' },
  cyan: { label: 'Cyan', tile: 'bg-cyan-50 text-cyan-700', swatch: 'bg-cyan-500' },
  green: { label: 'Green', tile: 'bg-emerald-50 text-emerald-600', swatch: 'bg-emerald-500' },
  yellow: { label: 'Yellow', tile: 'bg-amber-50 text-amber-600', swatch: 'bg-amber-400' },
  orange: { label: 'Orange', tile: 'bg-orange-50 text-orange-600', swatch: 'bg-orange-500' },
  slate: { label: 'Slate', tile: 'bg-slate-100 text-slate-600', swatch: 'bg-slate-500' },
}

const circle = (cx: number, cy: number, r: number) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`
const rect = (x: number, y: number, w: number, h: number, r: number) =>
  `M${x + r} ${y}h${w - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}v${h - 2 * r}a${r} ${r} 0 0 1 ${-r} ${r}h${-(w - 2 * r)}a${r} ${r} 0 0 1 ${-r} ${-r}v${-(h - 2 * r)}a${r} ${r} 0 0 1 ${r} ${-r}Z`

/** The curated icons, in the order they're offered: each a name for people and its outline. */
export const ICONS = {
  definition: { label: 'Definition', paths: [rect(2.75, 2.75, 10.5, 10.5, 2), 'M5.5 6h5M5.5 8.25h5M5.5 10.5h2.75'] },
  person: { label: 'Person', paths: [circle(8, 5.5, 2.5), 'M3.5 13.5c.6-2.6 2.3-4 4.5-4s3.9 1.4 4.5 4'] },
  group: { label: 'Group', paths: [circle(6, 5.5, 2.25), 'M2 13c.4-2.3 2-3.5 4-3.5s3.6 1.2 4 3.5', 'M10.5 3.6a2.25 2.25 0 0 1 0 3.8M12 9.8c1 .5 1.8 1.6 2 3.2'] },
  building: { label: 'Organisation', paths: ['M3.5 13.5V3.25c0-.28.22-.5.5-.5h5c.28 0 .5.22.5.5V13.5', 'M9.5 6.5H12c.28 0 .5.22.5.5v6.5', 'M2.5 13.5h11M5.5 5.5H7M5.5 8H7M5.5 10.5H7'] },
  receipt: { label: 'Receipt', paths: ['M4 2.75h8v10.5l-1.5-1-1.25 1-1.25-1-1.25 1-1.25-1-1.5 1Z', 'M6 6h4M6 8.5h4'] },
  document: { label: 'Document', paths: ['M4.25 2.75h4.5l3 3v7.25a.25.25 0 0 1-.25.25h-7.25a.25.25 0 0 1-.25-.25v-10a.25.25 0 0 1 .25-.25Z', 'M8.75 2.75v3h3'] },
  folder: { label: 'Folder', paths: ['M2.75 4.25c0-.28.22-.5.5-.5h3l1.25 1.5h5.25c.28 0 .5.22.5.5v6.5c0 .28-.22.5-.5.5h-9.5a.5.5 0 0 1-.5-.5Z'] },
  box: { label: 'Package', paths: ['M2.75 5.25 8 2.75l5.25 2.5v5.5L8 13.25l-5.25-2.5Z', 'M2.75 5.25 8 7.75l5.25-2.5M8 7.75v5.5'] },
  cart: { label: 'Order', paths: ['M2 2.75h1.75l1.5 7.5H12l1.25-5.25H4.5', circle(6, 12.75, 0.75), circle(11, 12.75, 0.75)] },
  tag: { label: 'Product', paths: ['M2.75 3.25v4.1c0 .26.1.52.3.7l5.4 5.4c.4.4 1 .4 1.4 0l3.65-3.65c.4-.4.4-1 0-1.4l-5.4-5.4a1 1 0 0 0-.7-.3H3.25a.5.5 0 0 0-.5.5Z', circle(5.5, 5.5, 0.75)] },
  card: { label: 'Payment', paths: [rect(2.25, 3.75, 11.5, 8.5, 1.5), 'M2.25 6.75h11.5M4.75 9.75h2'] },
  money: { label: 'Money', paths: [rect(1.75, 4.25, 12.5, 7.5, 1.25), circle(8, 8, 1.75), 'M4 6.5v.01M12 9.5v.01'] },
  calendar: { label: 'Date', paths: [rect(2.75, 3.5, 10.5, 9.75, 1.5), 'M2.75 6.75h10.5M5.5 2.25v2.5M10.5 2.25v2.5'] },
  clock: { label: 'Time', paths: [circle(8, 8, 5.75), 'M8 5v3l2 1.5'] },
  mail: { label: 'Message', paths: [rect(2.25, 3.75, 11.5, 8.5, 1.5), 'm2.75 4.5 5.25 4 5.25-4'] },
  phone: { label: 'Phone', paths: [rect(4.5, 1.75, 7, 12.5, 1.5), 'M7.25 12h1.5'] },
  pin: { label: 'Place', paths: ['M8 14s4.25-3.9 4.25-7.25a4.25 4.25 0 0 0-8.5 0C3.75 10.1 8 14 8 14Z', circle(8, 6.75, 1.5)] },
  globe: { label: 'World', paths: [circle(8, 8, 5.75), 'M2.25 8h11.5M8 2.25c1.6 1.6 2.4 3.5 2.4 5.75S9.6 12.15 8 13.75C6.4 12.15 5.6 10.25 5.6 8S6.4 3.85 8 2.25Z'] },
  truck: { label: 'Delivery', paths: ['M1.75 4.25h7.5v6.5h-7.5Z', 'M9.25 6.5h2.6l2.4 2.4v1.85h-5', circle(4.5, 11.75, 1.25), circle(11.5, 11.75, 1.25)] },
  star: { label: 'Favourite', paths: ['m8 2.5 1.7 3.45 3.8.55-2.75 2.68.65 3.8L8 11.2l-3.4 1.78.65-3.8L2.5 6.5l3.8-.55Z'] },
  heart: { label: 'Care', paths: ['M8 13.25S2.25 10 2.25 6.1A2.85 2.85 0 0 1 8 4.9a2.85 2.85 0 0 1 5.75 1.2C13.75 10 8 13.25 8 13.25Z'] },
  flag: { label: 'Milestone', paths: ['M3.5 14V2.75M3.5 3.25h8.25l-1.75 3 1.75 3H3.5'] },
  key: { label: 'Access', paths: [circle(5.25, 10.75, 2.5), 'm7 9 6-6M11 5l1.5 1.5M9.5 6.5 11 8'] },
  chart: { label: 'Report', paths: ['M2.75 2.75v10.5h10.5', 'M5.5 10.5v-3M8.25 10.5V5.5M11 10.5V8'] },
} as const satisfies Record<string, { label: string; paths: readonly string[] }>

export type DefinitionIcon = keyof typeof ICONS
export const ICON_NAMES = Object.keys(ICONS) as DefinitionIcon[]

export interface Appearance {
  readonly icon: DefinitionIcon
  readonly color: DefinitionColor
}

/** Every Definition starts as the Definition icon, in pink. */
export const DEFAULT_APPEARANCE: Appearance = Object.freeze({ icon: 'definition', color: 'pink' })

/** Only the curated icons and colours; anything else is refused rather than shown. */
export function checkAppearance(appearance: Appearance): Appearance {
  if (!(appearance.icon in ICONS)) throw new Error(`No such icon: ${appearance.icon}`)
  if (!COLORS.includes(appearance.color)) throw new Error(`No such colour: ${appearance.color}`)
  return Object.freeze({ icon: appearance.icon, color: appearance.color })
}

export const sameAppearance = (a: Appearance, b: Appearance) => a.icon === b.icon && a.color === b.color
