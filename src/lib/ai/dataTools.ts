import "server-only";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAllProjects, getAllUsers } from "@/lib/data";
import { SPECIAL_CATEGORIES } from "@/lib/constants";
import type { Project, PublicUser } from "@/lib/types";

const BATCH_SIZE = 1000;

interface EntryFilters {
  employeeId?: string;
  projectId?: string;
  dateFrom?: string;
  dateTo?: string;
}

interface RawEntry {
  project_id: string | null;
  category: string | null;
  employee_id: string;
  hours: number;
  comment: string | null;
  entry_date: string;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function normalize(s: string): string {
  return s.trim().toLowerCase();
}

async function countEntries(filters: EntryFilters): Promise<number> {
  let q = supabaseAdmin.from("timesheet_entries").select("*", { count: "exact", head: true });
  if (filters.employeeId) q = q.eq("employee_id", filters.employeeId);
  if (filters.projectId) q = q.eq("project_id", filters.projectId);
  if (filters.dateFrom) q = q.gte("entry_date", filters.dateFrom);
  if (filters.dateTo) q = q.lte("entry_date", filters.dateTo);
  const { count, error } = await q;
  if (error) throw error;
  return count ?? 0;
}

function entriesRangeQuery(filters: EntryFilters, from: number, to: number) {
  // .order("id") is required here, not cosmetic: Postgres gives no row-order
  // guarantee across separate .range() calls without an explicit order, so
  // two batches of the same filtered query can skip or duplicate rows at
  // the boundary. Confirmed live: employees with >1000 matching entries
  // (crossing the batch boundary) got wrong totals before this was added.
  let q = supabaseAdmin
    .from("timesheet_entries")
    .select("project_id, category, employee_id, hours, comment, entry_date")
    .order("id")
    .range(from, to);
  if (filters.employeeId) q = q.eq("employee_id", filters.employeeId);
  if (filters.projectId) q = q.eq("project_id", filters.projectId);
  if (filters.dateFrom) q = q.gte("entry_date", filters.dateFrom);
  if (filters.dateTo) q = q.lte("entry_date", filters.dateTo);
  return q;
}

/**
 * PostgREST caps a plain .select() at 1000 rows, so any query that could
 * span the whole table (an org-wide date range, or no filters at all)
 * needs count-then-parallel-range batching, same pattern used across the
 * rest of this app (see Insights' page.tsx).
 */
async function fetchEntries(filters: EntryFilters): Promise<RawEntry[]> {
  const total = await countEntries(filters);
  if (total === 0) return [];
  const batches = Math.max(1, Math.ceil(total / BATCH_SIZE));
  const results = await Promise.all(
    Array.from({ length: batches }, (_, i) => entriesRangeQuery(filters, i * BATCH_SIZE, i * BATCH_SIZE + BATCH_SIZE - 1))
  );
  const entries: RawEntry[] = [];
  for (const r of results) {
    if (r.error) throw r.error;
    entries.push(...((r.data ?? []) as RawEntry[]));
  }
  return entries;
}

type Resolved<T> = { ok: true; value: T } | { ok: false; message: string };

/**
 * The admin types free-text names into the chat, not IDs, so every tool
 * that targets one employee/project resolves it by fuzzy name match first
 * — exact match wins outright; otherwise a unique substring match is
 * accepted; multiple or zero matches come back as a plain-language error
 * for Claude to relay (never guessed).
 */
async function resolveEmployee(query: string): Promise<Resolved<PublicUser>> {
  const users = await getAllUsers();
  const employees = users.filter((u) => u.role === "employee");
  const q = normalize(query);
  const exact = employees.filter((e) => normalize(e.name) === q || normalize(e.username) === q);
  if (exact.length === 1) return { ok: true, value: exact[0] };
  const partial = employees.filter((e) => normalize(e.name).includes(q) || normalize(e.username).includes(q));
  if (partial.length === 1) return { ok: true, value: partial[0] };
  if (partial.length > 1) {
    return {
      ok: false,
      message: `Multiple employees match "${query}": ${partial.map((e) => e.name).join(", ")}. Please be more specific.`,
    };
  }
  return {
    ok: false,
    message: `No employee found matching "${query}". Known employees: ${employees.map((e) => e.name).join(", ")}.`,
  };
}

async function resolveProject(query: string): Promise<Resolved<Project>> {
  const projects = await getAllProjects();
  const q = normalize(query);
  const exact = projects.filter(
    (p) => normalize(p.name) === q || (p.project_number != null && normalize(p.project_number) === q)
  );
  if (exact.length === 1) return { ok: true, value: exact[0] };
  const partial = projects.filter(
    (p) =>
      normalize(p.name).includes(q) ||
      (p.project_number != null && normalize(p.project_number).includes(q)) ||
      normalize(p.client_name).includes(q)
  );
  if (partial.length === 1) return { ok: true, value: partial[0] };
  if (partial.length > 1) {
    return {
      ok: false,
      message: `Multiple projects match "${query}": ${partial
        .slice(0, 10)
        .map((p) => `${p.name} (#${p.project_number ?? "—"}, ${p.client_name})`)
        .join("; ")}${partial.length > 10 ? `, and ${partial.length - 10} more` : ""}. Please be more specific.`,
    };
  }
  return { ok: false, message: `No project found matching "${query}".` };
}

export async function listEmployees() {
  const users = await getAllUsers();
  return users.filter((u) => u.role === "employee").map((u) => ({ id: u.id, name: u.name, username: u.username }));
}

export interface ListProjectsArgs {
  search?: string;
  status?: string;
  client_name?: string;
  project_type?: string;
}

export async function listProjects(args: ListProjectsArgs) {
  const projects = await getAllProjects();
  const q = args.search ? normalize(args.search) : null;
  const filtered = projects.filter((p) => {
    if (args.status && p.status !== args.status) return false;
    if (args.project_type && p.project_type !== args.project_type) return false;
    if (args.client_name && normalize(p.client_name) !== normalize(args.client_name)) return false;
    if (
      q &&
      !(
        normalize(p.name).includes(q) ||
        (p.project_number != null && normalize(p.project_number).includes(q)) ||
        normalize(p.client_name).includes(q)
      )
    )
      return false;
    return true;
  });
  const items = filtered.slice(0, 50).map((p) => ({
    id: p.id,
    project_number: p.project_number,
    name: p.name,
    client_name: p.client_name,
    status: p.status,
    project_type: p.project_type,
  }));
  return { total_matches: filtered.length, showing: items.length, projects: items };
}

export interface EmployeeHoursArgs {
  employee: string;
  date_from?: string;
  date_to?: string;
}

export async function getEmployeeHoursSummary(args: EmployeeHoursArgs) {
  const resolved = await resolveEmployee(args.employee);
  if (!resolved.ok) return { error: resolved.message };
  const dateFrom = args.date_from ?? "2000-01-01";
  const dateTo = args.date_to ?? new Date().toISOString().slice(0, 10);
  const [entries, projects] = await Promise.all([
    fetchEntries({ employeeId: resolved.value.id, dateFrom, dateTo }),
    getAllProjects(),
  ]);
  const projectById = new Map(projects.map((p) => [p.id, p]));

  let totalHours = 0;
  let billable = 0;
  let nonBillable = 0;
  const byProject = new Map<string, number>();
  const byCategory = new Map<string, number>();
  for (const e of entries) {
    const hours = Number(e.hours ?? 0);
    totalHours += hours;
    if (e.project_id) {
      billable += hours;
      const name = projectById.get(e.project_id)?.name ?? "Unknown project";
      byProject.set(name, (byProject.get(name) ?? 0) + hours);
    } else {
      nonBillable += hours;
      if (e.category) byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + hours);
    }
  }
  return {
    employee: resolved.value.name,
    date_from: dateFrom,
    date_to: dateTo,
    total_hours: round2(totalHours),
    billable_hours: round2(billable),
    non_billable_hours: round2(nonBillable),
    hours_by_project: [...byProject.entries()]
      .map(([name, hours]) => ({ name, hours: round2(hours) }))
      .sort((a, b) => b.hours - a.hours)
      .slice(0, 15),
    hours_by_leave_category: [...byCategory.entries()]
      .map(([name, hours]) => ({ name, hours: round2(hours) }))
      .sort((a, b) => b.hours - a.hours),
  };
}

export interface ProjectSummaryArgs {
  project: string;
  date_from?: string;
  date_to?: string;
}

export async function getProjectSummary(args: ProjectSummaryArgs) {
  const resolved = await resolveProject(args.project);
  if (!resolved.ok) return { error: resolved.message };
  const dateFrom = args.date_from ?? "2000-01-01";
  const dateTo = args.date_to ?? new Date().toISOString().slice(0, 10);
  const [entries, users] = await Promise.all([
    fetchEntries({ projectId: resolved.value.id, dateFrom, dateTo }),
    getAllUsers(),
  ]);
  const userById = new Map(users.map((u) => [u.id, u]));

  let totalHours = 0;
  const byEmployee = new Map<string, number>();
  for (const e of entries) {
    const hours = Number(e.hours ?? 0);
    totalHours += hours;
    const name = userById.get(e.employee_id)?.name ?? e.employee_id;
    byEmployee.set(name, (byEmployee.get(name) ?? 0) + hours);
  }
  return {
    project: resolved.value.name,
    project_number: resolved.value.project_number,
    client_name: resolved.value.client_name,
    status: resolved.value.status,
    project_type: resolved.value.project_type,
    date_from: dateFrom,
    date_to: dateTo,
    total_hours: round2(totalHours),
    hours_by_employee: [...byEmployee.entries()]
      .map(([name, hours]) => ({ name, hours: round2(hours) }))
      .sort((a, b) => b.hours - a.hours),
  };
}

export interface LeaveSummaryArgs {
  employee?: string;
  date_from?: string;
  date_to?: string;
}

export async function getLeaveSummary(args: LeaveSummaryArgs) {
  const dateFrom = args.date_from ?? "2000-01-01";
  const dateTo = args.date_to ?? new Date().toISOString().slice(0, 10);
  let employeeId: string | undefined;
  let employeeName = "All employees";
  if (args.employee) {
    const resolved = await resolveEmployee(args.employee);
    if (!resolved.ok) return { error: resolved.message };
    employeeId = resolved.value.id;
    employeeName = resolved.value.name;
  }
  const entries = await fetchEntries({ employeeId, dateFrom, dateTo });
  const totals = new Map<string, number>();
  for (const e of entries) {
    if (e.project_id) continue;
    if (!e.category || !(SPECIAL_CATEGORIES as readonly string[]).includes(e.category)) continue;
    totals.set(e.category, (totals.get(e.category) ?? 0) + Number(e.hours ?? 0));
  }
  return {
    employee: employeeName,
    date_from: dateFrom,
    date_to: dateTo,
    leave_hours_by_category: [...totals.entries()]
      .map(([name, hours]) => ({ name, hours: round2(hours) }))
      .sort((a, b) => b.hours - a.hours),
  };
}

export interface SubmissionStatusArgs {
  employee: string;
  date_from: string;
  date_to: string;
}

export async function getSubmissionStatus(args: SubmissionStatusArgs) {
  const resolved = await resolveEmployee(args.employee);
  if (!resolved.ok) return { error: resolved.message };
  const { data, error } = await supabaseAdmin
    .from("submitted_days")
    .select("entry_date, total_hours")
    .eq("employee_id", resolved.value.id)
    .gte("entry_date", args.date_from)
    .lte("entry_date", args.date_to)
    .order("entry_date");
  if (error) throw error;
  const submittedDates = new Set((data ?? []).map((d) => d.entry_date as string));

  const missing: string[] = [];
  for (
    let d = new Date(`${args.date_from}T00:00:00Z`);
    d <= new Date(`${args.date_to}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1)
  ) {
    const dateStr = d.toISOString().slice(0, 10);
    const weekday = d.getUTCDay();
    if (weekday === 0 || weekday === 6) continue; // weekends are never required
    if (!submittedDates.has(dateStr)) missing.push(dateStr);
  }

  return {
    employee: resolved.value.name,
    date_from: args.date_from,
    date_to: args.date_to,
    submitted_days_count: data?.length ?? 0,
    missing_weekdays: missing,
  };
}

export interface OrgOverviewArgs {
  date_from?: string;
  date_to?: string;
}

export async function getOrgOverview(args: OrgOverviewArgs) {
  const dateFrom = args.date_from ?? "2000-01-01";
  const dateTo = args.date_to ?? new Date().toISOString().slice(0, 10);
  const [entries, projects, users] = await Promise.all([
    fetchEntries({ dateFrom, dateTo }),
    getAllProjects(),
    getAllUsers(),
  ]);
  const projectById = new Map(projects.map((p) => [p.id, p]));
  const userById = new Map(users.map((u) => [u.id, u]));

  let totalHours = 0;
  const byProject = new Map<string, number>();
  const byEmployee = new Map<string, number>();
  for (const e of entries) {
    const hours = Number(e.hours ?? 0);
    totalHours += hours;
    if (e.project_id) {
      const name = projectById.get(e.project_id)?.name ?? "Unknown project";
      byProject.set(name, (byProject.get(name) ?? 0) + hours);
    }
    const empName = userById.get(e.employee_id)?.name ?? e.employee_id;
    byEmployee.set(empName, (byEmployee.get(empName) ?? 0) + hours);
  }
  const statusCounts = new Map<string, number>();
  for (const p of projects) statusCounts.set(p.status, (statusCounts.get(p.status) ?? 0) + 1);

  return {
    date_from: dateFrom,
    date_to: dateTo,
    total_hours_logged: round2(totalHours),
    total_employees: users.filter((u) => u.role === "employee").length,
    total_projects: projects.length,
    projects_by_status: Object.fromEntries(statusCounts),
    top_projects_by_hours: [...byProject.entries()]
      .map(([name, hours]) => ({ name, hours: round2(hours) }))
      .sort((a, b) => b.hours - a.hours)
      .slice(0, 5),
    top_employees_by_hours: [...byEmployee.entries()]
      .map(([name, hours]) => ({ name, hours: round2(hours) }))
      .sort((a, b) => b.hours - a.hours)
      .slice(0, 5),
  };
}
