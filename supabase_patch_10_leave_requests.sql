-- Leave portal, MVP scope per Abeer's go-ahead: an employee submits a
-- request, an Admin or Super Admin approves or rejects it. No leave-balance
-- tracking yet (deliberately out of scope for this pass — needs a policy
-- defined first: how many days per type, accrual/reset rules, etc.).
--
-- Purely additive: one new table, references users(id) only. Nothing here
-- touches users/projects/timesheet_entries/employee_documents. Safe to run
-- any time, independent of every other patch_7/8/9 file.

CREATE TABLE IF NOT EXISTS leave_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  start_date date NOT NULL,
  end_date date NOT NULL,
  leave_type text NOT NULL DEFAULT 'other' CHECK (leave_type IN (
    'sick', 'casual', 'annual', 'unpaid', 'other'
  )),
  reason text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  decided_by uuid REFERENCES users(id),
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT leave_requests_dates_valid CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_leave_requests_employee
  ON leave_requests (employee_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_leave_requests_status
  ON leave_requests (status, created_at DESC);

-- Verify afterward:
-- select table_name from information_schema.tables where table_name = 'leave_requests';
