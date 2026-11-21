-- v3.0 project-creation redesign: adds a per-project Billable/Non-billable
-- flag, and a READ-ONLY preview of the next ECO Matrix number so the new
-- horizontal create-project form can show "27-001" live as the admin
-- types, without consuming a real number until the project is actually
-- saved (generate_eco_matrix_number(), from supabase_patch_9, still does
-- the real atomic allocation at save time — this function never calls it
-- and never writes to project_number_counters).
--
-- Purely additive, same as patch_9: new column is nullable-safe (NOT NULL
-- with a DEFAULT, so every existing row gets `true` automatically, no
-- backfill step needed), new function is new. Depends on
-- supabase_patch_9_projects_and_taxonomy.sql having been run first (needs
-- the `project_number_counters` table) — run that one first if you
-- haven't already.

ALTER TABLE projects ADD COLUMN IF NOT EXISTS billable boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION peek_eco_matrix_number() RETURNS text AS $$
DECLARE
  v_year int := extract(year from now())::int % 100;
  v_seq int;
BEGIN
  SELECT next_number INTO v_seq FROM project_number_counters WHERE year = v_year;
  IF v_seq IS NULL THEN
    v_seq := 1;
  END IF;
  RETURN lpad(v_year::text, 2, '0') || '-' || lpad(v_seq::text, 3, '0');
END;
$$ LANGUAGE plpgsql STABLE;

-- Verify afterward:
-- select billable from projects limit 1;
-- select peek_eco_matrix_number();          -- run twice, confirm it does NOT change
-- select generate_eco_matrix_number();       -- confirm this one still increments
