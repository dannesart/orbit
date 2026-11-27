// Applying a Transform configuration in tests, the way the Designer does: through the authoritative
// Apply, for the Transform version a step invokes (Transform v2 by default, the Designer's own
// default), with references resolved among the configuration's own Definitions.
import type { MappingFeature } from '../shared/features/features'
import { orbitTransformV2 } from '../shared/features/features'
import { type ApplyContext, type Configuration, type TransformDraft, applyConfiguration, findDefinition } from '../app/dev/designer/config'

export const stepOf = (config: Configuration, feature: MappingFeature = orbitTransformV2): ApplyContext => ({ feature, resolve: (ref) => findDefinition(config, ref) })

/** The configuration after Apply: the same one when there's nothing to apply; refusing anything else fails the test. */
export function applyFor(config: Configuration, draft: TransformDraft, feature: MappingFeature = orbitTransformV2): Configuration {
  const result = applyConfiguration(config, draft, stepOf(config, feature))
  if (result.applied || result.assessment.state === 'unchanged') return result.config
  throw new Error(`Apply refused (${result.assessment.state}): ${result.assessment.problems.map((p) => p.words).join(' | ')}`)
}
