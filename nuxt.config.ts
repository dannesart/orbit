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
    (_options, nuxt) => {
      if (!playgroundAvailable({ dev: nuxt.options.dev, context: process.env.CONTEXT })) return
      nuxt.hook('pages:extend', (pages) => {
        pages.push({ name: 'dev-features', path: '/dev/features', file: fileURLToPath(new URL('./app/dev/features/FeaturePlayground.vue', import.meta.url)) })
        pages.push({ name: 'dev-designer', path: '/dev/designer', file: fileURLToPath(new URL('./app/dev/designer/SpatialDesigner.vue', import.meta.url)) })
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
