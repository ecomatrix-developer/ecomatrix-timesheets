-- v3.0: project-number sequence correction only. (Earlier draft of this
-- file also split "BIM" into separate Revit/CAD scopes — Abeer reverted
-- that 2026-11-21: "Bim single like revit, cad type i dont want that make
-- it normally bim and not seperate." BIM stays the single, original
-- "BIM/CADD" scope from supabase_patch_9, unchanged — nothing to run for
-- that part.)
--
-- One-time data correction: an earlier bug in the create form's number
-- field meant every project saved so far sent its previewed number back
-- as a manual override, so project_number_counters never actually
-- advanced past 1 even though "26-001" is already in use. Left as-is, the
-- next real save would try to generate "26-001" again and fail on the
-- unique constraint. This advances the counter past every eco_matrix_
-- number already issued this year, exactly once, safe to re-run (it's a
-- MAX, not a blind increment).
UPDATE project_number_counters c
SET next_number = GREATEST(
  c.next_number,
  COALESCE(
    (
      SELECT MAX((split_part(p.eco_matrix_number, '-', 2))::int) + 1
      FROM projects p
      WHERE p.eco_matrix_number LIKE lpad(c.year::text, 2, '0') || '-%'
    ),
    c.next_number
  )
);

-- Fixes a genuine off-by-one in supabase_patch_9's generate_eco_matrix_
-- number(): that version always increments the counter BEFORE returning
-- it, but patch_9 also pre-seeds the counter row at next_number=1 — so
-- the very first real auto-generated number for a year could never
-- actually be "-001", it always skipped straight to "-002" and onward.
-- This version increments the row but RETURNS the pre-increment value —
-- matching peek_eco_matrix_number()'s own (already correct) semantics of
-- "next_number is the next number to ISSUE, not the last one issued".
CREATE OR REPLACE FUNCTION generate_eco_matrix_number() RETURNS text AS $$
DECLARE
  v_year int := extract(year from now())::int % 100;
  v_seq int;
BEGIN
  INSERT INTO project_number_counters (year, next_number)
  VALUES (v_year, 1)
  ON CONFLICT (year) DO NOTHING;

  UPDATE project_number_counters
  SET next_number = next_number + 1
  WHERE year = v_year
  RETURNING next_number - 1 INTO v_seq;

  RETURN lpad(v_year::text, 2, '0') || '-' || lpad(v_seq::text, 3, '0');
END;
$$ LANGUAGE plpgsql;

-- Verify afterward:
-- select peek_eco_matrix_number();      -- should be ONE PAST the highest "26-NNN" already in use
-- select generate_eco_matrix_number();  -- run twice, confirm it matches the peek then increments by 1
