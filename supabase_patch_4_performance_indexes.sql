-- Performance indexes for the hottest query patterns across the app
-- (dashboard, reports, insights, database_stats, projects, timesheet,
-- export routes all filter timesheet_entries/submitted_days by
-- employee_id and/or entry_date range; projects is filtered/sorted by
-- status, project_type, name).
--
-- Current table sizes (checked live via REST on 2026-11-12):
--   timesheet_entries ~6,695 rows, submitted_days ~2,358 rows,
--   projects 190 rows, users 16 rows.
-- At this size these queries are already fast in absolute terms — this
-- is about headroom as the tables grow, not a fix for a current
-- multi-second query.
--
-- NOT using CREATE INDEX CONCURRENTLY here: the Supabase SQL Editor runs
-- a pasted multi-statement query inside one transaction block, and
-- CONCURRENTLY is rejected inside a transaction (confirmed: that's the
-- exact error this produced). CONCURRENTLY only matters to avoid
-- blocking writes while a large table's index builds — at ~6,700 rows
-- max here, a plain CREATE INDEX takes milliseconds, so the brief write
-- lock is a non-issue. Safe to run this whole file in one go.

CREATE INDEX IF NOT EXISTS idx_timesheet_entries_entry_date
  ON timesheet_entries (entry_date);

CREATE INDEX IF NOT EXISTS idx_timesheet_entries_employee_date
  ON timesheet_entries (employee_id, entry_date);

CREATE INDEX IF NOT EXISTS idx_timesheet_entries_project_date
  ON timesheet_entries (project_id, entry_date)
  WHERE project_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_submitted_days_employee_date
  ON submitted_days (employee_id, entry_date);

CREATE INDEX IF NOT EXISTS idx_submitted_days_entry_date
  ON submitted_days (entry_date);

CREATE INDEX IF NOT EXISTS idx_projects_status
  ON projects (status);

CREATE INDEX IF NOT EXISTS idx_projects_project_type
  ON projects (project_type);

CREATE INDEX IF NOT EXISTS idx_projects_name
  ON projects (name);

-- Optional, only if you want faster *substring* search on the Projects/
-- Dashboard search box (client_name/name/project_number ILIKE '%term%').
-- Not needed at 190 rows — a plain index above can't help a leading-
-- wildcard ILIKE anyway, this is the only thing that would:
--   CREATE EXTENSION IF NOT EXISTS pg_trgm;
--   CREATE INDEX IF NOT EXISTS idx_projects_name_trgm
--     ON projects USING gin (name gin_trgm_ops);
--   CREATE INDEX IF NOT EXISTS idx_projects_client_name_trgm
--     ON projects USING gin (client_name gin_trgm_ops);

-- Verify afterward:
-- select tablename, indexname from pg_indexes where schemaname = 'public'
--   and tablename in ('timesheet_entries','submitted_days','projects')
--   order by tablename, indexname;
