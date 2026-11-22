-- Upgrades the single admin-reply field from patch_16/17 into a real
-- two-way thread (Abeer, 2026-11-22: "if user want he can reply there as
-- well to the same thread so make that enable for leaves as well as
-- contact us") — both the submitter/employee and the admin side can keep
-- adding messages to the same conversation, not just one reply each.
--
-- Additive only, and backfills whatever was already saved in
-- reply_message (from patch_16/17) as the thread's first message, so no
-- existing reply is lost. Those old reply_message/replied_at/replied_by
-- columns are left in place (unused by the app going forward) rather than
-- dropped, since dropping columns is destructive and this works fine
-- without touching them.
--
-- Run this once in the Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS contact_submission_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES contact_submissions(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES users(id),
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contact_submission_messages_submission
  ON contact_submission_messages (submission_id, created_at);

CREATE TABLE IF NOT EXISTS leave_request_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES leave_requests(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES users(id),
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_leave_request_messages_request
  ON leave_request_messages (request_id, created_at);

-- One-time backfill: carry over whatever single reply already exists so
-- it shows up as the first message in its thread instead of disappearing.
INSERT INTO contact_submission_messages (submission_id, sender_id, message, created_at)
SELECT id, replied_by, reply_message, replied_at
FROM contact_submissions
WHERE reply_message IS NOT NULL AND replied_by IS NOT NULL;

INSERT INTO leave_request_messages (request_id, sender_id, message, created_at)
SELECT id, replied_by, reply_message, replied_at
FROM leave_requests
WHERE reply_message IS NOT NULL AND replied_by IS NOT NULL;

-- Verify afterward:
-- select table_name from information_schema.tables
--   where table_name in ('contact_submission_messages', 'leave_request_messages');
-- select count(*) from contact_submission_messages;
-- select count(*) from leave_request_messages;
