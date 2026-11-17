# Orbit

Nuxt 4 · TypeScript · Tailwind v4. Requires Node ≥ 22.22 (uses the built-in `node:sqlite`).

```sh
npm install
npm run dev                       # http://localhost:3100
npm run build && npm run preview  # production build, also on :3100
npm test                          # data-layer tests
npm run typecheck
```

Data is stored in `.data/orbit.sqlite` (override with `NUXT_DB_PATH`). Delete the file to start over.

Until real sign-in exists, each browser gets an anonymous identity (an httpOnly `orbit_uid` cookie)
the first time it creates a workspace.
