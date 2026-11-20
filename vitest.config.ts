import { fileURLToPath } from 'node:url'
import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  // Nuxt's alias for code shared by app and server, as app code imports it.
  resolve: { alias: { '#shared': fileURLToPath(new URL('./shared', import.meta.url)) } },
  test: {
    // Two suites each build and start Orbit, and every suite starts an in-process Postgres;
    // in parallel that setup can exceed the 10 s default on slower machines.
    hookTimeout: 60_000,
    // Real concurrent PostgreSQL sessions: opt-in, `npm run test:concurrency`.
    exclude: [...configDefaults.exclude, 'test/concurrency/**'],
  },
})
