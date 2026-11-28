// The Designer's real Apply surfaces, server-rendered in a test: the inspector and Mapping Studio, given exactly the props the Designer page gives them (view.ts: transformView,
// appliedPreview), so what's checked is what each surface actually renders, not a rule restated.
// No DOM and no Nuxt here: Nuxt's auto-imported Vue functions are provided as globals, and NuxtLink as
// a plain link, before any component is loaded.
import * as vue from 'vue'
import { renderToString } from 'vue/server-renderer'
import type { ApplyContext, Configuration, TransformDraft } from '../app/dev/designer/config'

const AUTO_IMPORTED = ['computed', 'ref', 'shallowRef', 'reactive', 'readonly', 'toRef', 'inject', 'provide', 'watch', 'watchEffect', 'nextTick', 'onMounted', 'onBeforeUnmount', 'onUnmounted', 'useId', 'useTemplateRef'] as const
for (const name of AUTO_IMPORTED) (globalThis as Record<string, unknown>)[name] ??= vue[name]

/**
 * Each place the page shows the Transform's draft: the inspector and Mapping Studio, and Mapping
 * Studio's Preview (shown on its own segment). Only Mapping Studio applies; the inspector says where
 * unapplied changes stand (unappliedState) and leads there.
 */
export type SurfaceName = 'inspector' | 'Mapping Studio' | 'Studio preview'
export const SURFACES: readonly SurfaceName[] = ['inspector', 'Mapping Studio']
export const APPLY_SURFACES: readonly SurfaceName[] = ['Mapping Studio']

/** The surface, rendered as the page renders it for this configuration, draft and step. */
export async function renderSurface(surface: SurfaceName, config: Configuration, draft: TransformDraft, step: ApplyContext, recordText: string, extra: Record<string, unknown> = {}): Promise<string> {
  const { transformView, appliedPreview } = await import('../app/dev/designer/view')
  const { featureKey, featureVersionWords } = await import('../app/dev/features/experiment')
  const { READING } = await import('../app/dev/designer/reading')
  const view = transformView(config, draft, step, recordText)
  // The props the page passes (SpatialDesigner.vue), from the same derivation.
  const common = {
    draft, config, target: view.target, plan: view.plan, structure: view.structure, review: view.review, output: view.output,
    example: view.example, input: view.input, assessment: view.assessment,
  }
  const [component, props] = surface === 'inspector'
    ? [(await import('../app/dev/designer/TransformInspector.vue')).default, { ...common, badge: 'Step 2', step: null, stale: false, runNumber: 0, runs: [], feature: featureVersionWords(step.feature), featureKey: featureKey(step.feature) }]
      : surface === 'Mapping Studio'
        ? [(await import('../app/dev/designer/MappingStudio.vue')).default, { ...common, canUndo: false, incoming: { step: 'Console · Step 1', ref: view.assessment.from.ref }, boundary: view.boundary, feature: `Transform v${step.feature.version}`, applied: appliedPreview(config, step, recordText), step: null, stale: false, runNumber: 0, runs: [] }]
        // As MappingStudio passes it its props.
        : [(await import('../app/dev/designer/StudioPreview.vue')).default, { draft, config, target: view.target, review: view.review, output: view.output, example: view.example, input: view.input, inputLabel: view.assessment.from.label, applied: appliedPreview(config, step, recordText), step: null, stale: false, runNumber: 0, runs: [] }]
  const app = vue.createSSRApp(component, { ...props, ...extra })
  app.provide(READING, vue.ref(view.reading))
  app.component('NuxtLink', (_: unknown, { slots }: vue.SetupContext) => vue.h('a', slots.default?.()))
  const problems: string[] = []
  app.config.warnHandler = (message) => { problems.push(message) }
  const html = await renderToString(app)
  if (problems.length) throw new Error(`${surface} rendered with warnings: ${problems.join(' | ')}`)
  return html
}

/** The inspector's word for unapplied changes: its state, and whether it says they're ready to apply; null when it says there are none. */
export function unappliedState(html: string): { state: string; ready: boolean } | null {
  const m = html.match(/<div\b[^>]*\bdata-unapplied\b[^>]*data-state="(\w+)"[^>]*>([\s\S]*?)<\/div>/)
  return m ? { state: m[1]!, ready: m[2]!.includes('Ready to apply') } : null
}

/** Every Apply button the HTML has: whether each is enabled. */
export function applyButtons(html: string): boolean[] {
  return [...html.matchAll(/<button\b[^>]*\bdata-apply\b[^>]*>/g)].map((m) => !/\sdisabled(?=[\s>=])/.test(m[0]))
}
