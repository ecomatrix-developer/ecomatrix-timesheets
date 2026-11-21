export type Role = "admin" | "employee";

// v3.0 role model. Two independent axes replace the old binary `role`,
// which stays on the row (auto-synced by a DB trigger — see
// supabase_patch_7_roles_v3.sql) purely for any code path that hasn't
// been migrated over yet. There is deliberately no "team" axis — the
// brief's draft had one, but Abeer confirmed the org doesn't actually
// segregate by team, so Admin is a flat tier (everything a User can do,
// plus admin actions, org-wide — not scoped to a subset of projects/
// people). These columns are nullable with NO default (fixed in
// supabase_patch_7c — the first version of patch_7 mistakenly defaulted
// them, which silently marked every existing row as "migrated"). NULL
// genuinely means "not assigned yet" — every permission check must treat
// null/undefined the same way: fall back to `role`, never assume a value.
export type AccessLevel = "super_admin" | "admin" | "user";
export type UserType = "employee" | "intern" | "consultant" | "accountant" | "marketing_bd";

export interface User {
  id: string;
  mongo_id: string | null;
  username: string;
  name: string;
  password_hash: string;
  role: Role;
  email?: string | null;
  access_level?: AccessLevel | null;
  user_type?: UserType | null;
  job_title?: string | null;
  created_at: string;
  updated_at: string;
}

export type PublicUser = Omit<User, "password_hash">;

// v3.0 (supabase_patch_15) — Contact Us submissions AND "Forgot Password?"
// requests, routed into one inbox so Super Admin has a single place to
// see every user query instead of relying on email alone.
export type ContactSubmissionSource = "contact_form" | "password_reset";

export interface ContactSubmission {
  id: string;
  user_id: string | null;
  username: string;
  name: string;
  subject: string;
  message: string;
  source: ContactSubmissionSource;
  read_at: string | null;
  read_by: string | null;
  created_at: string;
}

// Leave portal MVP (supabase_patch_10_leave_requests.sql) — request +
// approve/reject only, no balance tracking yet.
export type LeaveType = "sick" | "casual" | "annual" | "unpaid" | "other";
export type LeaveStatus = "pending" | "approved" | "rejected";

export interface LeaveRequest {
  id: string;
  employee_id: string;
  start_date: string;
  end_date: string;
  leave_type: LeaveType;
  reason: string | null;
  status: LeaveStatus;
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
  created_at: string;
  // Only present on rows returned by getAllLeaveRequests(), which joins in
  // the requester's name for the Admin/Super Admin approval list.
  employee_name?: string;
}

export type ProjectType = "Energy Modelling" | "BIM and AutoCad";

export interface Project {
  id: string;
  mongo_id: string | null;
  project_number: string | null;
  client_name: string;
  name: string;
  description: string | null;
  status: "active" | "completed" | "re-work" | "archived";
  // Splits projects into the two grouped dropdowns on the Timesheet page's
  // "Project Selection" card, and the type filter/column on Projects.
  // Matches v1 exactly: untyped legacy projects count as "Energy Modelling"
  // (enforced by the DB column's default, so this is never actually null).
  project_type: ProjectType;
  // v3.0 (supabase_patch_9) — optional/nullable until that migration has
  // run; existing projects keep project_number/client_name exactly as
  // before. eco_matrix_number is the new system-generated YY-NNN number,
  // never typed by a user.
  eco_matrix_number?: string | null;
  client_id?: string | null;
  client_project_number?: string | null;
  // v3.0 (supabase_patch_11) — optional/nullable until that migration has
  // run; defaults to true at the DB level for every row once it does.
  billable?: boolean | null;
  // v3.0 (supabase_patch_12) — which UserType(s) may see/select this
  // project on the timesheet. NULL/undefined/empty means "everyone" —
  // this is what every existing project has, so nothing is restricted
  // until an admin explicitly narrows a project down. See
  // lib/projectVisibility.ts for the one place that reads this.
  visible_user_types?: string[] | null;
  created_at: string;
  updated_at: string;
}

// v3.0 (supabase_patch_9) — clients, scopes, and the billing-group/task
// taxonomy that drives the timesheet comment dropdown. See that file for
// the full seed data this mirrors.
export interface Client {
  id: string;
  name: string;
  short_code: string;
  active: boolean;
  created_at: string;
}

export interface ProjectScope {
  id: string;
  name: string;
  active: boolean;
  created_at: string;
}

export interface BillingGroup {
  id: string;
  name: string;
  billable: boolean;
  active: boolean;
  created_at: string;
}

export interface Task {
  id: string;
  name: string;
  billing_group_id: string;
  active: boolean;
  created_at: string;
}

export interface TimesheetEntry {
  id: string;
  mongo_id: string | null;
  employee_id: string;
  project_id: string | null;
  category: string | null;
  entry_date: string; // YYYY-MM-DD
  hours: number;
  comment: string | null;
  created_at: string;
  updated_at: string;
}

export interface SubmittedDay {
  id: string;
  mongo_id: string | null;
  employee_id: string;
  entry_date: string;
  total_hours: number;
  submitted_at: string;
  entries_data: unknown;
  created_at: string;
}

export interface SubmittedWeek {
  id: string;
  mongo_id: string | null;
  employee_id: string;
  week_key: string;
  week_start: string;
  week_end: string;
  total_hours: number;
  submitted_at: string;
  entries_data: unknown;
  created_at: string;
}

export interface SessionPayload {
  userId: string;
  username: string;
  name: string;
  role: Role;
  // Present once supabase_patch_7_roles_v3.sql has been run AND the user
  // has logged in again since (sessions aren't retroactively upgraded).
  // Every permission check must treat these as optional and fall back to
  // `role` — see isAdminOrAbove/isSuperAdmin in session.ts.
  accessLevel?: AccessLevel | null;
  userType?: UserType | null;
  jobTitle?: string | null;
}

// Employee document portal (brief section 6, pulled forward). Strictly
// private: a document is only ever visible to its own employee_id and to
// a Super Admin — see requireDocumentAccess in session.ts. A plain Admin
// gets none of this, by design.
export type DocumentCategory =
  | "salary_slip"
  | "offer_letter"
  | "appointment_letter"
  | "confirmation_letter"
  | "increment_letter"
  | "nda"
  | "id_proof"
  | "address_proof"
  | "bank_document"
  | "other";

export interface EmployeeDocument {
  id: string;
  employee_id: string;
  uploaded_by: string;
  category: DocumentCategory;
  title: string;
  storage_path: string;
  file_name: string;
  file_size: number | null;
  mime_type: string | null;
  created_at: string;
}

// A single grid "row target" is either a project or a special category —
// exactly one of the two, matching the DB's CHECK constraint.
export type RowTarget =
  | { kind: "project"; projectId: string }
  | { kind: "category"; category: string };

export function rowTargetKey(t: RowTarget): string {
  return t.kind === "project" ? `p:${t.projectId}` : `c:${t.category}`;
}
