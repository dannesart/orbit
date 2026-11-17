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

## Sign-in (Supabase Auth, email links)

Copy `.env.example` to `.env` and fill in the project URL and **publishable** key. In Supabase,
Email sign-in must be enabled and the Site URL set to `http://localhost:3100` (or add
`http://localhost:3100/auth/callback` to Redirect URLs). The default email templates work as-is.

Supabase only proves the email address. Orbit then issues its own session cookie, and
workspace access is decided solely by Orbit's memberships.
