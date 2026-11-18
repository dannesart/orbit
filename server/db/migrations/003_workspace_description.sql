-- "What's this place for?": an optional thought someone gives their workspace.
-- NULL until someone adds one; clearing it sets it back to NULL. Additive: existing code
-- ignores it. orbit_app's table-level grants on orbit.workspaces already cover the column.
ALTER TABLE orbit.workspaces
  ADD COLUMN description text CHECK (description IS NULL OR char_length(description) BETWEEN 1 AND 280);
