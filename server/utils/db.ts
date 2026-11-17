import postgres, { type Sql } from 'postgres'

export type Db = Sql

let sql: Sql | undefined

/**
 * Orbit's PostgreSQL connection (server-only), as the least-privileged `orbit_app` role.
 * One small, reused connection per server instance: on Netlify that is one per function
 * instance, through Supabase's transaction pooler (which does not support prepared statements).
 */
export function useDb(): Sql {
  if (sql) return sql
  const { databaseUrl } = useRuntimeConfig()
  if (!databaseUrl) throw createError({ statusCode: 503, statusMessage: 'Orbit’s database isn’t configured yet.' })

  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(databaseUrl)
  sql = postgres(databaseUrl, {
    max: 1,
    prepare: false,
    idle_timeout: 20,
    connect_timeout: 10,
    ssl: local ? false : 'require', // never send credentials or data in plain text
    onnotice: () => {},
  })
  return sql
}
