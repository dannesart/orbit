# Orbit

Nuxt 4 · TypeScript · Tailwind v4. Requires Node ≥ 22.22 (uses the built-in `node:sqlite`).

```sh
npm install
npm run dev                       # http://localhost:3100
npm run build && npm run preview  # production build, also on :3100
npm test                          # unit + HTTP tests (no network needed)
npm run typecheck
```

Data is stored in `.data/orbit.sqlite` (override with `NUXT_DB_PATH`). Deleting it removes all
workspaces and signs everyone out.

## Sign-in (Supabase Auth, email codes)

Copy `.env.example` to `.env` and fill in the project URL and **publishable** key. In Supabase,
enable Email sign-in and put `{{ .Token }}` (not `{{ .ConfirmationURL }}`) in both the
**Magic Link** and **Confirm signup** templates: new addresses receive the latter.

Supabase only proves the email address. Orbit then issues its own session cookie, and
workspace access is decided solely by Orbit's memberships.
