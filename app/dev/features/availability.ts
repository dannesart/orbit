/**
 * Whether a build includes the Feature playground (/dev/features). Decided once, at build time:
 *
 *   - `nuxt dev` on someone's machine: yes.
 *   - A Netlify Deploy Preview (a pull request's preview): yes. Netlify sets CONTEXT itself, as a
 *     read-only build variable: 'production', 'deploy-preview', 'branch-deploy' or 'dev'.
 *   - Everything else, production above all, and any build without CONTEXT (a local
 *     `nuxt build`, the test suite's builds): no. The route isn't registered, so neither the page
 *     nor anything it imports is part of the build.
 *
 * Only an exact 'deploy-preview' counts: no hostname, query parameter or client-side check is
 * involved, and anything unexpected leaves the playground out.
 */
export function playgroundAvailable(build: { dev: boolean; context: string | undefined }): boolean {
  return build.dev || build.context === 'deploy-preview'
}
