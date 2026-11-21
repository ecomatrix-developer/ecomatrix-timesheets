-- v3.0 roles & access levels (Developer Brief v2, section 2).
--
-- DO NOT RUN THIS YET. Drafted ahead of time so the app code can be built
-- against the new fields locally without touching the live database. Run
-- it yourself, in the Supabase SQL Editor, only when you're ready to flip
-- the switch on the new role model.
--
-- This is an "expand only" migration: it adds new NULLABLE columns with
-- safe defaults and does NOT drop, rename, or retype anything.
--
-- IMPORTANT, and the reason this file stops where it does: Postgres does
-- NOT fire row triggers for ALTER TABLE ADD COLUMN ... DEFAULT ... — it's
-- a metadata-only change, not a per-row UPDATE. So every statement in
-- THIS file is genuinely zero-impact: no existing row's `role` value
-- changes, and the currently-deployed app (which only reads `role`) can't
-- tell this ran. That stops being true the moment anything actually
-- UPDATEs a row's access_level — which is exactly what assigning real
-- people their new roles does, since the sync trigger below then flips
-- their legacy `role` from 'employee' to 'admin' and the OLD deployed
-- code would immediately show THEM its old-style full-admin sidebar. That
-- part is deliberately NOT in this file — see
-- supabase_patch_7b_named_role_backfill.sql, run that only when you're
-- ready for those specific people's current live access to actually
-- change.
--
-- Safe to run the whole file in one go (same reasoning as patch_4/patch_6
-- — this table is tiny, a plain ALTER/CREATE INDEX is instant).

-- 1. New columns, all nullable or defaulted so every existing row stays
--    valid with zero backfill required before the ALTER succeeds.
ALTER TABLE users ADD COLUMN IF NOT EXISTS email text;

-- Deliberately NO default/NOT NULL: NULL means "not assigned yet," which
-- is what tells the app to fall back to the legacy `role` column (see
-- session.ts). A default value here would silently mark every existing
-- row as "migrated" with nobody having decided that — this bit the first
-- run of this file (see supabase_patch_7c_fix_null_defaults.sql) until
-- it was corrected to the nullable form below.
ALTER TABLE users ADD COLUMN IF NOT EXISTS access_level text
  CHECK (access_level IN ('super_admin', 'admin', 'user'));

ALTER TABLE users ADD COLUMN IF NOT EXISTS user_type text
  CHECK (user_type IN ('employee', 'intern', 'consultant', 'accountant'));

-- No "team" column — the brief's draft had one (to scope Admin to a
-- subset of projects/people), but Abeer confirmed the org doesn't
-- actually segregate that way, so Admin is a flat, org-wide tier. An
-- earlier run of this file did add a team column; it was dropped in
-- supabase_patch_7e_drop_team.sql.

-- Display label only (e.g. "Senior BIM Modeler") — never read for
-- permission checks anywhere in the app.
ALTER TABLE users ADD COLUMN IF NOT EXISTS job_title text;

-- 2. Case-insensitive unique email, but only enforced when an email is
--    actually set — most existing rows won't have one until backfilled.
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique
  ON users (lower(email))
  WHERE email IS NOT NULL;

-- 3. Keep legacy `role` in sync automatically, so nothing that still reads
--    `role` (old deployed code, any script) can ever drift from the new
--    access_level. super_admin/admin both map to the old 'admin' value;
--    everything else maps to 'employee' — exactly matching today's binary
--    model. Guarded on "access_level IS NOT NULL": a NULL access_level
--    means "not decided yet," not "definitely not admin," so it must
--    leave `role` exactly as the statement already has it rather than
--    forcing 'employee' — getting this wrong is what caused
--    supabase_patch_7d_fix_trigger_and_admin_role.sql to be needed (it
--    had flipped the real `admin` account's role on a later NULL reset).
CREATE OR REPLACE FUNCTION sync_legacy_role() RETURNS trigger AS $$
BEGIN
  IF NEW.access_level IS NOT NULL THEN
    NEW.role := CASE
      WHEN NEW.access_level IN ('super_admin', 'admin') THEN 'admin'
      ELSE 'employee'
    END;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_legacy_role ON users;
CREATE TRIGGER trg_sync_legacy_role
  BEFORE INSERT OR UPDATE OF access_level ON users
  FOR EACH ROW EXECUTE FUNCTION sync_legacy_role();

-- 4. One-time backfill: pre-fill email for the rows where username is
--    already an email address (most of them already are — this is
--    probably what "the existing emails will be there" meant). Does NOT
--    touch access_level, so the role-sync trigger above does not fire for
--    this statement — role is untouched for every row.
UPDATE users SET email = username
  WHERE email IS NULL AND username ILIKE '%@%';

-- That's it for this file. Real people's access_level assignments
-- (Anup/Arti/Abhijeet/Vaibhav/Shehzad) live in
-- supabase_patch_7b_named_role_backfill.sql — run it separately, whenever
-- you're ready for their CURRENT live access to actually change.

-- Verify afterward:
-- select username, name, role, access_level, user_type, team, email
--   from users order by access_level, name;
