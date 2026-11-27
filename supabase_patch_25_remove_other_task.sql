-- Abeer, 2026-11-27: "remove the option of other from comments across
-- all project types, so remove that other from there" — the "Other" task
-- exists under multiple billing groups (Energy, Revit, CAD,
-- Marketing & BD — supabase_patch_9's seed data), which is what makes it
-- show up in the comment dropdown for every project type.
--
-- Deactivated, not deleted: any timesheet comment already saved against
-- "Other" (buildProjectTaskMap in taxonomy.ts already filters tasks on
-- `active`) keeps displaying/bucketing correctly — it just stops being an
-- option for new comments going forward. Safe to re-run.
UPDATE tasks SET active = false WHERE name = 'Other';

-- Verify afterward:
-- select t.name, g.name as billing_group, t.active from tasks t join billing_groups g on g.id = t.billing_group_id where t.name = 'Other';
