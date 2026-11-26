// What keeps a draft from being applied, as structured facts (Foundation integrity review, Part C).
// A problem's meaning is its kind, its category and where it is, taken from the domain's own issue
// kinds; its words are only how it's shown, made from those facts. Nothing anywhere decides what a
// problem means by reading its words, so rewording never changes how a problem is classified.
import type { PropertyPath } from '#shared/features/definitions'
import type { AnyMappingIssue } from '#shared/features/mappings'
import type { ReviewIssue } from './reading'

/**
 * unfinished    something required isn't made yet: the next thing to do, not an error
 * incompatible  the Transform version the step invokes can't take it, though another version might
 * invalid       wrong whatever version runs it: the configuration itself needs fixing
 */
export type ProblemCategory = 'unfinished' | 'incompatible' | 'invalid'

/**
 * unsupported_contract  the step's Transform version can't take these contracts at all
 * structure             the Transform's own output isn't a valid Definition yet
 * not_made              a required property nothing makes, at any depth
 * mapping               a problem the domain's check found in a property's source (`issue`)
 * no_place              a mapping with no output property to fill (`reason`)
 * refused               the step's Transform version refuses the complete Mapping (`issue`)
 */
export type ProblemKind = 'unsupported_contract' | 'structure' | 'not_made' | 'mapping' | 'no_place' | 'refused'

export interface Problem {
  readonly kind: ProblemKind
  readonly category: ProblemCategory
  /** The output place it's about (a top-level property, or one inside a built object); null: the whole draft. */
  readonly at: PropertyPath | null
  /** The draft property it belongs to; null when none does. */
  readonly index: number | null
  /** The domain's issue, as found (mapping, refused). */
  readonly issue?: ReviewIssue | AnyMappingIssue
  /** Why a mapping has no place (no_place). */
  readonly reason?: 'unnamed' | 'unknown' | 'duplicate'
  /** Presentation only: the problem in a sentence, with where it is. */
  readonly words: string
  /** Presentation only: the same, for when where it is is already shown. */
  readonly short: string
}

/**
 * Issue kinds that depend on what the Transform version can do rather than on the Mapping being
 * wrong: reading nested values (flat versions can't) and reading optional values (v1 can't).
 */
const VERSION_LIMITS: ReadonlySet<string> = new Set(['unsupported_source', 'absence_unsupported'])

/** A domain issue's category, from its kind alone. */
export function categoryOf(issue: { readonly problem: string }): ProblemCategory {
  if (issue.problem === 'missing_output_property') return 'unfinished'
  return VERSION_LIMITS.has(issue.problem) ? 'incompatible' : 'invalid'
}
