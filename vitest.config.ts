import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Two suites each build and start Orbit, and every suite starts an in-process Postgres;
    // in parallel that setup can exceed the 10 s default on slower machines.
    hookTimeout: 60_000,
  },
})
