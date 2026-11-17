// `npm run db:password`: creates the orbit_app role's password locally.
// Prints an ALTER ROLE statement that carries only a SCRAM-SHA-256 verifier (what psql's
// \password sends), so the plaintext never reaches Supabase's statement logs or SQL editor
// history. Writes no files, connects to nothing and executes nothing.
import { createHash, createHmac, pbkdf2Sync, randomBytes } from 'node:crypto'
import { fileURLToPath } from 'node:url'

/** PostgreSQL's SCRAM-SHA-256 verifier format (RFC 5802/7677), as stored in pg_authid. */
export function scramSha256Verifier(password: string, salt = randomBytes(16), iterations = 4096): string {
  const salted = pbkdf2Sync(password.normalize('NFKC'), salt, iterations, 32, 'sha256')
  const hmac = (text: string) => createHmac('sha256', salted).update(text).digest()
  const storedKey = createHash('sha256').update(hmac('Client Key')).digest()
  const serverKey = hmac('Server Key')
  return `SCRAM-SHA-256$${iterations}:${salt.toString('base64')}$${storedKey.toString('base64')}:${serverKey.toString('base64')}`
}

/** 32 URL-safe characters (192 bits): needs no escaping in a connection URL. */
export const generatePassword = () => randomBytes(24).toString('base64url')

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const password = generatePassword()
  const ref = process.env.NUXT_SUPABASE_URL ? new URL(process.env.NUXT_SUPABASE_URL).hostname.split('.')[0] : '<project-ref>'
  const migrationHost = process.env.MIGRATION_DATABASE_URL ? new URL(process.env.MIGRATION_DATABASE_URL).hostname : ''
  const host = migrationHost.endsWith('.pooler.supabase.com') ? migrationHost : '<pooler-host>'

  console.log(`
1) In Supabase → SQL editor, run this statement. It contains only a verifier, never the password:

   ALTER ROLE orbit_app WITH PASSWORD '${scramSha256Verifier(password)}';

2) Store the connection URL below as NUXT_DATABASE_URL in your local .env (git-ignored) and in
   Netlify → Site configuration → Environment variables. The password is shown only here:
   it is not saved anywhere, so clear this terminal afterwards. Lost it? Run this command again
   and repeat both steps.

   postgresql://orbit_app.${ref}:${password}@${host}:6543/postgres
`)
}
