// Whether the Transform version runs use can take the contracts at all, asked with the boundary's
// own check (contractCompatibility) and never by running it. Kept apart from the preview, which
// never touches a Feature: it receives the answer as plain data (ContractSupport).
import type { DefinitionVersion } from '#shared/features/definitions'
import { type MappingFeature, contractCompatibility, orbitTransformV2 } from '#shared/features/features'
import type { ContractSupport } from './preview'

/** What this Transform version (the one runs use, unless said otherwise) refuses in what it reads and makes. */
export const transformSupport = (input: DefinitionVersion, output: DefinitionVersion, feature: MappingFeature = orbitTransformV2): ContractSupport => ({
  version: feature.version,
  reads: contractCompatibility(feature, input),
  makes: contractCompatibility(feature, output),
})
