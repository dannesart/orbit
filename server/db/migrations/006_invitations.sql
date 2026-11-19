-- Invitations: an offer to join a workspace, made to one email address. An invitation is not
-- membership. Only its recipient, signed in with that address, can accept it, and accepting is
-- what makes them a member (as Member, never more). Additive: nothing existing changes, and the
-- application already deployed never reads or writes this table.
--
-- Facts, not a status. Every row records what happened, and when:
--   created_at, expires_at    stamped by the database (14 days), never by the application
--   accepted_at, accepted_by  the recipient's account that accepted (and became a member)
--   declined_at               the recipient said no
--   revoked_at, revoked_by    the owner or a steward withdrew it
-- Status is derived when read: revoked, accepted or declined if that fact exists; otherwise
-- expired once now() >= expires_at; otherwise pending. Nothing has to run for an invitation to
-- expire, and an expired invitation stays expired: inviting again creates a new invitation.
--
-- Invariants the database holds:
--   * One email, normalised the way Orbit normalises sign-in addresses (trimmed, lowercase).
--   * At most one closing fact (accepted, declined or revoked), each with its author where it
--     has one, and only while the invitation was open: between creation and expiry.
--   * Closing facts are stamped with the database's clock, and once one is recorded the row's
--     history is final (invitations_record_facts).
--   * At most one OPEN invitation per workspace and address at any moment. "Open" depends on
--     time, which a partial unique index can't express (it would treat an expired invitation as
--     open forever). Instead, an exclusion constraint compares each open invitation's lifetime,
--     [created_at, expires_at): two open invitations for the same workspace and address may not
--     overlap. Once one has expired, a new one starts after it ended and doesn't overlap, so
--     re-inviting works, and concurrent creations can't both succeed. This needs btree_gist
--     (for "=" on uuid and text in the same GiST index): trusted, available on Supabase, and
--     installed below into its `extensions` schema.
--   * An acceptance is recorded only for the account the invitation was addressed to (its email
--     matches), and only if, at commit, that account is a member of the workspace
--     (invitation_acceptance_check, deferred to the end of the transaction, so the acceptance and
--     the membership land together or not at all). Checked only when the acceptance happens, so
--     history stays true if the member later leaves or their address changes.
--
-- What the database does NOT decide: who may invite or revoke (the owner or a steward), or that
-- joining grants Member only. Orbit's server owns authorization (server/utils/invitations.ts,
-- checked inside the same statements); orbit_app is trusted with Orbit's data as a whole, as for
-- every other table. These constraints keep the facts consistent whatever code writes them.
--
-- Privileges: orbit_app may read invitations, create them (workspace, email and inviter only:
-- the database decides the id and times), and record closing facts. It can't change who or what
-- an invitation was for, move its dates, or delete history (no DELETE; invitations go only with
-- their workspace, by cascade).
--
-- Retention (adopted, not implemented here): 90 days after an invitation closes or expires,
-- accepted ones included, it is to be deleted or anonymised by a later, separately privileged
-- mechanism. Memberships never depend on invitations, so that can't affect who belongs where.

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_extension WHERE extname = 'btree_gist') THEN
    IF EXISTS (SELECT FROM pg_namespace WHERE nspname = 'extensions') THEN
      CREATE EXTENSION btree_gist WITH SCHEMA extensions; -- Supabase keeps extensions out of public
    ELSE
      CREATE EXTENSION btree_gist;
    END IF;
  END IF;
END
$$;

