-- What a person wants to be called in Orbit. It belongs to the person, not to any
-- workspace, and stays NULL until they tell us. Additive: existing code ignores it.
-- orbit_app's table-level grants on orbit.users already cover the new column.
ALTER TABLE orbit.users
  ADD COLUMN display_name text CHECK (display_name IS NULL OR char_length(display_name) BETWEEN 1 AND 80);
