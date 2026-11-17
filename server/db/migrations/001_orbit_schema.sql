-- Orbit's tables live in their own schema. Supabase's Data API only exposes the schemas
-- listed in its settings (by default `public`), so `orbit` is reachable solely through
-- server-side database connections.
CREATE SCHEMA IF NOT EXISTS orbit;

CREATE TABLE orbit.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_subject text NOT NULL UNIQUE, -- Supabase Auth user id; identity only, never authority
  email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE orbit.sessions (
  token_hash text PRIMARY KEY, -- SHA-256 of the cookie token; the token itself is never stored
  user_id uuid NOT NULL REFERENCES orbit.users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX sessions_user_id_idx ON orbit.sessions (user_id);

CREATE TABLE orbit.workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 64),
  created_by uuid NOT NULL REFERENCES orbit.users (id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE orbit.memberships (
  user_id uuid NOT NULL REFERENCES orbit.users (id),
  workspace_id uuid NOT NULL REFERENCES orbit.workspaces (id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('admin', 'member')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, workspace_id)
);
CREATE INDEX memberships_workspace_id_idx ON orbit.memberships (workspace_id);

-- Least privilege: the app connects as `orbit_app`, which can only read and write these
-- four tables (not schema_migrations). Later migrations must grant new tables explicitly.
-- It is created without a password. Set one with `npm run db:password`, which prints an
-- ALTER ROLE statement carrying only a SCRAM verifier (DDL statements are logged by Supabase).
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'orbit_app') THEN
    CREATE ROLE orbit_app LOGIN NOINHERIT;
  END IF;
END
$$;

REVOKE ALL ON SCHEMA orbit FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA orbit FROM PUBLIC;
GRANT USAGE ON SCHEMA orbit TO orbit_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON orbit.users, orbit.sessions, orbit.workspaces, orbit.memberships TO orbit_app;

-- Supabase's API roles get nothing here, even if the schema were ever exposed by mistake.
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON SCHEMA orbit FROM %I', r);
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA orbit FROM %I', r);
    END IF;
  END LOOP;
END
$$;
