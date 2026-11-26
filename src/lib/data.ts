import "server-only";
import { unstable_cache } from "next/cache";
import { supabaseAdmin } from "./supabaseAdmin";
import type { BillingGroup, Client, ContactSubmission, ContactSubmissionMessage, DocumentFolder, EmployeeDocument, LeaveBalance, LeaveRequest, LeaveRequestMessage, LeaveSummary, Project, ProjectScope, PublicUser, Task, User } from "./types";
import { DEFAULT_ANNUAL_LEAVE_DAYS, DEFAULT_SICK_LEAVE_DAYS, financialYearForDate } from "./leavePolicy";

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
// Abeer, 2026-11-23: "add proper caching to these pages ... only leave
// reports, timesheets as without caching" — this is used ONLY by
// /manage_roles and /manage_documents (verified: not shared with Reports,
// Timesheet, or the AI assistant's tools), so it's safe to cache directly.
// Busted by every action that changes a user's row: createEmployeeAction,
// deleteEmployeeAction, updateUserRoleAction, resetUserPasswordAction.
const getAllUsersWithRolesUncached = async (): Promise<PublicUser[]> => {
  const { data, error } = await supabaseAdmin
    .from("users")
    .select(
      "id, mongo_id, username, name, role, email, access_level, user_type, job_title, created_at, updated_at"
    )
    .order("name");
  if (error) throw error;
  return data as PublicUser[];
};
export const getAllUsersWithRoles = unstable_cache(getAllUsersWithRolesUncached, ["all-users-with-roles"], {
  revalidate: 45,
  tags: ["users"],
});

// Same super_admin/admin resolution isSuperAdminOnly()/isAdminOrAbove() use
// for a session, applied to a plain user row instead — access_level is
// NULL for anyone not yet migrated onto the v3 role model, in which case
// the old single-tier `role === "admin"` is the super-admin-equivalent.
function rowIsSuperAdmin(u: Pick<PublicUser, "role" | "access_level">): boolean {
  if (u.access_level) return u.access_level === "super_admin";
  return u.role === "admin";
}
function rowIsAdminOrAbove(u: Pick<PublicUser, "role" | "access_level">): boolean {
  if (u.access_level) return u.access_level === "admin" || u.access_level === "super_admin";
  return u.role === "admin";
}

/**
 * Real recipients for the Contact Us notification — Abeer, 2026-11-26:
 * "for contact us form only superadmins will see that." Swapped in for
 * TEST_NOTIFICATION_RECIPIENTS once email formatting was confirmed good.
 */
export async function getSuperAdminEmails(): Promise<string[]> {
  const users = await getAllUsersWithRoles();
  return users.filter(rowIsSuperAdmin).map((u) => u.email).filter((e): e is string => !!e);
}

/**
 * Real recipients for the leave-request notification — Abeer, 2026-11-26:
 * "make it now for leaves admins and superadmins will get the emails."
 */
