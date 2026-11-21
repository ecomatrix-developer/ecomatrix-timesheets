-- Corrective fix #2 (run this now — there's a real live regression).
--
-- The sync_legacy_role trigger (from patch_7) fires on ANY update that
-- touches access_level — including patch_7c's blanket "reset to NULL"
-- UPDATE — and its CASE statement treated a NULL access_level the same
-- as "definitely not admin," forcing role to 'employee'. That silently
-- flipped the real `admin` account's role from 'admin' to 'employee' the
-- moment patch_7c ran. Right now, anyone logging into that account on the
-- LIVE deployed site sees the employee view, not admin.

-- 1. Guard the trigger: only recompute role when access_level is
--    actually set to something. When it's NULL (not yet decided), leave
--    role exactly as the statement already has it — never force it to
--    'employee'. This is what patch_7's trigger should have done from
--    the start.
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

-- 2. Restore the one row that got flipped. Doesn't touch access_level,
--    so the now-fixed trigger doesn't fire for this statement anyway.
UPDATE users SET role = 'admin' WHERE username = 'admin';

-- Verify immediately afterward:
-- select username, role, access_level from users where username = 'admin';
-- (expect role = 'admin', access_level = null)
