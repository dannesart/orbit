import { defineConfig } from 'vitest/config'

// `npm run test:concurrency`: transactions that truly overlap, on a disposable PostgreSQL 17
// (embedded-postgres; test/concurrency/postgres.ts). Opt-in, not part of `npm test`.
export default defineConfig({
  test: {
    include: ['test/concurrency/**/*.test.ts'],
    hookTimeout: 120_000, // first run initialises a database cluster
    testTimeout: 30_000,
    fileParallelism: false,
  },
})
