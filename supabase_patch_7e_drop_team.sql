-- Removes the `team` column entirely — Abeer confirmed the org doesn't
-- segregate by team, so Admin is a flat tier with no team scoping at all.
-- Safe to drop: no real user has it set (all NULL after patch_7c), and
-- the app code no longer reads or writes it.

ALTER TABLE users DROP COLUMN IF EXISTS team;

-- Verify afterward:
-- select column_name from information_schema.columns
--   where table_name = 'users' and column_name = 'team';
-- (expect zero rows)
