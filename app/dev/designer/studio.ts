// Mapping Studio (Phase 4.5A): the Mapping's two contracts as trees, side by side. Only a way of
// looking at what already exists: the input's availability is the domain's (readablePaths and
// objectPaths, with every optional property along a path), what a Transform version can read is the
// reading's (readables), and the output's state comes from the review, which is the domain's check.
// Nothing here decides compatibility, completeness or availability on its own.
import { type DefinitionRef, type DefinitionVersion, type Field, MAX_OBJECT_LEVELS, type PropertyPath, type PropertyType, type Scalar, kindOf } from '#shared/features/definitions'
import { type Argument, type Expression, type MappingProperty, objectPaths, readablePaths } from '#shared/features/mappings'
import { type DraftProperty, type Piece, fromPiece } from './parts'
import { type DraftReview, type Example, type OutputPreview, friendlyIssue } from './preview'
import type { ApplyAssessment } from './config'
import type { Problem, ProblemCategory } from './problems'
import { type Reading, absenceWords, readables } from './reading'
import { describeSource } from './summary'

const key = (path: PropertyPath) => JSON.stringify(path)
const same = (a: readonly unknown[], b: readonly unknown[]) => a.length === b.length && a.every((x, i) => x === b[i])

// --- The input ---

export interface InputNode {
  readonly name: string
  readonly path: PropertyPath
  readonly type: PropertyType
  /** A reference's exact version. */
  readonly definition?: DefinitionRef
  readonly optional: boolean
  /** Why it may be absent here, from every optional property along its path; '' when it's always there. */
  readonly absence: string
  /** A value this Transform version can read as a source (top-level only for flat versions). */
  readonly readable: boolean
  /** A reference that doesn't resolve here: said so, never left out. */
  readonly unresolved: boolean
  readonly children: readonly InputNode[]
}

/** The input contract as a tree, references resolved exactly, as deep as Orbit allows. */
export function inputTree(input: DefinitionVersion, reading: Reading): InputNode[] {
  const values = new Map(readablePaths(input, reading.resolve).map((r) => [key(r.path), r.optional]))
  const objects = new Map(objectPaths(input, reading.resolve).map((o) => [key(o.path), o.optional]))
  const canRead = new Set(readables(reading, input).map((r) => key(r.path)))
  const walk = (fields: readonly Field[], at: PropertyPath, level: number): InputNode[] => fields.map((f) => {
    const path = [...at, f.name]
    const resolved = f.type === 'reference' ? reading.resolve(f.definition) : null
    const inside = f.type === 'object' ? f.fields : resolved?.fields ?? []
    return {
      name: f.name,
      path,
      type: f.type,
      ...(f.type === 'reference' ? { definition: f.definition } : {}),
      optional: f.optional === true,
      absence: absenceWords((f.type === 'object' || f.type === 'reference' ? objects : values).get(key(path)) ?? []),
      readable: canRead.has(key(path)),
      unresolved: f.type === 'reference' && !resolved,
      children: level < MAX_OBJECT_LEVELS ? walk(inside, path, level + 1) : [],
    }
  })
  return walk(input.fields, [], 1)
}

// --- What a source reads, so the input it comes from can be pointed out ---

/** Every input path a source reads: values, copied values and presence conditions. Presentation only. */
export function readsOf(source: Expression | Argument): PropertyPath[] {
  switch (source.kind) {
    case 'property': return [[source.name]]
    case 'path': return [source.path]
    case 'copy': return Array.isArray(source.from) ? [source.from] : []
    case 'construct': return [...(source.presence.when === 'present' && source.presence.source.length ? [source.presence.source] : []), ...source.properties.flatMap((p) => readsOf(p.source))]
    case 'list': return source.items.flatMap(readsOf)
    case 'call': return source.args.flatMap(readsOf)
    default: return []
  }
}

// --- What an output place depends on in the input ---

/**
 * value     the value is made from it (a field, a nested value, or one of an expression's arguments)
 * copy      the whole value is copied from it
 * presence  a built object is made only when it's present: a condition, not a value
 */
export type LinkKind = 'value' | 'copy' | 'presence'
export interface Link { readonly from: PropertyPath; readonly kind: LinkKind }

/** One place's own dependencies, exactly as the draft has them: nothing for what isn't mapped. */
function linksOf(piece: Piece | null): Link[] {
  if (!piece) return []
  if (piece.kind === 'construct') return piece.presence.when === 'present' && piece.presence.source.length ? [{ from: piece.presence.source, kind: 'presence' }] : []
  if (piece.kind === 'copy') return piece.from ? [{ from: piece.from, kind: 'copy' }] : []
  const seen = new Set<string>()
  return readsOf(fromPiece(piece)).filter((p) => !seen.has(key(p)) && seen.add(key(p))).map((from) => ({ from, kind: 'value' }))
}