CREATE TABLE orbit.invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES orbit.workspaces (id) ON DELETE CASCADE,
  email text NOT NULL,
  invited_by uuid NOT NULL REFERENCES orbit.users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '14 days',
  accepted_at timestamptz,
  accepted_by uuid REFERENCES orbit.users (id),
  declined_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid REFERENCES orbit.users (id),

  CONSTRAINT invitations_email_normalised CHECK (
    email = lower(btrim(email)) AND char_length(email) <= 254
    AND email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ),
  CONSTRAINT invitations_lifetime CHECK (expires_at > created_at),
  CONSTRAINT invitations_one_outcome CHECK (num_nonnulls(accepted_at, declined_at, revoked_at) <= 1),
  CONSTRAINT invitations_accepted_by_someone CHECK ((accepted_at IS NULL) = (accepted_by IS NULL)),
  CONSTRAINT invitations_revoked_by_someone CHECK ((revoked_at IS NULL) = (revoked_by IS NULL)),
  CONSTRAINT invitations_closed_while_open CHECK (
        (accepted_at IS NULL OR (accepted_at >= created_at AND accepted_at < expires_at))
    AND (declined_at IS NULL OR (declined_at >= created_at AND declined_at < expires_at))
    AND (revoked_at IS NULL OR (revoked_at >= created_at AND revoked_at < expires_at))
  ),
  CONSTRAINT invitations_one_open_per_address EXCLUDE USING gist (
    workspace_id WITH =,
    email WITH =,
    tstzrange(created_at, expires_at) WITH &&
  ) WHERE (accepted_at IS NULL AND declined_at IS NULL AND revoked_at IS NULL)
);

-- Invitations addressed to someone (by their verified address) that are still open.
CREATE INDEX invitations_open_by_email_idx ON orbit.invitations (email)
  WHERE accepted_at IS NULL AND declined_at IS NULL AND revoked_at IS NULL;
-- A workspace's invitations (and the cascade when a workspace is deleted).
CREATE INDEX invitations_workspace_idx ON orbit.invitations (workspace_id, created_at);

-- Closing facts are final and carry the database's time. Before any update: a closed invitation
-- can't change at all, and whichever closing fact is being recorded is stamped now().
CREATE FUNCTION orbit.invitations_record_facts() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF num_nonnulls(OLD.accepted_at, OLD.declined_at, OLD.revoked_at) > 0 THEN
    RAISE EXCEPTION 'Invitation % is closed; its history can''t change', OLD.id
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  IF NEW.accepted_at IS NOT NULL THEN NEW.accepted_at := now(); END IF;
  IF NEW.declined_at IS NOT NULL THEN NEW.declined_at := now(); END IF;
  IF NEW.revoked_at IS NOT NULL THEN NEW.revoked_at := now(); END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER invitations_record_facts BEFORE UPDATE ON orbit.invitations
  FOR EACH ROW EXECUTE FUNCTION orbit.invitations_record_facts();

-- Only the recipient accepts, and accepting means belonging: at commit, the account that accepted
-- must be the one the invitation was addressed to, and a member of the workspace.
CREATE FUNCTION orbit.invitation_acceptance_check() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM orbit.users u WHERE u.id = NEW.accepted_by AND lower(u.email) = NEW.email
  ) THEN
    RAISE EXCEPTION 'Invitation % can only be accepted by the account it was addressed to', NEW.id
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM orbit.memberships m
    WHERE m.user_id = NEW.accepted_by AND m.workspace_id = NEW.workspace_id
  ) THEN
    RAISE EXCEPTION 'Invitation % was accepted, but its recipient is not a member of the workspace', NEW.id
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NULL;
END
$$;
CREATE CONSTRAINT TRIGGER invitation_acceptance_check AFTER UPDATE OF accepted_at ON orbit.invitations
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW WHEN (OLD.accepted_at IS NULL AND NEW.accepted_at IS NOT NULL)
  EXECUTE FUNCTION orbit.invitation_acceptance_check();

REVOKE ALL ON orbit.invitations FROM PUBLIC;
REVOKE ALL ON FUNCTION orbit.invitations_record_facts(), orbit.invitation_acceptance_check() FROM PUBLIC;
GRANT SELECT ON orbit.invitations TO orbit_app;
GRANT INSERT (workspace_id, email, invited_by) ON orbit.invitations TO orbit_app;
GRANT UPDATE (accepted_at, accepted_by, declined_at, revoked_at, revoked_by) ON orbit.invitations TO orbit_app;

-- As in 001: Supabase's API roles get nothing here, even if the schema were ever exposed.
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON orbit.invitations FROM %I', r);
    END IF;
  END LOOP;
END
$$;
