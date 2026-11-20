// A disposable PostgreSQL 17 server for concurrency tests (embedded-postgres): a temporary data
// directory, a random local port, deleted when stopped. Unlike PGlite (one backend session, used
// by the ordinary tests), it runs real concurrent sessions, so transactions can truly overlap and
// wait for each other's row locks. Set up like Supabase: an `extensions` schema, Orbit's real
// migrations, and the application running as orbit_app. Never touches any shared database.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import EmbeddedPostgres from 'embedded-postgres'
import postgres from 'postgres'
import { migrate } from '../../server/db/migrate'

export interface Session {
  name: string
  sql: postgres.Sql
  pid: number
}

export async function startPostgres() {
  const dir = mkdtempSync(join(tmpdir(), 'orbit-concurrency-'))
  const port = 50_000 + Math.floor(Math.random() * 10_000)
  const password = Math.random().toString(36).slice(2) // throwaway, for this local server only
  const server = new EmbeddedPostgres({
    databaseDir: join(dir, 'data'), user: 'postgres', password, port, persistent: false,
    onLog: () => {}, onError: () => {},
  })
  await server.initialise()
  await server.start()
  const url = `postgres://postgres:${password}@127.0.0.1:${port}/postgres`
  const admin = postgres(url, { max: 1, onnotice: () => {} })
  await admin`CREATE SCHEMA extensions` // as on Supabase: btree_gist goes there (migration 006)
  await migrate(admin)
  const sessions: Session[] = []

  /** One backend session, like one request's connection; as orbit_app unless `superuser`. */
  async function session(name: string, { superuser = false } = {}): Promise<Session> {
    const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} })
    const [{ pid }] = await sql<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`
    await sql.unsafe(`${superuser ? '' : 'SET ROLE orbit_app; '}SET lock_timeout = '10s'`)
    const s = { name, sql, pid }
    sessions.push(s)
    return s
  }

  /** Resolves once `waiter` is waiting on a lock that `holder` holds; fails if it never does. */
  async function waitsFor(waiter: Session, holder: Session) {
    for (let i = 0; i < 200; i++) {
      const [row] = await admin<{ by: number[] }[]>`
        SELECT pg_blocking_pids(pid) AS by FROM pg_stat_activity WHERE pid = ${waiter.pid} AND wait_event_type = 'Lock'`
      if (row?.by.includes(holder.pid)) return
      await new Promise((r) => setTimeout(r, 25))
    }
    const [now] = await admin`SELECT state, wait_event_type, pg_blocking_pids(pid) AS by FROM pg_stat_activity WHERE pid = ${waiter.pid}`
    throw new Error(`${waiter.name} never waited for ${holder.name}: ${JSON.stringify(now)}`)
  }

  /** How many sessions are waiting on any lock right now (0 once a scenario has settled). */
  const waiting = async () => (await admin<{ n: number }[]>`SELECT count(*)::int AS n FROM pg_locks WHERE NOT granted`)[0]!.n

  async function stop() {
    for (const s of sessions) await s.sql.end({ timeout: 1 })
    await admin.end({ timeout: 1 })
    await server.stop()
    rmSync(dir, { recursive: true, force: true })
  }

  return { admin, session, waitsFor, waiting, stop }
}
