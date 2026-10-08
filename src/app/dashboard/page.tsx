import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAllUsers } from "@/lib/data";
import PageTransition from "@/components/PageTransition";
import DashboardStats from "./DashboardStats";
import DashboardProjectsTable from "./DashboardProjectsTable";
import DashboardOverview from "./DashboardOverview";
import EmployeeOverview, { type EmployeeDayStatus, type EmployeeProjectHours } from "./EmployeeOverview";
import { PAGE_SIZE } from "@/lib/constants";
import { computeDailyOvertime, computeDailyRegular, computePtoTotal } from "@/lib/timesheetMath";
import type { Project } from "@/lib/types";
import { FaPlus, FaUserPlus, FaDatabase } from "react-icons/fa";

const MONTH_NAMES_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/**
 * Personal "This Month" + recent-activity + project-breakdown data for an
 * employee's own dashboard — scoped entirely to session.userId, unlike the
 * admin overview above which is org-wide. Computed from scratch each
 * request (page is already force-dynamic).
 */
async function buildEmployeeOverviewData(userId: string) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const monthEnd = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  const monthLabel = `${MONTH_NAMES_SHORT[month - 1]} ${year}`;

  const { data: monthEntries, error: monthErr } = await supabaseAdmin
    .from("timesheet_entries")
    .select("entry_date, hours, project_id, category")
    .eq("employee_id", userId)
    .gte("entry_date", monthStart)
    .lte("entry_date", monthEnd);
  if (monthErr) throw monthErr;

  // Daily totals -> capped regular/overtime split, same rule as /timesheet.
  const dailyTotals = new Map<string, number>();
  const categoryTotals: Record<string, number> = {};
  const projectHoursMap = new Map<string, number>();
  for (const e of monthEntries ?? []) {
    const hours = Number(e.hours ?? 0);
    dailyTotals.set(e.entry_date, (dailyTotals.get(e.entry_date) ?? 0) + hours);
    if (e.project_id) {
      projectHoursMap.set(e.project_id, (projectHoursMap.get(e.project_id) ?? 0) + hours);
    } else if (e.category) {
      categoryTotals[e.category] = (categoryTotals[e.category] ?? 0) + hours;
    }
  }

  let monthRegularHours = 0;
  let monthOvertimeHours = 0;
  for (const [date, total] of dailyTotals) {
    monthRegularHours += computeDailyRegular(date, total);
    monthOvertimeHours += computeDailyOvertime(date, total);
  }
  const monthPtoHours = computePtoTotal(categoryTotals);

  let projectHours: EmployeeProjectHours[] = [];
  if (projectHoursMap.size > 0) {
    const { data: projects, error: projErr } = await supabaseAdmin
      .from("projects")
      .select("id, name")
      .in("id", [...projectHoursMap.keys()]);
    if (projErr) throw projErr;
    const nameById = new Map((projects ?? []).map((p) => [p.id, p.name]));
    projectHours = [...projectHoursMap.entries()]
      .map(([id, hours]) => ({ name: nameById.get(id) ?? "Unknown project", hours }))
      .sort((a, b) => b.hours - a.hours);
  }

  // Last 7 calendar days' submission status, for the "recent activity" card.
  const last7Dates: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    last7Dates.push(d.toISOString().slice(0, 10));
  }
  const { data: recentEntries, error: recentErr } = await supabaseAdmin
    .from("timesheet_entries")
    .select("entry_date, hours")
    .eq("employee_id", userId)
    .gte("entry_date", last7Dates[0])
    .lte("entry_date", last7Dates[last7Dates.length - 1]);
  if (recentErr) throw recentErr;
  const { data: recentSubmitted, error: recentSubErr } = await supabaseAdmin
    .from("submitted_days")
    .select("entry_date")
    .eq("employee_id", userId)
    .gte("entry_date", last7Dates[0])
    .lte("entry_date", last7Dates[last7Dates.length - 1]);
  if (recentSubErr) throw recentSubErr;

  const recentHoursByDate = new Map<string, number>();
  for (const e of recentEntries ?? []) {
    recentHoursByDate.set(e.entry_date, (recentHoursByDate.get(e.entry_date) ?? 0) + Number(e.hours ?? 0));
  }
  const submittedSet = new Set((recentSubmitted ?? []).map((s) => s.entry_date));

  const recentDays: EmployeeDayStatus[] = last7Dates.map((date) => {
    const d = new Date(date + "T00:00:00Z");
    const dayLabel = `${d.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" })} ${d.getUTCDate()}`;
    return {
      date,
      dayLabel,
      hours: recentHoursByDate.get(date) ?? 0,
      submitted: submittedSet.has(date),
    };
  });

  return { monthLabel, monthRegularHours, monthOvertimeHours, monthPtoHours, recentDays, projectHours };
}

/**
 * All the data the admin-only "Hours & Compliance" / "Project Portfolio"
 * dashboard sections need, computed from scratch each request (this page
 * is already `force-dynamic`). Kept deliberately separate from the
 * existing project stat tiles/table above, which every role can see.
 */
