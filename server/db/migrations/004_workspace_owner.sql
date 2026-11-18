-- Ownership: the one person ultimately responsible for a workspace (Owner in the product).
-- It is a relationship of its own, separate from created_by (history: who made the
-- workspace) and from membership roles (what someone can do: admin = Steward, member = Member).
--
-- This is the EXPAND half of a two-step rollout, so the code already in production keeps
-- creating workspaces while it changes:
--   004 (this): add owner_id, backfill it, and require the owner to be a member, but leave
--               it nullable, because code from before ownership inserts without it.
--   005 (later, once production writes owner_id): backfill any workspace made by older code
--               in between, then make owner_id NOT NULL.
-- Until 005, the application refuses to present a workspace without exactly one owner
-- (see assertOneOwner in server/utils/workspaces.ts) rather than infer one.
--
-- Invariants the database holds from here on:
--   * The owner belongs to the workspace: (owner_id, id) must match an existing membership
--     (user_id, workspace_id). Nobody outside can be made owner, and the owner's membership
--     can't be removed or moved while they own the workspace. (A NULL owner_id is not
--     checked: that is the transitional case 005 closes.)
--   * The check runs at commit (DEFERRABLE INITIALLY DEFERRED), so creating a workspace
--     (its row, then the owner's membership) and, later, transferring ownership (one UPDATE
--     of owner_id) each happen in a single transaction, never leaving a moment without an owner.
--   * Deleting a whole workspace still works: its memberships cascade away together with
--     the row that points at them.
--
-- Backfill: every existing workspace's creator is its admin member (checked read-only on the
-- shared database before writing this), so owner = created_by is exact. Should any creator
-- not be a member, adding the constraint fails and the whole migration rolls back, changing
-- nothing. From here on, ownership is read only from owner_id; created_by stays history.
--
-- orbit_app's table-level grants on orbit.workspaces already cover the new column.

ALTER TABLE orbit.workspaces ADD COLUMN owner_id uuid;

UPDATE orbit.workspaces SET owner_id = created_by;

ALTER TABLE orbit.workspaces
  ADD CONSTRAINT workspaces_owner_is_member
  FOREIGN KEY (owner_id, id) REFERENCES orbit.memberships (user_id, workspace_id)
  DEFERRABLE INITIALLY DEFERRED;