/** A line between an input place and an output place. `from` [] is the whole input. */
export interface Connection extends Link { readonly to: PropertyPath; readonly key: string }

/**
 * Every dependency the draft has, as lines to draw: only from input places that exist (a source
 * that reads something the input doesn't have is a problem, shown on its row, never a line).
 */
export function connections(outputs: readonly OutputNode[], inputs: readonly InputNode[]): Connection[] {
  const exists = new Set<string>([key([])])
  const walkIn = (nodes: readonly InputNode[]) => nodes.forEach((n) => { exists.add(key(n.path)); walkIn(n.children) })
  walkIn(inputs)
  const out: Connection[] = []
  const walkOut = (nodes: readonly OutputNode[]) => nodes.forEach((n) => {
    for (const l of n.links) if (exists.has(key(l.from))) out.push({ ...l, to: n.path, key: `${key(l.from)}>${key(n.path)}:${l.kind}` })
    walkOut(n.children)
  })
  walkOut(outputs)
  return out
}

/** Whether `path` is `within` or inside it. */
export const isWithin = (path: PropertyPath, within: PropertyPath) => within.length <= path.length && within.every((p, i) => p === path[i])

// --- The output ---

/**
 * mapped      something makes it, and the check finds nothing wrong here
 * not_mapped  required, and nothing makes it yet: unfinished work
 * left_out    optional, and deliberately not made: the output won't have it
 * incomplete  a built object whose only problem is that something required inside isn't made yet:
 *             unfinished work, not an error
 * problem     something here keeps the Mapping from being sound
 * unsupported the step's Transform version can't make it at all
 */
export type OutputStatus = 'mapped' | 'not_mapped' | 'left_out' | 'incomplete' | 'problem' | 'unsupported'

/** How a property is made, in words. */
export type How =
  | { readonly kind: 'value'; readonly words: string }
  | { readonly kind: 'build'; readonly words: string }
  | { readonly kind: 'copy'; readonly words: string }
  | { readonly kind: 'none' }

export interface OutputNode {
  readonly name: string
  readonly path: PropertyPath
  readonly type: PropertyType
  readonly definition?: DefinitionRef
  readonly optional: boolean
  readonly status: OutputStatus
  readonly how: How
  /** The first problem exactly here, in words; '' when none. */
  readonly problem: string
  /** What its source reads, by input path. */
  readonly reads: readonly PropertyPath[]
  /** What this place itself depends on in the input (a built object's properties have their own). */
  readonly links: readonly Link[]
  /** A built object's properties, as its contract has them. Copied values and values have none. */
  readonly children: readonly OutputNode[]
}

const presenceWords = (piece: Extract<Piece, { kind: 'construct' }>) => {
  const p = piece.presence
  if (p.when === 'always') return 'Always built'
  return p.source.length ? `Built when ${p.source.join(' › ')} is present` : 'Built when… (no source object chosen yet)'
}
function howOf(piece: Piece | null): How {
  if (!piece) return { kind: 'none' }
  if (piece.kind === 'construct') return { kind: 'build', words: presenceWords(piece) }
  if (piece.kind === 'copy') return { kind: 'copy', words: piece.from ? `Copied whole from ${piece.from.length ? piece.from.join(' › ') : 'the whole input'}` : 'Copied whole… (what to copy isn’t chosen yet)' }
  return { kind: 'value', words: describeSource(fromPiece(piece)) }
}

const TOP: Record<DraftReview['fields'][number]['state'], OutputStatus> = { set: 'mapped', not_set: 'not_mapped', left_out: 'left_out', problem: 'problem', unsupported: 'unsupported' }

/**
 * The output contract as a tree, with what the draft makes at each place. Top-level states are the
 * review's; inside built objects, each place's problems are the domain's located issues, exactly
 * where they are.
 */
