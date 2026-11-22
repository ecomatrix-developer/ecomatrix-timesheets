import "server-only";
import { supabaseAdmin } from "./supabaseAdmin";
import type { BillingGroup, Client, ContactSubmission, ContactSubmissionMessage, EmployeeDocument, LeaveRequest, LeaveRequestMessage, Project, ProjectScope, PublicUser, Task, User } from "./types";

export async function getAllUsers(): Promise<PublicUser[]> {
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("id, mongo_id, username, name, role, created_at, updated_at")
    .order("name");
  if (error) throw error;
  return data as PublicUser[];
}

export async function getUserByUsername(username: string): Promise<User | null> {
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("*")
    .eq("username", username)
    .maybeSingle();
  if (error) throw error;
  return data as User | null;
}

// v3.0 only — deliberately a separate function from getAllUsers() rather
// than adding these columns to its select list. getAllUsers() is called by
// dashboard/reports/reopen_timesheets/insights, which are all still in
// active use today; selecting columns that don't exist yet (before
// supabase_patch_7_roles_v3.sql runs) would 500 every one of those pages.
// This one is only ever called from the merged Employees & Roles page
// (/manage_roles, formerly also /create_employee).
export async function getAllUsersWithRoles(): Promise<PublicUser[]> {
  const { data, error } = await supabaseAdmin
    .from("users")
    .select(
      "id, mongo_id, username, name, role, email, access_level, user_type, job_title, created_at, updated_at"
    )
    .order("name");
  if (error) throw error;
  return data as PublicUser[];
}

export async function getUserById(id: string): Promise<PublicUser | null> {
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("id, mongo_id, username, name, role, created_at, updated_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data as PublicUser | null;
}

// v3.0 only — same reasoning as getAllUsersWithRoles: a separate function
// so pages that don't need the new columns (and predate the migration)
// keep working unaffected.
export async function getUserByIdWithRoles(id: string): Promise<PublicUser | null> {
  const { data, error } = await supabaseAdmin
    .from("users")
    .select(
      "id, mongo_id, username, name, role, email, access_level, user_type, job_title, created_at, updated_at"
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data as PublicUser | null;
}

// Employee document portal. Ordered newest first so the most recently
// uploaded document (often what the employee or Super Admin just added)
// is at the top.
export async function getDocumentsForEmployee(employeeId: string): Promise<EmployeeDocument[]> {
  const { data, error } = await supabaseAdmin
    .from("employee_documents")
    .select("*")
    .eq("employee_id", employeeId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as EmployeeDocument[];
}

export async function getDocumentById(id: string): Promise<EmployeeDocument | null> {
  const { data, error } = await supabaseAdmin
    .from("employee_documents")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data as EmployeeDocument | null;
}

// Consolidated Super Admin view (/manage_documents): one document count per
// employee, computed from every row rather than per-employee queries, so
// the index page is a single round trip no matter how many employees exist.
export async function getDocumentCountsByEmployee(): Promise<Record<string, number>> {
  const { data, error } = await supabaseAdmin.from("employee_documents").select("employee_id");
  if (error) throw error;
  const counts: Record<string, number> = {};
  for (const row of data as { employee_id: string }[]) {
    counts[row.employee_id] = (counts[row.employee_id] ?? 0) + 1;
  }
  return counts;
}

// Leave portal (MVP). Ordered newest first, same convention as documents.
export async function getLeaveRequestsForEmployee(employeeId: string): Promise<LeaveRequest[]> {
  const { data, error } = await supabaseAdmin
    .from("leave_requests")
    .select("*")
    .eq("employee_id", employeeId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as LeaveRequest[];
}

// Admin/Super Admin approval view — every request org-wide (flat tier, no
// team scoping, matching every other admin screen in this app), joined
// with the requester's name so the list doesn't need a second round trip.
export async function getAllLeaveRequests(): Promise<LeaveRequest[]> {
  const { data, error } = await supabaseAdmin
    .from("leave_requests")
    .select("*, users!leave_requests_employee_id_fkey(name)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as (LeaveRequest & { users: { name: string } | null })[]).map((row) => ({
    ...row,
    employee_name: row.users?.name ?? "Unknown",
  }));
}

export async function getLeaveRequestById(id: string): Promise<LeaveRequest | null> {
  const { data, error } = await supabaseAdmin
    .from("leave_requests")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data as LeaveRequest | null;
}

// Head-count only (no rows fetched) — powers the notification bell badge
// without pulling every pending request's full data just to count them.
export async function getPendingLeaveRequestsCount(): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from("leave_requests")
    .select("*", { count: "exact", head: true })
    .eq("status", "pending");
  if (error) throw error;
  return count ?? 0;
}

// v3.0 (supabase_patch_15) — every Contact Us submission + "Forgot
// Password?" request ever made, newest first — no pagination, no date
// bound. Abeer, 2026-11-22: "it should show all the past msg as well...
// irrespective of date filter" — this inbox is a small, internal-only
// record (not a public-facing high-volume table), so one unbounded fetch
// is simpler and safer than paginating away history an admin needs to
// search back through. Admin/Super Admin inbox page.
export async function getAllContactSubmissions(): Promise<ContactSubmission[]> {
  const { data, error } = await supabaseAdmin
    .from("contact_submissions")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ContactSubmission[];
}

// v3.0 (supabase_patch_16) — one employee's own submissions + whatever
// reply an Admin/Super Admin has left, newest first. Powers the "Your
// past messages" list under the Contact Us form.
export async function getContactSubmissionsForUser(userId: string): Promise<ContactSubmission[]> {
  const { data, error } = await supabaseAdmin
    .from("contact_submissions")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ContactSubmission[];
}

export async function getUnreadContactSubmissionsCount(): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from("contact_submissions")
    .select("*", { count: "exact", head: true })
    .is("read_at", null);
  if (error) throw error;
  return count ?? 0;
}

