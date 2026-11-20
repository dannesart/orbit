-- Invitation roles and membership authority. Additive for the application already deployed:
-- invitations it creates get role 'member' (the default), it never updates memberships, and it
-- updates workspaces only by name and description, which stay granted.
--
--   1. invitations.role: what an invitation offers, 'member' or 'admin' (Steward). Never owner:
--      ownership is workspaces.owner_id, not a role, and no invitation can set it. Fixed once made.
--   2. memberships.id: an opaque handle for one person's place in one workspace, so membership
--      actions can name their target without exposing account ids. New on each (re)joining.
--   3. Acceptance integrity: a Steward invitation is accepted only while its inviter is the
--      workspace's owner, and only together with the recipient becoming a steward.
--   4. Narrower privileges: orbit_app can no longer change who owns a workspace, or move a
--      membership to another person or workspace. Ownership transfer will need its own path.

-- 1. What an invitation offers. A constant default: existing rows (none in production) become
-- Member invitations without rewriting the table.
ALTER TABLE orbit.invitations
  ADD COLUMN role text NOT NULL DEFAULT 'member'
  CONSTRAINT invitations_role CHECK (role IN ('member', 'admin'));
GRANT INSERT (role) ON orbit.invitations TO orbit_app; -- no UPDATE: the offer can't be changed

-- Closed invitations already can't change at all. An open one's offer can't either, whoever
-- writes (orbit_app has no UPDATE on role in any case).
CREATE OR REPLACE FUNCTION orbit.invitations_record_facts() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF num_nonnulls(OLD.accepted_at, OLD.declined_at, OLD.revoked_at) > 0 THEN
    RAISE EXCEPTION 'Invitation % is closed; its history can''t change', OLD.id
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'Invitation %''s offered role can''t change', OLD.id
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  IF NEW.accepted_at IS NOT NULL THEN NEW.accepted_at := now(); END IF;
  IF NEW.declined_at IS NOT NULL THEN NEW.declined_at := now(); END IF;
  IF NEW.revoked_at IS NOT NULL THEN NEW.revoked_at := now(); END IF;
  RETURN NEW;
END
$$;

-- 2. A handle per membership. gen_random_uuid() is volatile, so this rewrites memberships once
-- (two rows in production), under the migration's own lock.
ALTER TABLE orbit.memberships ADD COLUMN id uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE orbit.memberships ADD CONSTRAINT memberships_id_key UNIQUE (id);

-- 3. Acceptance, checked at commit (the trigger from 006, deferred, unchanged in shape):
--    * the account that accepted is the one the invitation was addressed to;
--    * it is a member of the workspace;
--    * NEW: for a Steward invitation, it is a steward, and the inviter is still the owner.
-- A Steward invitation made by someone who is no longer (or never was) the owner can therefore
-- never be recorded as accepted, whatever code writes it: stewardship is granted only by the
-- current owner. History stays true: this runs only when the acceptance is recorded.
CREATE OR REPLACE FUNCTION orbit.invitation_acceptance_check() RETURNS trigger LANGUAGE plpgsql AS $$
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
  IF NEW.role = 'admin' AND NOT EXISTS (
    SELECT 1 FROM orbit.memberships m JOIN orbit.workspaces w ON w.id = m.workspace_id
    WHERE m.user_id = NEW.accepted_by AND m.workspace_id = NEW.workspace_id AND m.role = 'admin'
      AND w.owner_id = NEW.invited_by
  ) THEN
    RAISE EXCEPTION 'Steward invitation % can only be accepted while its inviter owns the workspace, making its recipient a steward', NEW.id
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NULL;
END
$$;

-- 4. Narrower privileges. CREATE OR REPLACE kept both functions' owner and ACL from 006.
REVOKE UPDATE ON orbit.workspaces FROM orbit_app;
GRANT UPDATE (name, description) ON orbit.workspaces TO orbit_app;  -- never owner_id, created_by, id
REVOKE UPDATE ON orbit.memberships FROM orbit_app;
GRANT UPDATE (role) ON orbit.memberships TO orbit_app;              -- never whose, or which workspace
