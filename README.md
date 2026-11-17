# Orbit

Nuxt 4 · TypeScript · Tailwind v4 · Supabase (Auth + PostgreSQL). Requires Node ≥ 22.22.

```sh
npm install
npm run dev                       # http://localhost:3100
npm run build && npm run preview  # production build, also on :3100
npm test                          # unit + HTTP tests on an in-process Postgres (no network)
npm run typecheck
npm run db:migrate                # apply pending migrations (needs MIGRATION_DATABASE_URL)
npm run db:password               # new orbit_app password: prints SQL with a verifier only
```

Copy `.env.example` to `.env` and fill in the values it describes. Local development and Netlify
use the same Supabase project.

## Data (Supabase PostgreSQL)

Orbit's tables live in a private `orbit` schema that Supabase's Data API does not expose.
Only the server talks to the database:

- **The app** connects as `orbit_app` (`NUXT_DATABASE_URL`, transaction pooler, port 6543).
  That role can only read and write Orbit's tables.
- **Migrations** (`server/db/migrations/*.sql`) are applied explicitly with `npm run db:migrate`,
  as the `postgres` role (`MIGRATION_DATABASE_URL`, session pooler, port 5432). They run once each,
  in order, in one transaction. Netlify never holds these credentials.

Both URLs use Supabase's pooler host (Database → Connect); the direct `db.<ref>.supabase.co` host
is IPv6-only.

First-time setup:

1. `npm run db:migrate` creates the schema and the `orbit_app` role (without a password).
2. `npm run db:password` generates a password locally and prints an `ALTER ROLE` statement that
   carries only its SCRAM verifier. Run that statement in the Supabase SQL editor, then store the
   printed connection URL as `NUXT_DATABASE_URL` in `.env` and in Netlify. Never set the password
   with a plaintext `ALTER ROLE … PASSWORD '…'`: Supabase logs DDL statements, so it would end up
   in the database logs.

## Sign-in (Supabase Auth, email codes)

In Supabase, enable Email sign-in and put `{{ .Token }}` (not `{{ .ConfirmationURL }}`) in both
the **Magic Link** and **Confirm signup** templates: new addresses receive the latter.

Supabase only proves the email address. Orbit then issues its own session cookie, and
workspace access is decided solely by Orbit's memberships.

## Netlify

Nuxt deploys without extra configuration. In Site configuration → Environment variables, set
`NUXT_SUPABASE_URL`, `NUXT_SUPABASE_KEY` and `NUXT_DATABASE_URL`. Deploy previews share the same
database.
