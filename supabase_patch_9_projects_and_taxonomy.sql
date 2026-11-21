-- v3.0 sections 3 & 4: project numbering, clients, scopes, and the
-- billing-group/task taxonomy that drives the timesheet comment dropdown.
--
-- Checked live against the real projects table first (190 rows) before
-- writing this: project_number is messy (dashes/underscores/spaces mixed,
-- 11 groups of duplicates, only 3/190 already match the YY-NNN format),
-- so a blanket UNIQUE constraint on it would fail outright. This migration
-- does NOT touch project_number at all — existing projects keep their
-- numbers exactly as today (brief's own instruction). The new
-- eco_matrix_number column is added separately, nullable, UNIQUE where
-- set — existing rows stay NULL (Postgres allows multiple NULLs in a
-- unique column), only NEW projects ever get one, generated server-side,
-- never typed.
--
-- Also checked: client_name on the live table already holds exactly 13
-- distinct short-code-like values (RCO, ENF, SMS, HGS, SED, TLD, HKS,
-- CBK, 000, EE, ECO Matrix, APC, ECOM) — so clients can be seeded
-- directly from it and existing projects linked by an exact match, no
-- fuzzy matching needed.
--
-- Purely additive: new columns are nullable, new tables are new. Safe to
-- run in one go.

-- ============================================================
-- 1. Clients
-- ============================================================
CREATE TABLE IF NOT EXISTS clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  short_code text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_short_code_unique ON clients (lower(short_code));

-- Seed from the live data's existing client_name values — these already
-- function as short codes today.
INSERT INTO clients (name, short_code)
SELECT DISTINCT trim(client_name), trim(client_name)
FROM projects
WHERE client_name IS NOT NULL AND trim(client_name) <> ''
ON CONFLICT DO NOTHING;

ALTER TABLE projects ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES clients(id);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS client_project_number text;

-- Safe, exact-match backfill (not fuzzy) — every existing project's
-- client_name already equals some client's short_code from the seed
-- above, so this links all 190 rows deterministically.
UPDATE projects p SET client_id = c.id
FROM clients c
WHERE p.client_id IS NULL AND lower(trim(p.client_name)) = lower(c.short_code);

-- ============================================================
-- 2. System-generated ECO Matrix number (YY-NNN, one sequence per year)
-- ============================================================
ALTER TABLE projects ADD COLUMN IF NOT EXISTS eco_matrix_number text;
CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_eco_matrix_number_unique
  ON projects (eco_matrix_number) WHERE eco_matrix_number IS NOT NULL;

CREATE TABLE IF NOT EXISTS project_number_counters (
  year int PRIMARY KEY,
  next_number int NOT NULL DEFAULT 1
);

-- If Anup's master Excel has a real last-used number for the current
-- year, update this row's next_number to (that number + 1) yourself
-- before anyone creates a project through the new flow — this migration
-- can't know that number, it's only in the spreadsheet.
INSERT INTO project_number_counters (year, next_number)
VALUES (extract(year from now())::int % 100, 1)
ON CONFLICT (year) DO NOTHING;

-- Atomic, race-safe: two admins creating a project at the same instant
-- still can't get the same number — the INSERT...ON CONFLICT...DO UPDATE
-- serializes on the row lock for that year.
CREATE OR REPLACE FUNCTION generate_eco_matrix_number() RETURNS text AS $$
DECLARE
  v_year int := extract(year from now())::int % 100;
  v_seq int;
BEGIN
  INSERT INTO project_number_counters (year, next_number)
  VALUES (v_year, 1)
  ON CONFLICT (year) DO UPDATE SET next_number = project_number_counters.next_number + 1
  RETURNING next_number INTO v_seq;

  RETURN lpad(v_year::text, 2, '0') || '-' || lpad(v_seq::text, 3, '0');
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 3. Project scopes (Energy / BIM-CADD / Shop Drawings / Marketing & BD)
-- ============================================================
CREATE TABLE IF NOT EXISTS project_scopes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO project_scopes (name) VALUES
  ('Energy'), ('BIM/CADD'), ('Shop Drawings'), ('Marketing & BD')
ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS project_scope_links (
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  scope_id uuid NOT NULL REFERENCES project_scopes(id),
  PRIMARY KEY (project_id, scope_id)
);

-- Backfill every existing project's scope from its current project_type
-- (a clean, confident mapping — only two project_type values exist on
-- the live table and they map 1:1). This is what keeps the timesheet
-- comment dropdown populated for all 190 existing projects instead of
-- going empty until someone manually assigns scopes.
INSERT INTO project_scope_links (project_id, scope_id)
SELECT p.id, s.id
FROM projects p
JOIN project_scopes s
  ON (p.project_type = 'Energy Modelling' AND s.name = 'Energy')
  OR (p.project_type = 'BIM and AutoCad' AND s.name = 'BIM/CADD')
ON CONFLICT DO NOTHING;

-- ============================================================
-- 4. Billing groups and tasks (brief section 4's exact taxonomy, with
--    "Thermal Template" already renamed to "Thermal setup" per the
--    brief's own embedded review comment)
-- ============================================================
CREATE TABLE IF NOT EXISTS billing_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  billable boolean NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO billing_groups (name, billable) VALUES
  ('Energy', true),
  ('Revit', true),
  ('CAD', true),
  ('Shop Drawings', true),
  ('Marketing & BD', false)
ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS scope_billing_groups (
  scope_id uuid NOT NULL REFERENCES project_scopes(id),
  billing_group_id uuid NOT NULL REFERENCES billing_groups(id),
  PRIMARY KEY (scope_id, billing_group_id)
);

INSERT INTO scope_billing_groups (scope_id, billing_group_id)
SELECT s.id, g.id FROM project_scopes s, billing_groups g WHERE
  (s.name = 'Energy' AND g.name = 'Energy') OR
  (s.name = 'BIM/CADD' AND g.name = 'Revit') OR
  (s.name = 'BIM/CADD' AND g.name = 'CAD') OR
  (s.name = 'Shop Drawings' AND g.name = 'Shop Drawings') OR
  (s.name = 'Marketing & BD' AND g.name = 'Marketing & BD')
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  billing_group_id uuid NOT NULL REFERENCES billing_groups(id),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (billing_group_id, name)
);

INSERT INTO tasks (name, billing_group_id)
SELECT t.name, g.id FROM billing_groups g
JOIN (VALUES
  ('Energy', 'Geometry'),
  ('Energy', 'Thermal setup'),
  ('Energy', 'HVAC'),
  ('Energy', 'Simulation & QA/QC'),
  ('Energy', 'Reporting'),
  ('Energy', 'Review'),
  ('Energy', 'Coordination & meetings'),
  ('Energy', 'Other'),
  ('Revit', 'Revit modeling'),
  ('Revit', 'Revit review'),
  ('Revit', 'Revit Coordination & meetings'),
  ('Revit', 'Other'),
  ('CAD', 'CAD drafting'),
  ('CAD', 'CAD review'),
  ('CAD', 'CAD Coordination & meetings'),
  ('CAD', 'Other'),
  ('Shop Drawings', 'Shop drawings'),
  ('Shop Drawings', 'Shop drawing review'),
  ('Marketing & BD', 'Content writing'),
  ('Marketing & BD', 'LinkedIn marketing'),
  ('Marketing & BD', 'SEO'),
  ('Marketing & BD', 'Email marketing'),
  ('Marketing & BD', 'Website'),
  ('Marketing & BD', 'Client outreach'),
  ('Marketing & BD', 'Proposals'),
  ('Marketing & BD', 'Other')
) AS t(group_name, name) ON t.group_name = g.name
ON CONFLICT DO NOTHING;

-- One internal pseudo-project for Marketing & BD, exactly as the brief
-- describes ("logged against an internal project like any other, so the
-- 7.75h rule and reports work the same way"). Only created if it doesn't
-- already exist (matched by name).
INSERT INTO projects (project_number, client_name, name, description, status, project_type)
SELECT NULL, 'ECO Matrix', 'Marketing & BD', 'Internal non-project work (content, SEO, outreach, proposals).', 'active', 'BIM and AutoCad'
WHERE NOT EXISTS (SELECT 1 FROM projects WHERE name = 'Marketing & BD');

INSERT INTO project_scope_links (project_id, scope_id)
SELECT p.id, s.id FROM projects p, project_scopes s
WHERE p.name = 'Marketing & BD' AND s.name = 'Marketing & BD'
ON CONFLICT DO NOTHING;

-- ============================================================
-- 5. Project status change audit log (who changed status, when).
--    Written from the app on each status change (needs session.userId,
--    which a DB trigger can't see), not a trigger.
-- ============================================================
CREATE TABLE IF NOT EXISTS project_status_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  old_status text,
  new_status text NOT NULL,
  changed_by uuid REFERENCES users(id),
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_project_status_audit_project
  ON project_status_audit (project_id, changed_at DESC);

-- Verify afterward:
-- select count(*) from clients;
-- select count(*) from projects where client_id is not null;
-- select count(*) from project_scope_links;
-- select count(*) from tasks;
-- select generate_eco_matrix_number(); -- try it twice, confirm it increments
-- select name from projects where name = 'Marketing & BD';
