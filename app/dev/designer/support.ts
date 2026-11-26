// Whether the Transform version a step invokes can take the contracts at all, asked with the
// boundary's own check (contractCompatibility, per side) and never by running it, and how it reads
// sources (flat, or nested too). Kept apart from the preview, which never touches a Feature: it
// receives the answer as plain data (ContractSupport, Reading).
import type { DefinitionVersion, Resolve } from '#shared/features/definitions'
import { type MappingFeature, contractCompatibility } from '#shared/features/features'
import type { ContractSupport } from './preview'

/** What this Transform version refuses in what it reads and makes, and how it reads sources. */
export const transformSupport = (input: DefinitionVersion, output: DefinitionVersion, feature: MappingFeature, resolve: Resolve = () => null): ContractSupport => ({
  version: feature.version,
  reads: contractCompatibility(feature, input, 'input'),
  makes: contractCompatibility(feature, output, 'output'),
  reading: { nested: feature.sources === 'nested', resolve },
})
