-- Lets Admin/Super Admin reply to a Contact Us / password-reset submission
-- from the Inbox (/contact_submissions), and lets the employee who sent it
-- see that reply on their own Contact Us page. Additive only — safe to run
-- even if supabase_patch_15_contact_submissions.sql already has data in it.
--
-- Run this once in the Supabase SQL Editor.

ALTER TABLE contact_submissions
  ADD COLUMN IF NOT EXISTS reply_message text,
  ADD COLUMN IF NOT EXISTS replied_at timestamptz,
  ADD COLUMN IF NOT EXISTS replied_by uuid REFERENCES users(id);

-- Verify afterward:
-- select column_name from information_schema.columns
--   where table_name = 'contact_submissions'
--   and column_name in ('reply_message', 'replied_at', 'replied_by');
