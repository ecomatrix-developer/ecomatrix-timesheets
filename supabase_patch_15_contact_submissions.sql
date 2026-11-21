-- v3.0: stores every Contact Us submission (and every "Forgot Password?"
-- request) instead of only emailing them, per Abeer's 2026-11-21 request:
-- "save those data in some table so that super admins can see every old
-- user queries" + a notification bar on Super Admin/Admin surfacing them.
--
-- Purely additive — new table, no existing data touched.

CREATE TABLE IF NOT EXISTS contact_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  username text NOT NULL,
  name text NOT NULL,
  subject text NOT NULL,
  message text NOT NULL,
  -- 'contact_form' = the Contact Us page; 'password_reset' = the login
  -- page's "Forgot Password?" modal, routed into the same inbox so Super
  -- Admin has one place to see every query, not two.
  source text NOT NULL DEFAULT 'contact_form' CHECK (source IN ('contact_form', 'password_reset')),
  read_at timestamptz,
  read_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contact_submissions_created_at ON contact_submissions (created_at DESC);
-- Powers the notification bar's unread count without a full table scan.
CREATE INDEX IF NOT EXISTS idx_contact_submissions_unread ON contact_submissions (id) WHERE read_at IS NULL;

-- Verify afterward:
-- select count(*) from contact_submissions;
