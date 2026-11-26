-- Leave Portal v2 (Abeer, 2026-11-26): half/full-day requests with real
-- day-counting math, plus a per-employee, per-financial-year leave
-- balance a Super Admin assigns (annual/earned total, sick total, and the
-- period's start/end date). Builds on supabase_patch_10_leave_requests.sql
-- — purely additive, safe to run any time.

-- 1. leave_requests: add day_type + a STORED days_count (not re-derived
--    from dates at read time — see the comment on LeaveRequest.days_count
--    in types.ts for why).
ALTER TABLE leave_requests
  ADD COLUMN IF NOT EXISTS day_type text NOT NULL DEFAULT 'full'
    CHECK (day_type IN ('full', 'half')),
  ADD COLUMN IF NOT EXISTS days_count numeric(5,1) NOT NULL DEFAULT 1;

-- A half-day request only ever makes sense for a single date.
ALTER TABLE leave_requests
  DROP CONSTRAINT IF EXISTS leave_requests_half_day_single_date;
ALTER TABLE leave_requests
  ADD CONSTRAINT leave_requests_half_day_single_date
    CHECK (day_type <> 'half' OR start_date = end_date);

-- Backfill days_count for every row inserted before this patch (full-day,
-- inclusive calendar-day count between start_date and end_date).
UPDATE leave_requests
SET days_count = (end_date - start_date) + 1
WHERE day_type = 'full';

-- 2. leave_balances: one row per employee per financial-year period.
CREATE TABLE IF NOT EXISTS leave_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  financial_year text NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  annual_total numeric(5,1) NOT NULL DEFAULT 13,
  sick_total numeric(5,1) NOT NULL DEFAULT 8,
  created_by uuid REFERENCES users(id),
  updated_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT leave_balances_period_valid CHECK (period_end > period_start),
  CONSTRAINT leave_balances_employee_year_unique UNIQUE (employee_id, financial_year)
);

CREATE INDEX IF NOT EXISTS idx_leave_balances_employee_period
  ON leave_balances (employee_id, period_start, period_end);

-- Verify afterward:
-- select column_name from information_schema.columns where table_name = 'leave_requests' and column_name in ('day_type','days_count');
-- select table_name from information_schema.tables where table_name = 'leave_balances';
