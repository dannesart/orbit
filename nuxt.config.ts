import tailwindcss from '@tailwindcss/vite'

export default defineNuxtConfig({
  compatibilityDate: '2026-11-01',
  devtools: { enabled: false },
  devServer: { port: 3100 },
  css: ['~/assets/css/main.css'],
  vite: { plugins: [tailwindcss()] },
  runtimeConfig: {
    // Server-only. Set via NUXT_DATABASE_URL, NUXT_SUPABASE_URL, NUXT_SUPABASE_KEY (see .env.example).
    databaseUrl: '',
    supabaseUrl: '',
    supabaseKey: '',
  },
  routeRules: {
    // Invitations are personal (an address, an offer to one person): never stored by a browser,
    // proxy or CDN, whatever the answer, errors included.
    '/api/invitations/**': { headers: { 'cache-control': 'private, no-store' } },
    '/api/workspaces/*/invitations/**': { headers: { 'cache-control': 'private, no-store' } },
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
