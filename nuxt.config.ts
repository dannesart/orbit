import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import { playgroundAvailable } from './app/dev/features/availability'

export default defineNuxtConfig({
  compatibilityDate: '2026-11-01',
  devtools: { enabled: false },
  devServer: { port: 3100 },
  modules: [
    // The Feature playground (/dev/features) and its canvas experiment (/dev/designer) exist only
    // under `nuxt dev` and in Netlify Deploy Previews (playgroundAvailable). Production builds never
    // register their routes, so neither the pages nor anything they import (the canvas library
    // included) is part of what ships.
    // The workflow entry experiment follows the same decision: `import.meta.env.ORBIT_PLAYGROUND` is
    // a build-time constant (false in production, so code behind it is dropped), and the
    // workspace's Workflows place is a child route registered only below the same guard.
    (_options, nuxt) => {
      nuxt.options.vite.define = {
        ...nuxt.options.vite.define,
        'import.meta.env.ORBIT_PLAYGROUND': JSON.stringify(playgroundAvailable({ dev: nuxt.options.dev, context: process.env.CONTEXT })),
      }
      if (!playgroundAvailable({ dev: nuxt.options.dev, context: process.env.CONTEXT })) return
      nuxt.hook('pages:extend', (pages) => {
        pages.push({ name: 'dev-features', path: '/dev/features', file: fileURLToPath(new URL('./app/dev/features/FeaturePlayground.vue', import.meta.url)) })
        pages.push({ name: 'dev-designer', path: '/dev/designer', file: fileURLToPath(new URL('./app/dev/designer/SpatialDesigner.vue', import.meta.url)) })
        const workspace = pages.find((page) => page.file?.replaceAll('\\', '/').endsWith('/pages/w/[id].vue'))
        if (!workspace) throw new Error('The workspace layout (pages/w/[id].vue) is missing: the Workflows place has nowhere to live')
        workspace.children = [
          ...(workspace.children ?? []),
          { name: 'w-id-workflows', path: 'workflows', file: fileURLToPath(new URL('./app/dev/workspace/WorkflowsPlace.vue', import.meta.url)) },
          // Experiment #7: the workspace’s Definitions, its own place in the workspace navigation,
          // under the same guard.
          { name: 'w-id-definitions', path: 'definitions', file: fileURLToPath(new URL('./app/dev/definitions/DefinitionsPlace.vue', import.meta.url)) },
        ]
      })
    },
  ],
  css: ['~/assets/css/main.css'],
  vite: { plugins: [tailwindcss()] },
  runtimeConfig: {
    // Server-only. Set via NUXT_DATABASE_URL, NUXT_SUPABASE_URL, NUXT_SUPABASE_KEY (see .env.example).
    databaseUrl: '',
    supabaseUrl: '',
    supabaseKey: '',
  },
  routeRules: {
    // Invitations and workspaces are personal (addresses, offers, who belongs, membership ids
    // and what you may do to them): never stored by a browser, proxy or CDN, errors included.
    '/api/invitations/**': { headers: { 'cache-control': 'private, no-store' } },
    '/api/workspaces/**': { headers: { 'cache-control': 'private, no-store' } },
    // An invitation's public preview is reached by a link that is effectively a secret: never
    // indexed, and never passed on in a Referer header.
    '/api/invitations/*/preview': { headers: { 'x-robots-tag': 'noindex', 'referrer-policy': 'no-referrer' } },
    // The page behind an invitation's link: the same protections for the page itself.
    '/invitations/**': { headers: { 'cache-control': 'private, no-store', 'x-robots-tag': 'noindex', 'referrer-policy': 'no-referrer' } },
  },
  app: {
    head: {
      title: 'Orbit',
      htmlAttrs: { lang: 'en' },
      meta: [{ name: 'viewport', content: 'width=device-width, initial-scale=1' }],
      link: [{ rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }],
    },
  },
})
