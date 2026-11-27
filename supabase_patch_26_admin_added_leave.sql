-- Abeer, 2026-11-27: "figure out a way to hard code a half day or full
-- day leave for any employee for the ones formal request is not
-- received. Ex - late coming for 3 days in a month, or any other
-- scenario." — Super Admin can now add an already-approved leave entry
-- directly for any employee (no pending step, since there's no employee
-- request to approve). This column is the only way the app tells those
-- entries apart from a normal employee-submitted request everywhere they
-- show up (My Requests, All Requests, the Leave Calendar).
--
-- Purely additive. Safe to run any time.
ALTER TABLE leave_requests
  ADD COLUMN IF NOT EXISTS added_by_admin boolean NOT NULL DEFAULT false;

-- Verify afterward:
-- select column_name, data_type, column_default from information_schema.columns where table_name = 'leave_requests' and column_name = 'added_by_admin';