interface RawThreadMessage {
  id: string;
  sender_id: string;
  message: string;
  created_at: string;
  sender: { name: string } | null;
}

// v3.0 (supabase_patch_18) — every message in every Contact Us thread,
// grouped by submission_id. Admin/Super Admin Inbox view (sees every
// thread); pass submissionIds to scope it to one employee's own threads
// instead (the Contact Us page).
export async function getContactSubmissionMessages(
  submissionIds?: string[]
): Promise<Record<string, ContactSubmissionMessage[]>> {
  if (submissionIds && submissionIds.length === 0) return {};
  let query = supabaseAdmin
    .from("contact_submission_messages")
    .select("id, submission_id, sender_id, message, created_at, sender:users!contact_submission_messages_sender_id_fkey(name)")
    .order("created_at", { ascending: true });
  if (submissionIds) query = query.in("submission_id", submissionIds);
  const { data, error } = await query;
  if (error) throw error;
  const result: Record<string, ContactSubmissionMessage[]> = {};
  for (const row of (data ?? []) as unknown as (RawThreadMessage & { submission_id: string })[]) {
    (result[row.submission_id] ??= []).push({
      id: row.id,
      submission_id: row.submission_id,
      sender_id: row.sender_id,
      sender_name: row.sender?.name ?? "Unknown",
      message: row.message,
      created_at: row.created_at,
    });
  }
  return result;
}

// v3.0 (supabase_patch_18) — same thread model as above, for leave
// requests: every message in every thread, grouped by request_id. Super
// Admin history view (sees every thread); pass requestIds to scope it to
// one employee's own request threads instead ("My Requests").
export async function getLeaveRequestMessages(
  requestIds?: string[]
): Promise<Record<string, LeaveRequestMessage[]>> {
  if (requestIds && requestIds.length === 0) return {};
  let query = supabaseAdmin
    .from("leave_request_messages")
    .select("id, request_id, sender_id, message, created_at, sender:users!leave_request_messages_sender_id_fkey(name)")
    .order("created_at", { ascending: true });
  if (requestIds) query = query.in("request_id", requestIds);
  const { data, error } = await query;
  if (error) throw error;
  const result: Record<string, LeaveRequestMessage[]> = {};
  for (const row of (data ?? []) as unknown as (RawThreadMessage & { request_id: string })[]) {
    (result[row.request_id] ??= []).push({
      id: row.id,
      request_id: row.request_id,
      sender_id: row.sender_id,
      sender_name: row.sender?.name ?? "Unknown",
      message: row.message,
      created_at: row.created_at,
    });
  }
  return result;
}

