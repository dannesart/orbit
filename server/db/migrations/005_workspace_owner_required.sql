-- Ownership, contract step: every workspace has exactly one current owner, and that owner is
-- a member of the workspace. Migration 004 (the expand step) added owner_id, backfilled it and
-- required the owner to be a member, but left it nullable so code from before ownership could
-- keep creating workspaces during the rollout. Every deployed version now writes owner_id, so
-- this closes the gap:
--
--   1. Lock the table, so no workspace can be created between the backfill and NOT NULL.
--   2. Backfill any owner_id still NULL from created_by, but only where the creator is a member
--      of that workspace (an owner must belong). Ownership already set is never touched.
--   3. If any workspace still has no owner, stop with an explicit error naming it. Nothing is
--      invented: a person decides who owns it, then this migration is run again.
--   4. Check the owner-membership foreign key now (it is DEFERRABLE INITIALLY DEFERRED, and
--      Postgres won't change a column while that check is pending), then enforce NOT NULL.
--
-- The foreign key from 004 is kept exactly as it is. Like every migration here, this runs once,
-- inside the runner's single transaction: any failure rolls back everything above, changing
-- nothing. Each step is also safe to repeat, should it ever be run on a database where it
-- already holds.

LOCK TABLE orbit.workspaces IN ACCESS EXCLUSIVE MODE;

UPDATE orbit.workspaces w
SET owner_id = w.created_by
WHERE w.owner_id IS NULL
  AND EXISTS (
    SELECT 1 FROM orbit.memberships m
    WHERE m.workspace_id = w.id AND m.user_id = w.created_by
  );

DO $$
DECLARE
  unowned text;
BEGIN
  SELECT string_agg(id::text, ', ' ORDER BY created_at) INTO unowned
  FROM orbit.workspaces WHERE owner_id IS NULL;
  IF unowned IS NOT NULL THEN
    RAISE EXCEPTION 'Migration 005: these workspaces have no owner, and their creator is not a member to become one: %', unowned
      USING HINT = 'Decide who owns each of them (an existing member), set owner_id, then run the migration again.';
  END IF;
END $$;

SET CONSTRAINTS orbit.workspaces_owner_is_member IMMEDIATE;

ALTER TABLE orbit.workspaces ALTER COLUMN owner_id SET NOT NULL;
