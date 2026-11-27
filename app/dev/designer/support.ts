// Whether the Transform version a step invokes can take the contracts at all, asked with the
// boundary's own check (contractCompatibility, per side) and never by running it, and how it reads
// sources (flat, or nested too). Kept apart from the preview, which never touches a Feature: it
// receives the answer as plain data (ContractSupport, Reading).
import type { DefinitionVersion, Resolve } from '#shared/features/definitions'
import { type MappingFeature, contractCompatibility, mappingCompatibility } from '#shared/features/features'
import type { MappingProperty } from '#shared/features/mappings'
import { describeMappingIssue } from '../features/experiment'
import type { ContractSupport } from './preview'
import { type Problem, categoryOf } from './problems'
import { readingOf } from './reading'

/** What this Transform version refuses in what it reads and makes, and how it reads sources. */
export const transformSupport = (input: DefinitionVersion, output: DefinitionVersion, feature: MappingFeature, resolve: Resolve = () => null): ContractSupport => ({
  version: feature.version,
  reads: contractCompatibility(feature, input, 'input'),
  makes: contractCompatibility(feature, output, 'output'),
  reading: readingOf(feature, resolve),
})

/**
 * Whether this Transform version would accept the complete Mapping before running it: the
 * boundary's own check (mappingCompatibility), asked of the whole draft, in words. Apply asks it
 * too, so nothing is applied that the step's version would refuse; never by running anything.
 */
export const boundaryProblems = (feature: MappingFeature, properties: readonly MappingProperty[], input: DefinitionVersion, output: DefinitionVersion, resolve: Resolve = () => null): string[] =>
  boundaryFindings(feature, properties, input, output, resolve).map((p) => p.words)

/** The same refusal as structured problems: each issue's kind decides its category, its place where it is. */
export function boundaryFindings(feature: MappingFeature, properties: readonly MappingProperty[], input: DefinitionVersion, output: DefinitionVersion, resolve: Resolve = () => null): Problem[] {
  return mappingCompatibility(feature, { properties }, input, output, resolve).map((issue): Problem => {
    // Nested versions locate an issue in the output; flat ones by the property's index in the Mapping.
    const first = 'at' in issue ? null : issue.path[0]
    const index = typeof first === 'number' && first < properties.length ? first : null
    const at = 'at' in issue ? (issue.at.output.length ? issue.at.output : null) : index !== null ? [properties[index]!.name] : null
    const words = describeMappingIssue(issue)
    return { kind: 'refused', category: categoryOf(issue), at, index, issue, words, short: words }
  })
}