export function outputTree(target: DefinitionVersion, properties: readonly DraftProperty[], review: DraftReview, resolve: Reading['resolve']): OutputNode[] {
  return review.fields.map((f) => {
    const field = target.fields.find((x) => x.name === f.name)!
    const piece = f.index >= 0 && f.state !== 'unsupported' ? properties[f.index]!.piece : null
    const issues = f.index >= 0 ? review.issues[f.index] ?? [] : []
    const located = (path: PropertyPath) => issues.filter((i) => ('at' in i ? same(i.at.output, path) : path.length === 1)).map(friendlyIssue)
    const node = (field: Field, path: PropertyPath, piece: Piece | null, level: number, top: OutputStatus | null): OutputNode => {
      const here = located(path)
      const status: OutputStatus = top ?? (here.length && piece ? 'problem' : !piece ? (field.optional === true ? 'left_out' : 'not_mapped') : 'mapped')
      const fields = field.type === 'object' ? field.fields : field.type === 'reference' ? resolve(field.definition)?.fields ?? [] : []
      const built = piece?.kind === 'construct' ? piece : null
      return {
        name: field.name,
        path,
        type: field.type,
        ...(field.type === 'reference' ? { definition: field.definition } : {}),
        optional: field.optional === true,
        status,
        how: howOf(piece),
        // Only a real problem is said here: what isn't made yet already says so by its status.
        problem: (top === 'problem' && path.length === 1 ? f.problems[0] : undefined) ?? (status === 'problem' ? here[0] : undefined) ?? '',
        reads: piece ? readsOf(fromPiece(piece)) : [],
        links: linksOf(piece),
        children: built && level < MAX_OBJECT_LEVELS
          ? fields.map((c) => node(c, [...path, c.name], built.properties.find((p) => p.name === c.name)?.piece ?? null, level + 1, null))
          : [],
      }
    }
    // Something required inside isn't made yet, and nothing else is wrong: unfinished, not wrong.
    const unfinished = f.state === 'problem' && !f.problems.length && issues.length > 0 && issues.every((i) => i.problem === 'missing_output_property')
    return node(field, [f.name], piece, 1, unfinished ? 'incomplete' : TOP[f.state])
  })
}

// --- Where the draft stands, in one word ---

/**
 * unresolved    a contract it depends on can't be established here
 * invalid       something in the configuration is wrong, whatever version runs it
 * incompatible  the step's Transform version can't take it (another version might)
 * incomplete    sound so far, but something required isn't made yet
 * unchanged     exactly what's applied
 * compatible    changed, complete and sound: Apply is available
 */
export type StudioState = 'unresolved' | 'invalid' | 'incompatible' | 'incomplete' | 'unchanged' | 'compatible'

/** One thing to do, where it is: an output place (opened in the inspector), or General. */
export interface StudioItem { readonly text: string; readonly at: PropertyPath | null; readonly where: 'mapping' | 'general'; readonly category: ProblemCategory }

export interface StudioStatus {
  readonly state: StudioState
  /** What keeps it from being sound, each where it is. */
  readonly problems: readonly StudioItem[]
  /** What still needs a value, by place. */
  readonly todo: readonly StudioItem[]
}

/** Where a problem is dealt with: the contracts and the output's structure in General, the rest in Mapping. */
const GENERAL: ReadonlySet<Problem['kind']> = new Set(['contract', 'unsupported_contract', 'structure'])

/**
 * Where the draft stands, as the authoritative assessment (config.ts, assessApply) says: its state,
 * and its structured problems as things to do. Never a rule of its own; words are only shown.
 */
export function studioStatus(assessment: Pick<ApplyAssessment, 'state' | 'problems'>): StudioStatus {
  const { problems } = assessment
  const item = (p: Problem): StudioItem => ({ text: p.short, at: p.kind === 'no_place' ? null : p.at, where: GENERAL.has(p.kind) ? 'general' : 'mapping', category: p.category })
  const state: StudioState = assessment.state === 'applicable' ? 'compatible' : assessment.state
  return { state, problems: problems.filter((p) => p.category !== 'unfinished').map(item), todo: problems.filter((p) => p.category === 'unfinished').map(item) }
}

// --- The preview, as one object ---

/** The object the preview would make: every value that could be made, absent ones left out. */
export function madeFrom(properties: readonly { readonly name: string }[], preview: OutputPreview): Record<string, unknown> {
  return Object.fromEntries(properties.flatMap((p, i): [string, unknown][] => {
    const v = preview.values[i]
    return v && 'value' in v ? [[p.name, v.value as Scalar]] : v && 'object' in v ? [[p.name, v.object]] : []
  }))
}

/** Whether data is a plain object (what a tree can show). */
export const isRecord = (v: unknown): v is Record<string, unknown> => kindOf(v) === 'object'

/** The applied Mapping, previewed with the same example (never executed), for the Studio's Preview. */
export interface AppliedPreview {
  readonly version: number
  readonly label: string
  readonly properties: readonly MappingProperty[]
  readonly input: DefinitionVersion
  readonly target: DefinitionVersion
  readonly example: Example
  readonly preview: OutputPreview
}
