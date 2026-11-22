-- Same reply format as supabase_patch_16 (Contact Us), applied to Leave
-- requests too (Abeer, 2026-11-22: "reply format enabled for leaves as
-- well make that work too"). This is separate from decision_note (the
-- reason attached when a Super Admin approves/rejects) — reply_message is
-- a free-form note a Super Admin can add any time, decided or not, e.g.
-- to ask a clarifying question before deciding. Additive only — safe to
-- run even if supabase_patch_10_leave_requests.sql already has data.
--
-- Run this once in the Supabase SQL Editor.

ALTER TABLE leave_requests
  ADD COLUMN IF NOT EXISTS reply_message text,
  ADD COLUMN IF NOT EXISTS replied_at timestamptz,
  ADD COLUMN IF NOT EXISTS replied_by uuid REFERENCES users(id);

-- Verify afterward:
-- select column_name from information_schema.columns
--   where table_name = 'leave_requests'
--   and column_name in ('reply_message', 'replied_at', 'replied_by');
