import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAllProjects, getAllUsers, toProjectMap } from "@/lib/data";
import { getDateBuckets, resolveDateRange } from "@/lib/dateRange";
import PageTransition from "@/components/PageTransition";
import InsightsClient from "./InsightsClient";

export const dynamic = "force-dynamic";

// Mirrors v1's energy_categories list exactly (app.py /insights route).
const ENERGY_CATEGORIES = [
  "Geometry",
  "Thermal Template",
  "HVAC",
  "Simulation & QA/QC",
  "Reporting",
  "BIM-CAD",
  "BIM-REVIT",
  "Other",
];

export default async function InsightsPage({
  searchParams,
}: {
  searchParams: Promise<{
    employee_filter?: string;
    project_filter?: string;
    dateFrom?: string;
    dateTo?: string;
    datePreset?: string;
  }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "admin") redirect("/login");

  const resolvedSearchParams = await searchParams;
  const dateRange = resolveDateRange(resolvedSearchParams);
  const employeeFilter = resolvedSearchParams.employee_filter ?? "all";
  const projectFilter = resolvedSearchParams.project_filter ?? "all";

  const [projects, users] = await Promise.all([getAllProjects(), getAllUsers()]);
  const projectMap = toProjectMap(projects);
  const userById = new Map(users.map((u) => [u.id, u]));
  const employees = users.filter((u) => u.role === "employee");

  const { data: entries, error } = await supabaseAdmin
    .from("timesheet_entries")
    .select("project_id, category, employee_id, hours, comment, entry_date")
    .gte("entry_date", dateRange.from)
    .lte("entry_date", dateRange.to);
  if (error) throw error;

  const hoursByProject = new Map<string, number>();
  const hoursByEmployee = new Map<string, number>();

  for (const e of entries ?? []) {
    const hours = Number(e.hours ?? 0);
    // Mirrors v1 exactly: "Hours per Project" only ever includes entries
    // that resolve to a REAL project (its `project_df.isin(...)` filter) —
    // category-only rows (PTO, Vacation, etc.) are silently excluded from
    // this chart, not bucketed into a stand-in "Special Category" bar.
    if (e.project_id) {
      const projectLabel = projectMap[e.project_id]?.name ?? "Unknown Project";
      hoursByProject.set(projectLabel, (hoursByProject.get(projectLabel) ?? 0) + hours);
    }

    // "Hours per Employee" has no such filter in v1 — every entry counts,
    // project or category alike.
    const empName = userById.get(e.employee_id)?.name ?? e.employee_id;
    hoursByEmployee.set(empName, (hoursByEmployee.get(empName) ?? 0) + hours);
  }

  const projectData = [...hoursByProject.entries()]
    .map(([name, hours]) => ({ name, hours: Math.round(hours * 100) / 100 }))
    .sort((a, b) => b.hours - a.hours)
    .slice(0, 25);

  const employeeData = [...hoursByEmployee.entries()]
    .map(([name, hours]) => ({ name, hours: Math.round(hours * 100) / 100 }))
    .sort((a, b) => b.hours - a.hours);

  // --- "Energy Modeling Category Hours" (v1's third graph) ---
  // Extract per-category hours from each entry's structured comment
  // breakdown (the same {hours, category}[] JSON the CommentModal writes)
  // — matches v1's exact "use_comment_breakdown" logic so hours are never
  // double-counted between the grid total and the breakdown.
  const categoryTotals = new Map<string, number>();
  for (const e of entries ?? []) {
    if (employeeFilter !== "all" && e.employee_id !== employeeFilter) continue;
    if (projectFilter !== "all" && e.project_id !== projectFilter) continue;

    const commentStr = (e.comment ?? "").trim();
    if (commentStr.startsWith("[")) {
      try {
        const parsed = JSON.parse(commentStr);
        if (Array.isArray(parsed) && parsed.length > 0) {
          for (const item of parsed) {
            const category = item.category ?? "Uncategorized";
            const hours = Number(item.hours ?? 0);
            if (ENERGY_CATEGORIES.includes(category)) {
              categoryTotals.set(category, (categoryTotals.get(category) ?? 0) + hours);
            }
          }
        }
      } catch {
        // fall through — not a structured comment, no category breakdown
      }
    }
  }

  const energyCategoryData = [...categoryTotals.entries()]
    .map(([name, hours]) => ({ name, hours: Math.round(hours * 100) / 100 }))
    .sort((a, b) => b.hours - a.hours);

  // --- New: Billable vs Non-Billable split (all entries) ---
  let billableHours = 0;
  let nonBillableHours = 0;
  for (const e of entries ?? []) {
    const hours = Number(e.hours ?? 0);
    if (e.project_id) billableHours += hours;
    else nonBillableHours += hours;
  }
  const billableData = [
    { name: "Billable", hours: Math.round(billableHours * 100) / 100 },
    { name: "Non-Billable", hours: Math.round(nonBillableHours * 100) / 100 },
  ];

  // --- Range hours trend, grouped daily for short windows and weekly for longer windows ---
  const monthlyTrend = getDateBuckets(dateRange.from, dateRange.to).map((bucket) => {
    let hours = 0;
    for (const e of entries ?? []) {
      if (e.entry_date < bucket.from || e.entry_date > bucket.to) continue;
      hours += Number(e.hours ?? 0);
    }
    return { name: bucket.label, hours: Math.round(hours * 100) / 100 };
  });

  // --- New: Project status breakdown ---
  const statusTotals = new Map<string, number>();
  for (const p of projects) {
    statusTotals.set(p.status, (statusTotals.get(p.status) ?? 0) + 1);
  }
  const statusData = [...statusTotals.entries()].map(([name, value]) => ({ name, hours: value }));

  return (
    <PageTransition>
      <InsightsClient
        projectData={projectData}
        employeeData={employeeData}
        energyCategoryData={energyCategoryData}
        billableData={billableData}
        monthlyTrend={monthlyTrend}
        statusData={statusData}
        employees={employees.map((u) => ({ id: u.id, name: u.name }))}
        projects={projects.map((p) => ({ id: p.id, name: p.name }))}
        selectedEmployee={employeeFilter}
        selectedProject={projectFilter}
        dateRange={dateRange}
      />
    </PageTransition>
  );
}
