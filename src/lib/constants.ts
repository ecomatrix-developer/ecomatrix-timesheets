// Business-rule constants mirrored from v1's app.py (TIMESHEET_DATA) plus
// the 5 extra categories discovered in production data during migration
// (see supabase_patch_1_add_categories.sql). All 13 must always be present.

export const SPECIAL_CATEGORIES = [
  "Statutory holiday",
  "Vacation",
  "Sicktime",
  "Training / Research",
  "Overhead",
  "Overtime Logged",
  "PTO",
  "PTO BANKING",
  // Discovered in live production data, kept verbatim (not merged):
  "Special Vacation",
  "Special Vacation Banking",
  "Research Initiatives",
  "Training",
  "empty_0",
] as const;

export type SpecialCategory = (typeof SPECIAL_CATEGORIES)[number];

// 'Overtime Logged' is computed, never entered directly — filtered out of
// every grid, exactly like v1.
export const CATEGORIES_FOR_GRID = SPECIAL_CATEGORIES.filter(
  (c) => c !== "Overtime Logged"
);

export const PROJECT_STATUSES = [
  "active",
  "completed",
  "re-work",
  "archived",
] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

// Standard weekday minimum hours required before a day can be submitted.
export const STANDARD_DAILY_HOURS = 7.75;

// Rollout anchor for the "finish last week before starting a new one" gate
// (see isWeekUnlocked in timesheetMath.ts) — deliberately NOT retroactive.
// The gate only ever applies to a week whose PRECEDING week starts on or
// after this date, so weeks already in progress or already open when this
// feature shipped are never newly locked by it, and a brand-new employee's
// very first week (no prior week exists yet) is never gated either.
export const WEEK_GATE_ROLLOUT_DATE = "2026-10-08";
// Standard 5-day week (informational; weekly submission is a legacy/unused
// flow in v1 but kept here for parity).
export const STANDARD_WEEKLY_HOURS = 38.75;

// Hard cap enforced on a single cell's hours for PTO / PTO BANKING — v1
// reverts the value and shows a warning modal above this, never saves it.
export const PTO_SINGLE_DAY_CAP = 4.0;

// v1 only accepts hours in quarter-hour increments (0.25 step) on every
// timesheet cell; anything else is rejected and the cell is cleared.
export const HOURS_STEP = 0.25;

// The structured comment-breakdown categories used in the "Add Comment"
// modal for REAL PROJECT rows (special categories use a plain free-text
// comment instead — see the modal's own category check in v1's
// openCommentModal). Comments for project rows are saved as a JSON string
// of {hours, category, detail?}[] — the sum of these hours becomes the
// grid cell's saved value (matches v1's saveCommentFromModal exactly).
export const COMMENT_CATEGORIES = [
  "Geometry",
  "Thermal Template",
  "HVAC",
  "Simulation & QA/QC",
  "Reporting",
  "BIM-CAD",
  "BIM-REVIT",
  "Other",
] as const;

// Rows per page for every paginated list in the app (dashboard's project
// table, /projects, the Reports submission log and project totals lists).
// Keeping one shared constant means every list paginates consistently.
export const PAGE_SIZE = 10;

