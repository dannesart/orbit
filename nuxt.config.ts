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
  app: {
    head: {
      title: 'Orbit',
      htmlAttrs: { lang: 'en' },
      meta: [{ name: 'viewport', content: 'width=device-width, initial-scale=1' }],
      link: [{ rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }],
    },
  },
})
