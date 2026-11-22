-- Full indexing pass across the whole schema (Abeer, 2026-11-22: "give me
-- complete indexing acorss each tables and data so that complete
-- applicaiton will be perfect").
--
-- Most of the schema was already indexed deliberately as each feature was
-- built — see the existing patch files for what's already in place:
--   patch_4  -> timesheet_entries (entry_date; employee_id+entry_date;
--               project_id+entry_date), submitted_days (employee_id+
--               entry_date; entry_date), projects (status; project_type;
--               name)
--   patch_6  -> ai_knowledge_chunks (hnsw vector index), ai_chat_messages
--               (admin_user_id+created_at)
--   patch_8  -> employee_documents (employee_id+created_at),
--               employee_document_downloads (document_id)
--   patch_9  -> clients (short_code, unique), projects.eco_matrix_number
--               (unique), project_scopes/billing_groups/tasks (unique
--               constraints that also serve as indexes), project_status_
--               audit (project_id+changed_at)
--   patch_10 -> leave_requests (employee_id+created_at; status+created_at)
--   patch_15 -> contact_submissions (created_at; partial index on unread)
--   patch_18 -> contact_submission_messages (submission_id),
--               leave_request_messages (request_id)
--
-- This file fills the 3 real remaining gaps found by reading every query
-- in the app against every table — not padding every foreign key with a
-- speculative index "just in case": an index that the query planner will
-- never use just slows down every INSERT/UPDATE on that table for
-- nothing, which works against the goal here, not toward it.
--
-- Run this once in the Supabase SQL Editor.

-- 1. users.username — every single login does `.eq("username", ...)`.
--    If `username` already has a UNIQUE constraint from the original
--    schema (very likely, since login must resolve to exactly one row),
--    Postgres already backs that with an index and this is a harmless,
--    skipped no-op. If it doesn't, this is the single highest-value index
--    in the whole app — it's on the critical path of every page load for
--    every user (session checks resolve through it indirectly via the
--    login flow).
CREATE INDEX IF NOT EXISTS idx_users_username ON users (username);

-- 2. contact_submissions.user_id — getContactSubmissionsForUser() (the
--    employee's own "Your Past Messages" list on /contact) filters by
--    user_id and sorts by created_at DESC on every page load; the
--    existing patch_15 indexes only covered the admin-side created_at/
--    unread queries, not this one.
CREATE INDEX IF NOT EXISTS idx_contact_submissions_user
  ON contact_submissions (user_id, created_at DESC);

-- 3. submitted_weeks.employee_id — read by deleteEmployeeAction's cascade
--    cleanup and counted on Database Stats. Empty today, but free to add
--    now rather than forgetting it once it isn't.
CREATE INDEX IF NOT EXISTS idx_submitted_weeks_employee
  ON submitted_weeks (employee_id);

-- Verify afterward:
-- select tablename, indexname from pg_indexes where schemaname = 'public'
--   and tablename in ('users', 'contact_submissions', 'submitted_weeks')
--   order by tablename, indexname;
