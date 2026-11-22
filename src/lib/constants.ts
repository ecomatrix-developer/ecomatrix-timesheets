// Timesheet category rows shown in employee, admin, and report grids.

export const SPECIAL_CATEGORIES = [
  "Statutory holiday",
  "Vacation",
  "Special Vacation",
  "Sicktime",
  "Training / Research",
  "Overhead",
  "PTO",
  "PTO BANKING",
  "Special Vacation Banking",
] as const;

export type SpecialCategory = (typeof SPECIAL_CATEGORIES)[number];

export const CATEGORIES_FOR_GRID = [...SPECIAL_CATEGORIES];

export const PROJECT_STATUSES = [
  "active",
  "completed",
  "re-work",
  "archived",
] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

// v3.0 (supabase_patch_12) — who may see/select a project on the
// timesheet (projects.visible_user_types). Shared between project
// creation and editing so both pickers always offer the same set.
export const USER_TYPE_OPTIONS = [
  { value: "employee", label: "Employee" },
  { value: "intern", label: "Intern" },
  { value: "consultant", label: "Consultant" },
  { value: "accountant", label: "Accountant" },
  { value: "marketing_bd", label: "Marketing & BD" },
] as const;
export const ALL_USER_TYPES = USER_TYPE_OPTIONS.map((o) => o.value) as string[];

// Standard weekday minimum hours required before a day can be submitted.
export const STANDARD_DAILY_HOURS = 7.75;

// Rollout anchor for the "finish last week before starting a new one" gate
// (see isWeekUnlocked in timesheetMath.ts) — deliberately NOT retroactive.
// The gate only ever applies to a week whose PRECEDING week starts on or
// after this date, so weeks already in progress or already open when this
// the week of Nov 9, 2026 remains open; the gate starts for the following
// week, after employees have had the week of Nov 9 to submit.
export const WEEK_GATE_ROLLOUT_DATE = "2026-11-09";
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
  "Content Writing",
  "Linkedin marketing",
  "SEO (Search Engine Optimization)",
  "Email marketing",
  "Website",
  "Client Outreach",
  "Other",
] as const;

// Rows per page for every paginated list in the app (dashboard's project
// table, /projects, the Reports submission log and project totals lists).
// Keeping one shared constant means every list paginates consistently.
export const PAGE_SIZE = 10;

// Employee document portal category labels — keep in sync with the
// DocumentCategory union in types.ts and the CHECK constraint in
// supabase_patch_8_documents.sql.
export const DOCUMENT_CATEGORY_LABELS: Record<string, string> = {
  salary_slip: "Salary Slip",
  offer_letter: "Offer Letter",
  appointment_letter: "Appointment Letter",
  confirmation_letter: "Confirmation Letter",
  increment_letter: "Increment Letter",
  nda: "NDA",
  id_proof: "ID Proof",
  address_proof: "Address Proof",
  bank_document: "Bank Document",
  other: "Other",
};