async function buildDashboardOverviewData() {
  const users = await getAllUsers();
  const employees = users.filter((u) => u.role === "employee");
  const userById = new Map(users.map((u) => [u.id, u]));

  // Last 6 months' billable/non-billable hours trend.
  const now = new Date();
  const monthRanges: { label: string; start: string; end: string }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const lastDay = new Date(y, m, 0).getDate();
    monthRanges.push({
      label: `${MONTH_NAMES_SHORT[m - 1]} ${y}`,
      start: `${y}-${String(m).padStart(2, "0")}-01`,
      end: `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`,
    });
  }

  const { data: entries, error: entriesErr } = await supabaseAdmin
    .from("timesheet_entries")
    .select("entry_date, hours, project_id, employee_id")
    .gte("entry_date", monthRanges[0].start)
    .lte("entry_date", monthRanges[monthRanges.length - 1].end);
  if (entriesErr) throw entriesErr;

  const monthlyHours = monthRanges.map((r) => {
    let billable = 0;
    let nonBillable = 0;
    for (const e of entries ?? []) {
      if (e.entry_date < r.start || e.entry_date > r.end) continue;
      const hours = Number(e.hours ?? 0);
      if (e.project_id) billable += hours;
      else nonBillable += hours;
    }
    return { label: r.label, billable: Math.round(billable * 100) / 100, nonBillable: Math.round(nonBillable * 100) / 100 };
  });

  const billableSplit = monthlyHours.reduce(
    (acc, m) => ({ billable: acc.billable + m.billable, nonBillable: acc.nonBillable + m.nonBillable }),
    { billable: 0, nonBillable: 0 }
  );

  // Per-employee hours (last 6 months) to flag high overtime (> 60h total,
  // same threshold as the Owner's Snapshot report's redFlags logic).
  const empHoursMap = new Map<string, number>();
  for (const e of entries ?? []) {
    empHoursMap.set(e.employee_id, (empHoursMap.get(e.employee_id) ?? 0) + Number(e.hours ?? 0));
  }
  const overtimeFlags = [...empHoursMap.entries()]
    .filter(([, hours]) => hours > 60)
    .map(([id, hours]) => ({ name: userById.get(id)?.name ?? id, hours }))
    .sort((a, b) => b.hours - a.hours)
    .slice(0, 8);

  // This week's submission compliance (Mon-Fri), same pattern as the
  // Owner's Snapshot report.
  const day = now.getDay();
  const isoWeekday = day === 0 ? 7 : day;
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - (isoWeekday - 1));
  const weekdayDates: string[] = [];
  for (let i = 0; i < 5; i++) {
    const d = new Date(startOfWeek);
    d.setDate(startOfWeek.getDate() + i);
    weekdayDates.push(d.toISOString().slice(0, 10));
  }
  const { data: submittedDocs, error: subErr } = await supabaseAdmin
    .from("submitted_days")
    .select("employee_id, entry_date")
    .gte("entry_date", weekdayDates[0])
    .lte("entry_date", weekdayDates[weekdayDates.length - 1]);
  if (subErr) throw subErr;

  const submittedByEmployee = new Map<string, Set<string>>();
  for (const s of submittedDocs ?? []) {
    if (!submittedByEmployee.has(s.employee_id)) submittedByEmployee.set(s.employee_id, new Set());
    submittedByEmployee.get(s.employee_id)!.add(s.entry_date);
  }
  const compliance = employees
    .map((emp) => {
      const submitted = submittedByEmployee.get(emp.id) ?? new Set();
      const missing = weekdayDates.filter((d) => !submitted.has(d));
      return { name: emp.name, compliant: missing.length === 0, missingDays: missing.length };
    })
    .sort((a, b) => Number(a.compliant) - Number(b.compliant));

  // Top 5 projects by hours (last 6 months).
  const { data: allProjects, error: projErr } = await supabaseAdmin.from("projects").select("id, name, status, project_type");
  if (projErr) throw projErr;
  const projectMap = new Map((allProjects ?? []).map((p) => [p.id, p]));

  const projHours = new Map<string, number>();
  for (const e of entries ?? []) {
    if (!e.project_id) continue;
    projHours.set(e.project_id, (projHours.get(e.project_id) ?? 0) + Number(e.hours ?? 0));
  }
  const topProjects = [...projHours.entries()]
    .map(([id, hours]) => ({ name: projectMap.get(id)?.name ?? "Unknown project", hours }))
    .sort((a, b) => b.hours - a.hours)
    .slice(0, 5);

  const statusCounts: Record<string, number> = {};
  const typeCountsMap: Record<string, number> = {};
  for (const p of allProjects ?? []) {
    statusCounts[p.status] = (statusCounts[p.status] ?? 0) + 1;
    typeCountsMap[p.project_type] = (typeCountsMap[p.project_type] ?? 0) + 1;
  }
  const typeCounts = Object.entries(typeCountsMap).map(([name, value]) => ({ name, value }));

  return { monthlyHours, billableSplit, statusCounts, typeCounts, compliance, topProjects, overtimeFlags };
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string | string[];
    project_type?: string | string[];
    search_term?: string;
    page?: string;
  }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const resolvedSearchParams = await searchParams;
  const statusesParam = resolvedSearchParams.status;
  const selectedStatuses = Array.isArray(statusesParam)
    ? statusesParam
    : statusesParam
    ? [statusesParam]
    : [];
  const typesParam = resolvedSearchParams.project_type;
  const selectedTypes = Array.isArray(typesParam) ? typesParam : typesParam ? [typesParam] : [];
  const searchTerm = (resolvedSearchParams.search_term ?? "").trim();
  const page = Math.max(1, parseInt(resolvedSearchParams.page ?? "1", 10) || 1);

  // Status counts are computed from a lightweight count-only query per
  // status (not the paginated page's rows) so the stat cards always
  // reflect the whole table, independent of which page is being viewed.
  const counts = {
    active: 0,
    completed: 0,
    "re-work": 0,
    archived: 0,
  };
  const [
    { count: activeCount, error: activeErr },
    { count: completedCount, error: completedErr },
    { count: reworkCount, error: reworkErr },
    { count: archivedCount, error: archivedErr },
    { count: totalCount, error: totalErr },
  ] = await Promise.all([
    supabaseAdmin.from("projects").select("*", { count: "exact", head: true }).eq("status", "active"),
    supabaseAdmin.from("projects").select("*", { count: "exact", head: true }).eq("status", "completed"),
    supabaseAdmin.from("projects").select("*", { count: "exact", head: true }).eq("status", "re-work"),
    supabaseAdmin.from("projects").select("*", { count: "exact", head: true }).eq("status", "archived"),
    supabaseAdmin.from("projects").select("*", { count: "exact", head: true }),
  ]);
  const statCountErr = activeErr || completedErr || reworkErr || archivedErr || totalErr;
  if (statCountErr) {
    console.error("[dashboard] status count queries failed:", statCountErr);
    throw new Error(`Dashboard status count query failed: ${statCountErr.message}`);
  }
  counts.active = activeCount ?? 0;
  counts.completed = completedCount ?? 0;
  counts["re-work"] = reworkCount ?? 0;
  counts.archived = archivedCount ?? 0;
  const totalProjects = totalCount ?? 0;

  function applyFilters(query: ReturnType<typeof supabaseAdmin.from>) {
    let q = query.select("*", { count: "exact" });
    if (selectedStatuses.length > 0) {
      q = q.in("status", selectedStatuses);
    }
    if (selectedTypes.length > 0) {
      q = q.in("project_type", selectedTypes);
    }
    if (searchTerm) {
      const escaped = searchTerm.replace(/[%_]/g, "\\$&");
      q = q.or(`client_name.ilike.%${escaped}%,name.ilike.%${escaped}%,project_number.ilike.%${escaped}%,project_type.ilike.%${escaped}%`);
    }
    return q;
  }

  const { count: filteredCount, error: countErr } = await applyFilters(
    supabaseAdmin.from("projects")
  ).order("name");
  if (countErr) {
    console.error("[dashboard] filtered count query failed:", countErr);
    throw new Error(`Dashboard count query failed: ${countErr.message}`);
  }

  const totalFilteredProjects = filteredCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalFilteredProjects / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const from = (safePage - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const { data: pageProjects, error: pageErr } = await applyFilters(supabaseAdmin.from("projects"))
    .order("name")
    .range(from, to);
  if (pageErr) {
    console.error("[dashboard] page query failed:", pageErr);
    throw new Error(`Dashboard page query failed: ${pageErr.message}`);
  }

  const overviewData = session.role === "admin" ? await buildDashboardOverviewData() : null;
  const employeeOverviewData = session.role === "employee" ? await buildEmployeeOverviewData(session.userId) : null;

  return (
    <PageTransition>
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-3 border-b border-gray-200">
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/timesheet"
              className="btn-primary inline-flex items-center gap-2 px-3 py-1.5 text-sm"
            >
              <FaPlus className="h-3 w-3" /> Add Timesheet
            </Link>
            {session.role === "admin" && (
              <>
                <Link
                  href="/create_employee"
                  className="inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg text-white bg-emerald-600 hover:bg-emerald-700 transition-colors"
                >
                  <FaUserPlus className="h-3 w-3" /> Create Employee
                </Link>
                <Link
                  href="/database_stats"
                  className="inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg text-white bg-sky-600 hover:bg-sky-700 transition-colors"
                >
                  <FaDatabase className="h-3 w-3" /> Database Stats
                </Link>
              </>
            )}
          </div>
        </div>

        {overviewData && (
          <div className="mb-6">
            <DashboardOverview {...overviewData} />
          </div>
        )}

        {employeeOverviewData && (
          <div className="mb-6">
            <EmployeeOverview {...employeeOverviewData} />
          </div>
        )}

        {session.role === "admin" && <DashboardStats counts={counts} total={totalProjects} />}

        <DashboardProjectsTable
          projects={(pageProjects ?? []) as Project[]}
          page={safePage}
          totalPages={totalPages}
          totalItems={totalFilteredProjects}
          isAdmin={session.role === "admin"}
        />
      </div>
    </PageTransition>
  );
}
