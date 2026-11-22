-- Abeer, 2026-11-23: "cant you connect it to the real numbers so that it
-- will be generated likewise, not like a counter, because if some project
-- is deleted counter will be again increased so make it direct database
-- connect where it will check from there and no counter like fixed even
-- if project is deleted."
--
-- Context: supabase_patch_9/13's generate_eco_matrix_number() tracks the
-- next number in a separate project_number_counters table that only ever
-- increments — it never looks at which projects actually still exist, so
-- deleting every "26-NNN" project ever created (as happened here, while
-- testing: numbers 001 through 017 were all issued and every one of those
-- projects has since been deleted) leaves the counter sitting at 18
-- forever, even though zero real projects currently use any number at
-- all.
--
-- This replaces both functions with a live read of the projects table
-- itself: "next number" is always (the highest eco_matrix_number
-- currently in use this year) + 1. So:
--   - Right now, with no project using any number, the next one issued
--     is "26-001" again.
--   - If the single highest-numbered project is later deleted, the next
--     save automatically drops back down to reuse that number — no
--     manual reset ever needed again.
--   - A gap left by deleting a NON-highest number (e.g. deleting "26-007"
--     while "26-008" and up still exist) is NOT backfilled — only the
--     trailing end ever shrinks. Silently filling an arbitrary gap could
--     hand a project created in December a lower number than one made in
--     January, which would be more confusing than a permanent gap.
--
-- project_number_counters is no longer read or written by either
-- function below — left in place untouched (nothing reads it anymore,
-- nothing to migrate out of it).
--
-- Safety: an admin can still type a custom eco_matrix_number override
-- (createProjectsBulkAction's eco_matrix_number_override) that doesn't
-- match the "YY-NNN" pattern at all — the regex filter below ignores
-- anything that doesn't match exactly, so a one-off custom number can
-- never crash the cast or silently skew the real sequence.
--
-- Concurrency: wrapped in a per-year advisory lock (released
-- automatically at the end of the transaction) so two admins saving a
-- project in the same instant can't both compute the same "next" number
-- — matches the atomicity the old counter-table UPDATE used to give for
-- free.

CREATE OR REPLACE FUNCTION generate_eco_matrix_number() RETURNS text AS $$
DECLARE
  v_year int := extract(year from now())::int % 100;
  v_seq int;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('eco_matrix_number_' || v_year::text));

  SELECT COALESCE(MAX((split_part(eco_matrix_number, '-', 2))::int), 0) + 1
  INTO v_seq
  FROM projects
  WHERE eco_matrix_number ~ ('^' || lpad(v_year::text, 2, '0') || '-[0-9]+$');

  RETURN lpad(v_year::text, 2, '0') || '-' || lpad(v_seq::text, 3, '0');
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION peek_eco_matrix_number() RETURNS text AS $$
DECLARE
  v_year int := extract(year from now())::int % 100;
  v_seq int;
BEGIN
  SELECT COALESCE(MAX((split_part(eco_matrix_number, '-', 2))::int), 0) + 1
  INTO v_seq
  FROM projects
  WHERE eco_matrix_number ~ ('^' || lpad(v_year::text, 2, '0') || '-[0-9]+$');

  RETURN lpad(v_year::text, 2, '0') || '-' || lpad(v_seq::text, 3, '0');
END;
$$ LANGUAGE plpgsql STABLE;

-- Verify afterward:
-- select peek_eco_matrix_number();      -- should now be "26-001" (nothing currently uses any number)
-- select generate_eco_matrix_number();  -- run twice, confirm it matches the peek then increments by 1
