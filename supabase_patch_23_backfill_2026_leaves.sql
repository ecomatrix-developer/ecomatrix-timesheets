-- Historical leave backfill (Abeer, 2026-11-26): "analyse this sheet ... tell
-- me the correct numbers of sick/annual of each member ... so that i can
-- backfill them in the grid and in the proper calculations." Source: the
-- company's Timesheets.xlsx attendance/leave sheet (Dec 2025 - Dec 2026),
-- specifically its "leaves are in days" monthly summary table, which is
-- the only part of that sheet whose numbers tie out to its own SUM
-- formulas. The sheet's separate day-by-day A/S/H attendance grid was
-- checked against it and does NOT reconcile (verified, e.g. Abhijeet
-- shows 3 'A' markers in September 2026 but the official monthly total is
-- 1), so specific leave dates are not reconstructable from this sheet --
-- each row below is a single bulk entry anchored on the 1st of the month
-- it covers, carrying that month's real total day count. The calendar
-- view will show it on that date; the reason/decision_note says plainly
-- that it's a historical aggregate, not a real single-day request.
--
-- Run ONCE. Safe to re-run: every insert is guarded by a NOT EXISTS check
-- keyed on employee + leave_type + the anchor date, so running this twice
-- does not double-count anyone's balance.

-- 1. Leave balances for the two financial years this sheet's data falls
--    in (the app's FY is Apr 1 - Mar 31; this sheet runs Dec-Dec) --
--    default policy (13 annual/earned, 8 sick) for everyone who has any
--    backfilled usage. Super Admin can still re-assign these individually
--    from Manage Roles or the Leave page afterward.
INSERT INTO leave_balances (employee_id, financial_year, period_start, period_end, annual_total, sick_total)
SELECT v.employee_id, v.financial_year, v.period_start, v.period_end, 13, 8
FROM (VALUES
  ('33746384-c35e-4060-ab1f-d207dd1e6655'::uuid, '2025-26', '2025-04-01'::date, '2026-03-31'::date), -- Soniya
  ('47eec1a0-a07b-46ae-a791-c5e9554889f4'::uuid, '2025-26', '2025-04-01'::date, '2026-03-31'::date), -- Abhijeet
  ('58cb67e1-e3f0-41d9-9db7-9f8012fb4e80'::uuid, '2025-26', '2025-04-01'::date, '2026-03-31'::date), -- Umesh
  ('7ea306df-e398-4fad-9854-62657b45974c'::uuid, '2025-26', '2025-04-01'::date, '2026-03-31'::date), -- Farhan
  ('df71745e-42b4-46a7-bae3-a2e741680ac7'::uuid, '2025-26', '2025-04-01'::date, '2026-03-31'::date), -- Kaustubh
  ('20bbc809-2e2b-460c-8e67-e053d41ea2d6'::uuid, '2026-27', '2026-04-01'::date, '2027-03-31'::date), -- Vaibhav
  ('33746384-c35e-4060-ab1f-d207dd1e6655'::uuid, '2026-27', '2026-04-01'::date, '2027-03-31'::date), -- Soniya
  ('47eec1a0-a07b-46ae-a791-c5e9554889f4'::uuid, '2026-27', '2026-04-01'::date, '2027-03-31'::date), -- Abhijeet
  ('58cb67e1-e3f0-41d9-9db7-9f8012fb4e80'::uuid, '2026-27', '2026-04-01'::date, '2027-03-31'::date), -- Umesh
  ('66d26840-4242-403c-b853-e14f8e34c067'::uuid, '2026-27', '2026-04-01'::date, '2027-03-31'::date), -- Mahesh
  ('7ea306df-e398-4fad-9854-62657b45974c'::uuid, '2026-27', '2026-04-01'::date, '2027-03-31'::date), -- Farhan
  ('d0540bb5-22d3-49fc-8b8a-e135fc506e2c'::uuid, '2026-27', '2026-04-01'::date, '2027-03-31'::date), -- Puja
  ('df71745e-42b4-46a7-bae3-a2e741680ac7'::uuid, '2026-27', '2026-04-01'::date, '2027-03-31'::date) -- Kaustubh
) AS v(employee_id, financial_year, period_start, period_end)
WHERE NOT EXISTS (
  SELECT 1 FROM leave_balances lb
  WHERE lb.employee_id = v.employee_id AND lb.financial_year = v.financial_year
);

-- 2. Backfilled leave usage, one row per employee/month/leave-type that
--    had a nonzero value in the sheet.
INSERT INTO leave_requests (employee_id, start_date, end_date, leave_type, day_type, days_count, status, reason, decision_note, decided_at)
SELECT v.employee_id, v.anchor_date, v.anchor_date, v.leave_type, 'full', v.days, 'approved', v.reason, 'Historical backfill imported 2026-11-26 from the company attendance/leave sheet.', now()
FROM (VALUES
  ('47eec1a0-a07b-46ae-a791-c5e9554889f4'::uuid, '2026-02-01'::date, 'annual', 1, 'Historical backfill: 1 day(s) of annual leave used in February 2026, imported from the company attendance sheet (exact date within the month not recorded).'), -- Abhijeet
  ('47eec1a0-a07b-46ae-a791-c5e9554889f4'::uuid, '2026-02-01'::date, 'sick', 1, 'Historical backfill: 1 day(s) of sick leave used in February 2026, imported from the company attendance sheet (exact date within the month not recorded).'), -- Abhijeet
  ('47eec1a0-a07b-46ae-a791-c5e9554889f4'::uuid, '2026-03-01'::date, 'annual', 4, 'Historical backfill: 4 day(s) of annual leave used in March 2026, imported from the company attendance sheet (exact date within the month not recorded).'), -- Abhijeet
  ('47eec1a0-a07b-46ae-a791-c5e9554889f4'::uuid, '2026-07-01'::date, 'annual', 3, 'Historical backfill: 3 day(s) of annual leave used in July 2026, imported from the company attendance sheet (exact date within the month not recorded).'), -- Abhijeet
  ('47eec1a0-a07b-46ae-a791-c5e9554889f4'::uuid, '2026-09-01'::date, 'annual', 1, 'Historical backfill: 1 day(s) of annual leave used in September 2026, imported from the company attendance sheet (exact date within the month not recorded).'), -- Abhijeet
  ('7ea306df-e398-4fad-9854-62657b45974c'::uuid, '2025-12-01'::date, 'annual', 4, 'Historical backfill: 4 day(s) of annual leave used in December 2025, imported from the company attendance sheet (exact date within the month not recorded).'), -- Farhan
  ('7ea306df-e398-4fad-9854-62657b45974c'::uuid, '2025-12-01'::date, 'sick', 2, 'Historical backfill: 2 day(s) of sick leave used in December 2025, imported from the company attendance sheet (exact date within the month not recorded).'), -- Farhan
  ('7ea306df-e398-4fad-9854-62657b45974c'::uuid, '2026-01-01'::date, 'annual', 1, 'Historical backfill: 1 day(s) of annual leave used in January 2026, imported from the company attendance sheet (exact date within the month not recorded).'), -- Farhan
  ('7ea306df-e398-4fad-9854-62657b45974c'::uuid, '2026-02-01'::date, 'sick', 1, 'Historical backfill: 1 day(s) of sick leave used in February 2026, imported from the company attendance sheet (exact date within the month not recorded).'), -- Farhan
  ('7ea306df-e398-4fad-9854-62657b45974c'::uuid, '2026-03-01'::date, 'annual', 2, 'Historical backfill: 2 day(s) of annual leave used in March 2026, imported from the company attendance sheet (exact date within the month not recorded).'), -- Farhan
  ('7ea306df-e398-4fad-9854-62657b45974c'::uuid, '2026-03-01'::date, 'sick', 1, 'Historical backfill: 1 day(s) of sick leave used in March 2026, imported from the company attendance sheet (exact date within the month not recorded).'), -- Farhan
  ('7ea306df-e398-4fad-9854-62657b45974c'::uuid, '2026-04-01'::date, 'annual', 4, 'Historical backfill: 4 day(s) of annual leave used in April 2026, imported from the company attendance sheet (exact date within the month not recorded).'), -- Farhan
  ('7ea306df-e398-4fad-9854-62657b45974c'::uuid, '2026-06-01'::date, 'sick', 1.5, 'Historical backfill: 1.5 day(s) of sick leave used in June 2026, imported from the company attendance sheet (exact date within the month not recorded).'), -- Farhan
  ('7ea306df-e398-4fad-9854-62657b45974c'::uuid, '2026-08-01'::date, 'sick', 1, 'Historical backfill: 1 day(s) of sick leave used in August 2026, imported from the company attendance sheet (exact date within the month not recorded).'), -- Farhan
  ('7ea306df-e398-4fad-9854-62657b45974c'::uuid, '2026-09-01'::date, 'sick', 1, 'Historical backfill: 1 day(s) of sick leave used in September 2026, imported from the company attendance sheet (exact date within the month not recorded).'), -- Farhan
  ('df71745e-42b4-46a7-bae3-a2e741680ac7'::uuid, '2025-12-01'::date, 'annual', 4, 'Historical backfill: 4 day(s) of annual leave used in December 2025, imported from the company attendance sheet (exact date within the month not recorded).'), -- Kaustubh
  ('df71745e-42b4-46a7-bae3-a2e741680ac7'::uuid, '2026-01-01'::date, 'sick', 1, 'Historical backfill: 1 day(s) of sick leave used in January 2026, imported from the company attendance sheet (exact date within the month not recorded).'), -- Kaustubh
  ('df71745e-42b4-46a7-bae3-a2e741680ac7'::uuid, '2026-02-01'::date, 'annual', 2, 'Historical backfill: 2 day(s) of annual leave used in February 2026, imported from the company attendance sheet (exact date within the month not recorded).'), -- Kaustubh
  ('df71745e-42b4-46a7-bae3-a2e741680ac7'::uuid, '2026-04-01'::date, 'annual', 2, 'Historical backfill: 2 day(s) of annual leave used in April 2026, imported from the company attendance sheet (exact date within the month not recorded).'), -- Kaustubh
  ('df71745e-42b4-46a7-bae3-a2e741680ac7'::uuid, '2026-06-01'::date, 'sick', 1, 'Historical backfill: 1 day(s) of sick leave used in June 2026, imported from the company attendance sheet (exact date within the month not recorded).'), -- Kaustubh
  ('df71745e-42b4-46a7-bae3-a2e741680ac7'::uuid, '2026-08-01'::date, 'sick', 1, 'Historical backfill: 1 day(s) of sick leave used in August 2026, imported from the company attendance sheet (exact date within the month not recorded).'), -- Kaustubh
  ('df71745e-42b4-46a7-bae3-a2e741680ac7'::uuid, '2026-09-01'::date, 'sick', 1, 'Historical backfill: 1 day(s) of sick leave used in September 2026, imported from the company attendance sheet (exact date within the month not recorded).'), -- Kaustubh
  ('66d26840-4242-403c-b853-e14f8e34c067'::uuid, '2026-07-01'::date, 'annual', 1, 'Historical backfill: 1 day(s) of annual leave used in July 2026, imported from the company attendance sheet (exact date within the month not recorded).'), -- Mahesh
  ('d0540bb5-22d3-49fc-8b8a-e135fc506e2c'::uuid, '2026-10-01'::date, 'annual', 1, 'Historical backfill: 1 day(s) of annual leave used in October 2026, imported from the company attendance sheet (exact date within the month not recorded).'), -- Puja
  ('33746384-c35e-4060-ab1f-d207dd1e6655'::uuid, '2025-12-01'::date, 'annual', 4, 'Historical backfill: 4 day(s) of annual leave used in December 2025, imported from the company attendance sheet (exact date within the month not recorded).'), -- Soniya
  ('33746384-c35e-4060-ab1f-d207dd1e6655'::uuid, '2026-01-01'::date, 'annual', 0.25, 'Historical backfill: 0.25 day(s) of annual leave used in January 2026, imported from the company attendance sheet (exact date within the month not recorded).'), -- Soniya
  ('33746384-c35e-4060-ab1f-d207dd1e6655'::uuid, '2026-02-01'::date, 'annual', 1, 'Historical backfill: 1 day(s) of annual leave used in February 2026, imported from the company attendance sheet (exact date within the month not recorded).'), -- Soniya
  ('33746384-c35e-4060-ab1f-d207dd1e6655'::uuid, '2026-03-01'::date, 'annual', 3, 'Historical backfill: 3 day(s) of annual leave used in March 2026, imported from the company attendance sheet (exact date within the month not recorded).'), -- Soniya
  ('33746384-c35e-4060-ab1f-d207dd1e6655'::uuid, '2026-06-01'::date, 'sick', 1, 'Historical backfill: 1 day(s) of sick leave used in June 2026, imported from the company attendance sheet (exact date within the month not recorded).'), -- Soniya
  ('33746384-c35e-4060-ab1f-d207dd1e6655'::uuid, '2026-07-01'::date, 'sick', 1, 'Historical backfill: 1 day(s) of sick leave used in July 2026, imported from the company attendance sheet (exact date within the month not recorded).'), -- Soniya
  ('33746384-c35e-4060-ab1f-d207dd1e6655'::uuid, '2026-09-01'::date, 'sick', 1, 'Historical backfill: 1 day(s) of sick leave used in September 2026, imported from the company attendance sheet (exact date within the month not recorded).'), -- Soniya
  ('33746384-c35e-4060-ab1f-d207dd1e6655'::uuid, '2026-10-01'::date, 'sick', 1, 'Historical backfill: 1 day(s) of sick leave used in October 2026, imported from the company attendance sheet (exact date within the month not recorded).'), -- Soniya
  ('58cb67e1-e3f0-41d9-9db7-9f8012fb4e80'::uuid, '2026-03-01'::date, 'sick', 2, 'Historical backfill: 2 day(s) of sick leave used in March 2026, imported from the company attendance sheet (exact date within the month not recorded).'), -- Umesh
  ('58cb67e1-e3f0-41d9-9db7-9f8012fb4e80'::uuid, '2026-07-01'::date, 'annual', 1, 'Historical backfill: 1 day(s) of annual leave used in July 2026, imported from the company attendance sheet (exact date within the month not recorded).'), -- Umesh
  ('58cb67e1-e3f0-41d9-9db7-9f8012fb4e80'::uuid, '2026-07-01'::date, 'sick', 1, 'Historical backfill: 1 day(s) of sick leave used in July 2026, imported from the company attendance sheet (exact date within the month not recorded).'), -- Umesh
  ('20bbc809-2e2b-460c-8e67-e053d41ea2d6'::uuid, '2026-04-01'::date, 'annual', 1, 'Historical backfill: 1 day(s) of annual leave used in April 2026, imported from the company attendance sheet (exact date within the month not recorded).'), -- Vaibhav
  ('20bbc809-2e2b-460c-8e67-e053d41ea2d6'::uuid, '2026-07-01'::date, 'sick', 3, 'Historical backfill: 3 day(s) of sick leave used in July 2026, imported from the company attendance sheet (exact date within the month not recorded).'), -- Vaibhav
  ('20bbc809-2e2b-460c-8e67-e053d41ea2d6'::uuid, '2026-08-01'::date, 'annual', 1, 'Historical backfill: 1 day(s) of annual leave used in August 2026, imported from the company attendance sheet (exact date within the month not recorded).'), -- Vaibhav
  ('20bbc809-2e2b-460c-8e67-e053d41ea2d6'::uuid, '2026-09-01'::date, 'sick', 1, 'Historical backfill: 1 day(s) of sick leave used in September 2026, imported from the company attendance sheet (exact date within the month not recorded).'), -- Vaibhav
  ('20bbc809-2e2b-460c-8e67-e053d41ea2d6'::uuid, '2026-10-01'::date, 'annual', 5, 'Historical backfill: 5 day(s) of annual leave used in October 2026, imported from the company attendance sheet (exact date within the month not recorded).') -- Vaibhav
) AS v(employee_id, anchor_date, leave_type, days, reason)
WHERE NOT EXISTS (
  SELECT 1 FROM leave_requests lr
  WHERE lr.employee_id = v.employee_id
    AND lr.leave_type = v.leave_type
    AND lr.start_date = v.anchor_date
    AND lr.end_date = v.anchor_date
    AND lr.reason LIKE 'Historical backfill:%'
);

-- Verify afterward:
-- select u.name, lb.financial_year, lb.annual_total, lb.sick_total from leave_balances lb join users u on u.id = lb.employee_id order by u.name, lb.financial_year;
-- select u.name, lr.leave_type, lr.start_date, lr.days_count from leave_requests lr join users u on u.id = lr.employee_id where lr.reason like 'Historical backfill:%' order by u.name, lr.start_date;
