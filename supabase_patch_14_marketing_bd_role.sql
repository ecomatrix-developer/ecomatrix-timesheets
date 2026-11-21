-- v3.0: adds "marketing_bd" as a 5th user_type, per Abeer's 2026-11-21
-- request: "create one more role as Marketing and BD so that when
-- project assigned to that... visible to only that person as well as
-- super admins and admins."
--
-- supabase_patch_7_roles_v3.sql added a CHECK constraint restricting
-- users.user_type to exactly 4 values — this widens it to 5. The DO block
-- finds that constraint by its actual definition rather than assuming its
-- auto-generated name, so this works regardless of what Postgres named it.

DO $$
DECLARE
  con_name text;
BEGIN
  SELECT conname INTO con_name
  FROM pg_constraint
  WHERE conrelid = 'users'::regclass
    AND pg_get_constraintdef(oid) ILIKE '%user_type%IN%';
  IF con_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE users DROP CONSTRAINT %I', con_name);
  END IF;
END $$;

ALTER TABLE users ADD CONSTRAINT users_user_type_check
  CHECK (user_type IN ('employee', 'intern', 'consultant', 'accountant', 'marketing_bd'));

-- Verify afterward:
-- update users set user_type = 'marketing_bd' where username = 'some.test.user' returning user_type;
