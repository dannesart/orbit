// Applies server/db/migrations/*.sql in order, each exactly once, in a single transaction
// guarded by an advisory lock. Run explicitly with `npm run db:migrate`; the deployed app
// never migrates and never holds the credentials needed to do so.
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import postgres, { type Sql } from 'postgres'

const dir = fileURLToPath(new URL('./migrations/', import.meta.url))

/** `upTo` (tests only): stop after that migration, to build a database as it once was. */
export async function migrate(sql: Sql, { upTo }: { upTo?: string } = {}): Promise<string[]> {
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql') && (!upTo || f <= upTo)).sort()
  return sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(hashtext('orbit-migrations'))`
    // Kept in the private schema: `public` is exposed through Supabase's Data API.
    await tx`CREATE SCHEMA IF NOT EXISTS orbit`
    await tx`CREATE TABLE IF NOT EXISTS orbit.schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`
    const done = new Set((await tx<{ name: string }[]>`SELECT name FROM orbit.schema_migrations`).map((r) => r.name))

    const applied: string[] = []
    for (const file of files.filter((f) => !done.has(f))) {
      await tx.unsafe(readFileSync(dir + file, 'utf8'))
      await tx`INSERT INTO orbit.schema_migrations (name) VALUES (${file})`
      applied.push(file)
    }
    return applied
  })
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const url = process.env.MIGRATION_DATABASE_URL
  if (!url) {
    console.error('Set MIGRATION_DATABASE_URL (see .env.example).')
    process.exit(1)
  }
  const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {}, ssl: 'require' })
  try {
    const applied = await migrate(sql)
    console.log(applied.length ? `Applied: ${applied.join(', ')}` : 'Database is up to date.')
  } catch (error) {
    // Postgres errors carry no credentials; print only the message.
    console.error('Migration failed:', (error as Error).message)
    process.exitCode = 1
  } finally {
    await sql.end()
  }
}
