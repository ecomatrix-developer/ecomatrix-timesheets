-- Corrective fix for supabase_patch_7_roles_v3.sql.
--
-- That migration made access_level/user_type NOT NULL with a DEFAULT, so
-- every existing row silently got access_level='user' instead of "not yet
-- assigned." The app's fallback logic (session.ts / Sidebar.tsx) needs a
-- real NULL to mean "this person hasn't been migrated yet, use the old
-- role field" — a default value defeats that. Run this once, now, before
-- any more role testing or real logins happen.

-- 1. Drop the NOT NULL + DEFAULT so future rows can be genuinely unset.
ALTER TABLE users ALTER COLUMN access_level DROP NOT NULL;
ALTER TABLE users ALTER COLUMN access_level DROP DEFAULT;
ALTER TABLE users ALTER COLUMN user_type DROP NOT NULL;
ALTER TABLE users ALTER COLUMN user_type DROP DEFAULT;

-- 2. Reset every row back to NULL EXCEPT the test.* accounts, which had
--    these fields set explicitly (not via the default) when they were
--    created, and should keep those values.
UPDATE users SET access_level = NULL, user_type = NULL
  WHERE username NOT LIKE 'test.%';

-- Verify afterward — every real user should show null/null, test.*
-- accounts should keep their assigned values:
-- select username, role, access_level, user_type from users order by username;
