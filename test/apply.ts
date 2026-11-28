// Applying a Transform configuration in tests, the way the Designer does: through the authoritative
// Apply, for the Transform version a step invokes (Transform v2 by default, the Designer's own
// default), in the workspace the step runs in (the playground's own, by default). How references
// resolve follows from that workspace (scopeOf), as it does for the page.
import type { MappingFeature } from '../shared/features/features'
import { orbitTransformV2 } from '../shared/features/features'
import { type ApplyContext, type Configuration, type TransformDraft, applyConfiguration } from '../app/dev/designer/config'
import { WORKSPACE } from '../app/dev/features/experiment'

export const stepOf = (_config: Configuration, feature: MappingFeature = orbitTransformV2, workspaceId: string = WORKSPACE): ApplyContext => ({ feature, workspaceId })

/** The configuration after Apply: the same one when there's nothing to apply; refusing anything else fails the test. */
export function applyFor(config: Configuration, draft: TransformDraft, feature: MappingFeature = orbitTransformV2, workspaceId: string = WORKSPACE): Configuration {
  const result = applyConfiguration(config, draft, stepOf(config, feature, workspaceId))
  if (result.applied || result.assessment.state === 'unchanged') return result.config
  throw new Error(`Apply refused (${result.assessment.state}): ${result.assessment.problems.map((p) => p.words).join(' | ')}`)
}
