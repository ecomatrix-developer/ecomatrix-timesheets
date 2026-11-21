-- Named v3.0 role assignments — split out of supabase_patch_7_roles_v3.sql
-- on purpose.
--
-- RUN ONLY WHEN YOU WANT THESE SPECIFIC PEOPLE'S CURRENT LIVE ACCESS TO
-- ACTUALLY CHANGE. Unlike patch_7, this file is NOT zero-impact: each
-- UPDATE below sets access_level, which fires the sync trigger from
-- patch_7 and flips that row's legacy `role` from 'employee' to 'admin'.
-- The currently-deployed app only understands that old binary `role`
-- column — so the moment this runs, if Anup / Abhijeet / Vaibhav / Shehzad
-- log into the LIVE site (or their session just refreshes), the OLD code
-- will show them its old-style full-admin sidebar (Create Employee,
-- Database Stats, Delete Old Entries, Reports, Insights, Export,
-- Reopen Timesheets) — because that old code can't distinguish Admin
-- from Super Admin. That's a real, immediate change to what they can do
-- today, before any of the new v3.0 code is deployed.
--
-- Requires supabase_patch_7_roles_v3.sql to have been run first. No
-- `team` assignment here — that column was removed (see
-- supabase_patch_7e_drop_team.sql); Admin is a flat, org-wide tier.

UPDATE users SET access_level = 'super_admin'
  WHERE username = 'anup@ecomatrix.io';          -- Anup Rathi

UPDATE users SET access_level = 'admin'
  WHERE username = 'abhijeet.ecomatrix@gmail.com'; -- Abhijeet Bochkari

UPDATE users SET access_level = 'admin'
  WHERE username = 'vaibhav.ecomatrix@gmail.com'; -- Vaibhav Ramteke

UPDATE users SET access_level = 'admin'
  WHERE username = 'shehzad@ecomatrix.io';        -- Shehzad

-- The generic break-glass "admin" account is already role='admin' today,
-- so this one is a true no-op for current behavior — included for
-- completeness so it also carries the new fields.
UPDATE users SET access_level = 'super_admin'
  WHERE username = 'admin';

-- Arti Rathi (arti@ecomatrix.io) has NO existing account in this table —
-- there's nothing to UPDATE. Create her through the app's Manage Roles /
-- Create Employee screen after this runs (it hashes her password
-- correctly via bcrypt, same as every other account); don't hand-insert
-- her here with a raw password.

-- Verify afterward:
-- select username, name, role, access_level, user_type, email
--   from users order by access_level, name;