export async function getAdminAndSuperAdminEmails(): Promise<string[]> {
  const users = await getAllUsersWithRoles();
  return users.filter(rowIsAdminOrAbove).map((u) => u.email).filter((e): e is string => !!e);
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
// Only used by /manage_documents/[userId] — safe to cache directly, same
// "users" tag/invalidation set as getAllUsersWithRoles above.
const getUserByIdWithRolesUncached = async (id: string): Promise<PublicUser | null> => {
  const { data, error } = await supabaseAdmin
    .from("users")
    .select(
      "id, mongo_id, username, name, role, email, access_level, user_type, job_title, created_at, updated_at"
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data as PublicUser | null;
};
export const getUserByIdWithRoles = unstable_cache(getUserByIdWithRolesUncached, ["user-by-id-with-roles"], {
  revalidate: 45,
  tags: ["users"],
});

// Employee document portal. Ordered newest first so the most recently
// uploaded document (often what the employee or Super Admin just added)
// is at the top. Used only by /my_documents and /manage_documents/[userId]
// — safe to cache; uploadDocumentAction/deleteDocumentAction both bust the
// "documents" tag so a just-uploaded/deleted file shows up immediately
// (the forced router.refresh() those actions trigger reads past the stale
// cache entry right away, not after the 45s TTL).
const getDocumentsForEmployeeUncached = async (employeeId: string): Promise<EmployeeDocument[]> => {
  const { data, error } = await supabaseAdmin
    .from("employee_documents")
    .select("*")
    .eq("employee_id", employeeId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as EmployeeDocument[];
};
export const getDocumentsForEmployee = unstable_cache(getDocumentsForEmployeeUncached, ["documents-for-employee"], {
  revalidate: 45,
  tags: ["documents"],
});

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
const getDocumentCountsByEmployeeUncached = async (): Promise<Record<string, number>> => {
  const { data, error } = await supabaseAdmin.from("employee_documents").select("employee_id");
  if (error) throw error;
  const counts: Record<string, number> = {};
  for (const row of data as { employee_id: string }[]) {
    counts[row.employee_id] = (counts[row.employee_id] ?? 0) + 1;
  }
  return counts;
};
export const getDocumentCountsByEmployee = unstable_cache(getDocumentCountsByEmployeeUncached, ["document-counts-by-employee"], {
  revalidate: 45,
  tags: ["documents"],
});

// v3.0 (supabase_patch_24) — every folder in one employee's document
// space, for the folder-browser UI in /manage_documents/[userId]. Busted
// by the same "documents" tag as the functions above so a just-created/
// deleted folder shows up immediately after router.refresh().
const getDocumentFoldersForEmployeeUncached = async (employeeId: string): Promise<DocumentFolder[]> => {
  const { data, error } = await supabaseAdmin
    .from("document_folders")
    .select("*")
    .eq("employee_id", employeeId)
    .order("name");
  if (error) {
    if ((error as { code?: string }).code === "PGRST205") return [];
    throw error;
  }
  return data as DocumentFolder[];
};
export const getDocumentFoldersForEmployee = unstable_cache(
  getDocumentFoldersForEmployeeUncached,
  ["document-folders-for-employee"],
  { revalidate: 45, tags: ["documents"] }
);

export async function getDocumentFolderById(id: string): Promise<DocumentFolder | null> {
  const { data, error } = await supabaseAdmin
    .from("document_folders")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data as DocumentFolder | null;
}

// Org-wide folder count, for the Accountant dashboard's stat tiles —
// head-only count query, no rows fetched.
export async function getTotalDocumentFolderCount(): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from("document_folders")
    .select("*", { count: "exact", head: true });
  if (error) {
    if ((error as { code?: string }).code === "PGRST205") return 0;
    throw error;
  }
  return count ?? 0;
}

// Leave portal (MVP). Ordered newest first, same convention as documents.
// Used only by /leave — safe to cache; every leave action (create, decide,
// add thread message) busts the "leave-requests" tag.
const getLeaveRequestsForEmployeeUncached = async (employeeId: string): Promise<LeaveRequest[]> => {
  const { data, error } = await supabaseAdmin
    .from("leave_requests")
    .select("*")
    .eq("employee_id", employeeId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as LeaveRequest[];
};
export const getLeaveRequestsForEmployee = unstable_cache(getLeaveRequestsForEmployeeUncached, ["leave-requests-for-employee"], {
  revalidate: 30,
  tags: ["leave-requests"],
});

// Admin/Super Admin approval view — every request org-wide (flat tier, no
// team scoping, matching every other admin screen in this app), joined
// with the requester's name so the list doesn't need a second round trip.
const getAllLeaveRequestsUncached = async (): Promise<LeaveRequest[]> => {
  const { data, error } = await supabaseAdmin
    .from("leave_requests")
    .select("*, users!leave_requests_employee_id_fkey(name)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as (LeaveRequest & { users: { name: string } | null })[]).map((row) => ({
    ...row,
    employee_name: row.users?.name ?? "Unknown",
  }));
};
export const getAllLeaveRequests = unstable_cache(getAllLeaveRequestsUncached, ["all-leave-requests"], {
  revalidate: 30,
  tags: ["leave-requests"],
});

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
// Used only by /contact_submissions (the Inbox) — safe to cache; every
// mutation on this data (new submission, mark read, reply) busts the
// "contact-submissions" tag.
const getAllContactSubmissionsUncached = async (): Promise<ContactSubmission[]> => {
  const { data, error } = await supabaseAdmin
    .from("contact_submissions")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ContactSubmission[];
};
export const getAllContactSubmissions = unstable_cache(getAllContactSubmissionsUncached, ["all-contact-submissions"], {
  revalidate: 30,
  tags: ["contact-submissions"],
});

// v3.0 (supabase_patch_16) — one employee's own submissions + whatever
// reply an Admin/Super Admin has left, newest first. Powers the "Your
// past messages" list under the Contact Us form.
const getContactSubmissionsForUserUncached = async (userId: string): Promise<ContactSubmission[]> => {
  const { data, error } = await supabaseAdmin
    .from("contact_submissions")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ContactSubmission[];
};
export const getContactSubmissionsForUser = unstable_cache(getContactSubmissionsForUserUncached, ["contact-submissions-for-user"], {
  revalidate: 30,
  tags: ["contact-submissions"],
});

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
const getContactSubmissionMessagesUncached = async (
  submissionIds?: string[]
): Promise<Record<string, ContactSubmissionMessage[]>> => {
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
};
// Used by both /contact (own threads) and /contact_submissions (every
// thread) — both are safe to cache, same "contact-submissions" tag/
// invalidation set as getAllContactSubmissions above.
export const getContactSubmissionMessages = unstable_cache(
  getContactSubmissionMessagesUncached,
  ["contact-submission-messages"],
  { revalidate: 30, tags: ["contact-submissions"] }
);

// v3.0 (supabase_patch_18) — same thread model as above, for leave
// requests: every message in every thread, grouped by request_id. Super
// Admin history view (sees every thread); pass requestIds to scope it to
// one employee's own request threads instead ("My Requests").
const getLeaveRequestMessagesUncached = async (
  requestIds?: string[]
): Promise<Record<string, LeaveRequestMessage[]>> => {
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
};
// Used only by /leave — safe to cache, same "leave-requests" tag as the
// two functions above.
export const getLeaveRequestMessages = unstable_cache(getLeaveRequestMessagesUncached, ["leave-request-messages"], {
  revalidate: 30,
  tags: ["leave-requests"],
});

// v3.0 (supabase_patch_22) — resolves the ONE leave_balances row covering
// a given date (defaults to today) for one employee, or null if a Super
// Admin hasn't assigned one yet (callers then fall back to the standard
// 13/8 default policy — see getLeaveSummaryForEmployee below).
export async function getLeaveBalanceForEmployee(
  employeeId: string,
  onDateIso?: string
): Promise<LeaveBalance | null> {
  const onDate = onDateIso ?? new Date().toISOString().slice(0, 10);
  const { data, error } = await supabaseAdmin
    .from("leave_balances")
    .select("*")
    .eq("employee_id", employeeId)
    .lte("period_start", onDate)
    .gte("period_end", onDate)
    .order("period_start", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    if ((error as { code?: string }).code === "PGRST205") return null;
    throw error;
  }
  return data as LeaveBalance | null;
}

// Admin list views (Manage Roles, the Leave page's balance-editor panel)
// — every employee's CURRENT (covering today) assigned balance in one
// query, keyed by employee_id. An employee missing from the result just
// hasn't been assigned one yet — the UI falls back to the 13/8 default
// for them. Safe to cache: busted by upsertLeaveBalanceAction.
const getCurrentLeaveBalancesByEmployeeUncached = async (): Promise<Record<string, LeaveBalance>> => {
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabaseAdmin
    .from("leave_balances")
    .select("*")
    .lte("period_start", today)
    .gte("period_end", today);
  if (error) {
    if ((error as { code?: string }).code === "PGRST205") return {};
    throw error;
  }
  const result: Record<string, LeaveBalance> = {};
  for (const row of (data ?? []) as LeaveBalance[]) {
    result[row.employee_id] = row;
  }
  return result;
};
export const getCurrentLeaveBalancesByEmployee = unstable_cache(
  getCurrentLeaveBalancesByEmployeeUncached,
  ["current-leave-balances-by-employee"],
  { revalidate: 60, tags: ["leave-balances"] }
);

interface LeaveBalancePeriod {
  financial_year: string;
  period_start: string;
  period_end: string;
  isDefaultBalance: boolean;
  annual_total: number;
  sick_total: number;
}

function defaultLeaveBalancePeriod(): LeaveBalancePeriod {
  const { start, end, label } = financialYearForDate();
  return {
    financial_year: label,
    period_start: start,
    period_end: end,
    isDefaultBalance: true,
    annual_total: DEFAULT_ANNUAL_LEAVE_DAYS,
    sick_total: DEFAULT_SICK_LEAVE_DAYS,
  };
}

// The actual math behind the /leave metric cards: resolves the employee's
// current balance (Super-Admin-assigned, or the default policy), then
// sums days_count from their APPROVED requests whose start_date falls
// inside that same financial-year period. Pending requests don't count
// against the balance yet — only an approved request is a confirmed use
// of leave. Deliberately NOT cached — it's read right after an approve/
// reject decision or a new balance assignment, and a stale "remaining"
// count on the employee's own page would be a confusing result to show.
export async function getLeaveSummaryForEmployee(employeeId: string): Promise<LeaveSummary> {
  const assigned = await getLeaveBalanceForEmployee(employeeId);
  const base: LeaveBalancePeriod = assigned
    ? {
        financial_year: assigned.financial_year,
        period_start: assigned.period_start,
        period_end: assigned.period_end,
        isDefaultBalance: false,
        annual_total: assigned.annual_total,
        sick_total: assigned.sick_total,
      }
    : defaultLeaveBalancePeriod();

  const { data, error } = await supabaseAdmin
    .from("leave_requests")
    .select("leave_type, days_count")
    .eq("employee_id", employeeId)
    .eq("status", "approved")
    .gte("start_date", base.period_start)
    .lte("start_date", base.period_end);
  // Tolerates supabase_patch_22 not having run yet (days_count column
  // missing) — falls back to zero usage rather than 500ing the whole
  // /leave page over a sub-feature that isn't set up yet.
  if (error) return { ...base, annual_used: 0, sick_used: 0, unpaid_used: 0, other_used: 0 };

  let annual_used = 0;
  let sick_used = 0;
  let unpaid_used = 0;
  let other_used = 0;
  for (const row of (data ?? []) as { leave_type: LeaveRequest["leave_type"]; days_count: number }[]) {
    if (row.leave_type === "annual") annual_used += row.days_count;
    else if (row.leave_type === "sick") sick_used += row.days_count;
    else if (row.leave_type === "unpaid") unpaid_used += row.days_count;
    else other_used += row.days_count; // casual + other
  }

  return { ...base, annual_used, sick_used, unpaid_used, other_used };
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

// Abeer, 2026-11-22: "do that selective caching, exclude timesheets,
// reports, reopen timesheets, dashboard and leaves" — clients/scopes/
// billing groups/tasks are seeded once via SQL migration and have no
// edit UI anywhere in the app, so there's nothing that can make them go
// stale in practice; a 10-minute cache has no real downside and shaves a
// round trip off every page that loads them (Projects create/edit, the
// Timesheet comment-modal taxonomy, etc.) — none of which are on the
// excluded list themselves. getTimesheetTaxonomy below deliberately does
// NOT wrap its project_scope_links fetch the same way: that table
// changes every time a project is created/edited, and the Timesheet
// page's comment dropdown depends on it staying live.
const getAllClientsUncached = async (): Promise<Client[]> => {
  const { data, error } = await supabaseAdmin.from("clients").select("*").order("name");
  if (error) throw error;
  return data as Client[];
};
export const getAllClients = unstable_cache(getAllClientsUncached, ["all-clients"], {
  revalidate: 600,
  tags: ["reference-data"],
});

const getAllProjectScopesUncached = async (): Promise<ProjectScope[]> => {
  const { data, error } = await supabaseAdmin.from("project_scopes").select("*").order("name");
  if (error) throw error;
  return data as ProjectScope[];
};
export const getAllProjectScopes = unstable_cache(getAllProjectScopesUncached, ["all-project-scopes"], {
  revalidate: 600,
  tags: ["reference-data"],
});

// v3.0 (supabase_patch_11) — both swallow their own "not migrated yet"
// errors instead of throwing, so the create-project page can gate its new
// horizontal layout on a plain boolean/null check without a try/catch.
// Cached long (1 hour): a column either exists or it doesn't — the only
// time this ever flips is the one moment a migration is actually run,
// which is a deliberate, known event, not something that needs to be
// detected within seconds.
const isBillableColumnSupportedUncached = async (): Promise<boolean> => {
  const { error } = await supabaseAdmin.from("projects").select("billable").limit(1);
  return !error;
};
export const isBillableColumnSupported = unstable_cache(isBillableColumnSupportedUncached, ["billable-column-supported"], {
  revalidate: 3600,
  tags: ["reference-data"],
});

// Deliberately NOT cached — supabase_patch_20 made this read the live MAX
// in-use number straight from the projects table, specifically so it
// always reflects the current real state (see that migration's notes).
// Caching it would reintroduce exactly the staleness problem patch_20 was
// written to remove.
export async function peekNextEcoMatrixNumber(): Promise<string | null> {
  const { data, error } = await supabaseAdmin.rpc("peek_eco_matrix_number");
  if (error) return null;
  return (data as string) ?? null;
}

// v3.0 (supabase_patch_12) — same swallow-the-error pattern and long cache
// as isBillableColumnSupported above.
const isVisibilityColumnSupportedUncached = async (): Promise<boolean> => {
  const { error } = await supabaseAdmin.from("projects").select("visible_user_types").limit(1);
  return !error;
};
export const isVisibilityColumnSupported = unstable_cache(isVisibilityColumnSupportedUncached, ["visibility-column-supported"], {
  revalidate: 3600,
  tags: ["reference-data"],
});

const getAllBillingGroupsUncached = async (): Promise<BillingGroup[]> => {
  const { data, error } = await supabaseAdmin.from("billing_groups").select("*").order("name");
  if (error) throw error;
  return data as BillingGroup[];
};
export const getAllBillingGroups = unstable_cache(getAllBillingGroupsUncached, ["all-billing-groups"], {
  revalidate: 600,
  tags: ["reference-data"],
});

const getAllTasksUncached = async (): Promise<Task[]> => {
  const { data, error } = await supabaseAdmin.from("tasks").select("*").order("name");
  if (error) throw error;
  return data as Task[];
};
export const getAllTasks = unstable_cache(getAllTasksUncached, ["all-tasks"], {
  revalidate: 600,
  tags: ["reference-data"],
});

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
