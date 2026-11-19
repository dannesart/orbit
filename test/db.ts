// An in-process PostgreSQL (PGlite) served over the wire protocol, with Orbit's real
// migrations applied. Same dialect and driver as production; no Docker, no network.
import { PGlite } from '@electric-sql/pglite'
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist'
import { PGLiteSocketServer } from '@electric-sql/pglite-socket'
import postgres from 'postgres'
import { migrate } from '../server/db/migrate'

/**
 * `asApp`: after migrating, everything runs as the least-privileged `orbit_app` role, as in
 * production. (PGlite has a single backend session shared by every connection, so one
 * SET ROLE applies to the test's queries and the Orbit server's alike.)
 */
export async function startTestDatabase({
  asApp = false,
  /** Runs as the superuser after migrating, before switching role: seed data, or break things on purpose. */
  prepare,
  /** Apply migrations only up to this one (e.g. to test a later migration's backfill). */
  upTo,
}: { asApp?: boolean; prepare?: (sql: postgres.Sql) => Promise<void>; upTo?: string } = {}) {
  // btree_gist, as on Supabase (migration 006 installs it; PGlite bundles it as an extension).
  const pg = await PGlite.create({ extensions: { btree_gist } })
  // Supabase's API roles, so the migration's revokes run exactly as they would there.
  await pg.exec('CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;')

  const server = new PGLiteSocketServer({ db: pg, host: '127.0.0.1', port: 0, maxConnections: 20 })
  await server.start()
  const url = `postgres://postgres:postgres@127.0.0.1:${server.port}/postgres`
  const sql = postgres(url, { max: 1, prepare: false, ssl: false, onnotice: () => {} })
  await migrate(sql, { upTo })
  if (prepare) await prepare(sql)
  if (asApp) await pg.exec('SET ROLE orbit_app')

  return {
    url,
    sql,
    async close() {
      await sql.end({ timeout: 1 })
      await server.stop()
      await pg.close()
    },
  }
}
