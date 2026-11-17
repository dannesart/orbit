import tailwindcss from '@tailwindcss/vite'

export default defineNuxtConfig({
  compatibilityDate: '2026-11-01',
  devtools: { enabled: false },
  devServer: { port: 3100 },
  css: ['~/assets/css/main.css'],
  vite: { plugins: [tailwindcss()] },
  runtimeConfig: {
    // Server-only. Override via NUXT_SITE_URL, NUXT_DB_PATH, NUXT_SUPABASE_URL, NUXT_SUPABASE_KEY.
    siteUrl: 'http://localhost:3100', // where email links return; must be allowed in Supabase
    dbPath: '.data/orbit.sqlite',
    supabaseUrl: '',
    supabaseKey: '',
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
