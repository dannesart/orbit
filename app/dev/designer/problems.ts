// What keeps a draft from being applied, as structured facts (Foundation integrity review, Part C).
// A problem's meaning is its kind, its category and where it is, taken from the domain's own issue
// kinds; its words are only how it's shown, made from those facts. Nothing anywhere decides what a
// problem means by reading its words, so rewording never changes how a problem is classified.
import type { PropertyPath } from '#shared/features/definitions'
import { type AnyMappingIssue, type MappingProperty, sourceAt, wellFormedSource } from '#shared/features/mappings'
import type { ReviewIssue } from './reading'

/**
 * unresolved    a contract (the input, the output, or a Definition either depends on) can't be
 *               established here: missing, not this workspace's to use, cyclic or too deep. Nothing
 *               about the Mapping can be judged against it (the boundary: invalid_contract)
 * unfinished    something required isn't made yet: the next thing to do, not an error
 * incompatible  the Transform version the step invokes can't take it, though another version might
 * invalid       wrong whatever version runs it: the configuration itself needs fixing
 */
export type ProblemCategory = 'unresolved' | 'unfinished' | 'incompatible' | 'invalid'

/**
 * contract              a contract doesn't resolve here (`definition` issues)
 * unsupported_contract  the step's Transform version can't take these contracts at all
 * structure             the Transform's own output isn't a valid Definition yet
 * not_made              a required property nothing makes, at any depth
 * mapping               a problem the domain's check found in a property's source (`issue`)
 * no_place              a mapping with no output property to fill (`reason`)
 * refused               the step's Transform version refuses the complete Mapping (`issue`)
 */
export type ProblemKind = 'contract' | 'unsupported_contract' | 'structure' | 'not_made' | 'mapping' | 'no_place' | 'refused'

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
 * A domain issue's category, from its kind and, for a source a version can't read, from the source
 * itself; never from words. Reading an optional value is a capability v1 lacks (incompatible). A
 * source a version refuses as unsupported_source is incompatible only when it's a well-formed source
 * of a kind another version reads (a nested read, a construction or a copy, for a flat version);
 * anything malformed or unknown is invalid for every version. Under a nested version every capability
 * is known, so unsupported_source there is always malformed. `properties`: the Mapping the issue's
 * flat Path points into; without it nothing is assumed to be a capability.
 */
export function categoryOf(issue: ReviewIssue | AnyMappingIssue, properties: readonly MappingProperty[] = []): ProblemCategory {
  switch (issue.problem) {
    case 'missing_output_property': return 'unfinished'
    case 'absence_unsupported': return 'incompatible'
    case 'unsupported_source':
      if ('at' in issue) return 'invalid'
      return wellFormedSource(sourceAt(properties, issue.path)) ? 'incompatible' : 'invalid'
    default: return 'invalid'
  }
}