export async function getAllProjects(): Promise<Project[]> {
  const { data, error } = await supabaseAdmin
    .from("projects")
    .select("*")
    .order("name");
  if (error) throw error;
  return data as Project[];
}

export async function getProjectById(id: string): Promise<Project | null> {
  const { data, error } = await supabaseAdmin
    .from("projects")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data as Project | null;
}

/** Build a lookup map id -> Project for fast joins in memory. */
export function toProjectMap(projects: Project[]): Record<string, Project> {
  const map: Record<string, Project> = {};
  for (const p of projects) map[p.id] = p;
  return map;
}

export function toUserMap(users: PublicUser[]): Record<string, PublicUser> {
  const map: Record<string, PublicUser> = {};
  for (const u of users) map[u.id] = u;
  return map;
}

// ---------------------------------------------------------------------
// v3.0 (supabase_patch_9) — clients, scopes, billing groups, tasks. All
// separate from the functions above for the same reason as
// getAllUsersWithRoles: these select columns/tables that don't exist
// until that migration has run, and must not break any page that
// predates it.
// ---------------------------------------------------------------------

export async function getAllClients(): Promise<Client[]> {
  const { data, error } = await supabaseAdmin.from("clients").select("*").order("name");
  if (error) throw error;
  return data as Client[];
}

export async function getAllProjectScopes(): Promise<ProjectScope[]> {
  const { data, error } = await supabaseAdmin.from("project_scopes").select("*").order("name");
  if (error) throw error;
  return data as ProjectScope[];
}

// v3.0 (supabase_patch_11) — both swallow their own "not migrated yet"
// errors instead of throwing, so the create-project page can gate its new
// horizontal layout on a plain boolean/null check without a try/catch.
export async function isBillableColumnSupported(): Promise<boolean> {
  const { error } = await supabaseAdmin.from("projects").select("billable").limit(1);
  return !error;
}

export async function peekNextEcoMatrixNumber(): Promise<string | null> {
  const { data, error } = await supabaseAdmin.rpc("peek_eco_matrix_number");
  if (error) return null;
  return (data as string) ?? null;
}

// v3.0 (supabase_patch_12) — same swallow-the-error pattern as above.
export async function isVisibilityColumnSupported(): Promise<boolean> {
  const { error } = await supabaseAdmin.from("projects").select("visible_user_types").limit(1);
  return !error;
}

export async function getAllBillingGroups(): Promise<BillingGroup[]> {
  const { data, error } = await supabaseAdmin.from("billing_groups").select("*").order("name");
  if (error) throw error;
  return data as BillingGroup[];
}

export async function getAllTasks(): Promise<Task[]> {
  const { data, error } = await supabaseAdmin.from("tasks").select("*").order("name");
  if (error) throw error;
  return data as Task[];
}

export interface TimesheetTaxonomy {
  scopes: ProjectScope[];
  billingGroups: BillingGroup[];
  tasks: Task[];
  scopeBillingGroupLinks: { scope_id: string; billing_group_id: string }[];
  projectScopeLinks: { project_id: string; scope_id: string }[];
}

/**
 * One batched fetch of every table that feeds the timesheet comment
 * dropdown's project -> scopes -> billing groups -> tasks chain, used to
 * build an in-memory per-project task map server-side once (see
 * buildProjectTaskMap in taxonomy.ts) rather than querying per project.
 */
export async function getTimesheetTaxonomy(): Promise<TimesheetTaxonomy> {
  const [scopes, billingGroups, tasks, scopeLinksRes, projectLinksRes] = await Promise.all([
    getAllProjectScopes(),
    getAllBillingGroups(),
    getAllTasks(),
    supabaseAdmin.from("scope_billing_groups").select("scope_id, billing_group_id"),
    supabaseAdmin.from("project_scope_links").select("project_id, scope_id"),
  ]);
  if (scopeLinksRes.error) throw scopeLinksRes.error;
  if (projectLinksRes.error) throw projectLinksRes.error;
  return {
    scopes,
    billingGroups,
    tasks,
    scopeBillingGroupLinks: scopeLinksRes.data,
    projectScopeLinks: projectLinksRes.data,
  };
}
