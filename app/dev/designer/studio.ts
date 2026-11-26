// Mapping Studio (Phase 4.5A): the Mapping's two contracts as trees, side by side. Only a way of
// looking at what already exists: the input's availability is the domain's (readablePaths and
// objectPaths, with every optional property along a path), what a Transform version can read is the
// reading's (readables), and the output's state comes from the review, which is the domain's check.
// Nothing here decides compatibility, completeness or availability on its own.
import { type DefinitionRef, type DefinitionVersion, type Field, MAX_OBJECT_LEVELS, type PropertyPath, type PropertyType, type Scalar, kindOf } from '#shared/features/definitions'
import { type Argument, type Expression, type MappingProperty, objectPaths, readablePaths } from '#shared/features/mappings'
import { type DraftProperty, type Piece, fromPiece } from './parts'
import { type DraftReview, type Example, type OutputPreview, friendlyIssue } from './preview'
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
        problem: (top === 'problem' && path.length === 1 ? f.problems[0] : undefined) ?? here[0] ?? '',
        reads: piece ? readsOf(fromPiece(piece)) : [],
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
