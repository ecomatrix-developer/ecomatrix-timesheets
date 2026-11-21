-- v3.0: per-project visibility by user_type (Abeer, 2026-11-21 request) —
-- "if its intern then intern logs in will get to see that project only, if
-- normal employee then emp will be able to see them, if consultant then
-- only consultant login will be able to see them."
--
-- Purely additive, same pattern as patch_9/patch_11: one new nullable
-- column. NULL (the value every existing project already has, and the
-- default for any project created without touching this field) means
-- "visible to everyone" — IDENTICAL to today's behavior. A project only
-- becomes restricted when an admin explicitly narrows it down in the
-- create form to a subset of user_types.
--
-- No DB-level enum/check constraint on the array's contents — validated
-- application-side against the same UserType union already used for
-- users.user_type (employee/intern/consultant/accountant), so adding a
-- new user_type later never requires a migration here.

ALTER TABLE projects ADD COLUMN IF NOT EXISTS visible_user_types text[];

-- Verify afterward:
-- select visible_user_types from projects limit 1;  -- existing rows: NULL
