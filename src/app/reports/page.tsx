import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAllUsers, getAllProjects, toProjectMap } from "@/lib/data";
import { getDateInfoForMonth, todayYearMonth } from "@/lib/dateUtils";
import { computeDailyOvertime, computePtoTotal } from "@/lib/timesheetMath";
import { PAGE_SIZE } from "@/lib/constants";
import type { Project, TimesheetEntry } from "@/lib/types";
import PageTransition from "@/components/PageTransition";
import ReportsClient from "./ReportsClient";
import type { GridEntryValue } from "@/components/TimesheetGrid";

export const dynamic = "force-dynamic";

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{
    employee?: string;
    month?: string;
    year?: string;
    submissionsPage?: string;
    totalsPage?: string;
    psPage?: string;
    psStatus?: string | string[];
    psSearch?: string;
  }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "admin") redirect("/dashboard");

  const resolvedSearchParams = await searchParams;
  const { year: defYear, month: defMonth } = todayYearMonth();
  const year = parseInt(resolvedSearchParams.year ?? "", 10) || defYear;
  const month = parseInt(resolvedSearchParams.month ?? "", 10) || defMonth;
  const selectedUsername = resolvedSearchParams.employee ?? "";
  const submissionsPage = Math.max(1, parseInt(resolvedSearchParams.submissionsPage ?? "1", 10) || 1);
  const totalsPage = Math.max(1, parseInt(resolvedSearchParams.totalsPage ?? "1", 10) || 1);
  const psPage = Math.max(1, parseInt(resolvedSearchParams.psPage ?? "1", 10) || 1);

  // Project Summary status filter — defaults to "active" only when the
  // filter has never been touched (no `psStatus` key at all), same pattern
  // as the standalone Projects page.
  const psStatusParam = resolvedSearchParams.psStatus;
  const psStatusWasTouched = "psStatus" in resolvedSearchParams;
  const psSelectedStatuses = Array.isArray(psStatusParam)
    ? psStatusParam
    : psStatusParam
    ? [psStatusParam]
    : psStatusWasTouched
    ? []
    : ["active"];
  const psSearch = (resolvedSearchParams.psSearch ?? "").trim().toLowerCase();

  const [users, projects] = await Promise.all([getAllUsers(), getAllProjects()]);
  const employees = users.filter((u) => u.role === "employee");
  const projectMap = toProjectMap(projects);

  let selectedEmployee = null as null | (typeof users)[number];
  if (selectedUsername) {
    selectedEmployee = users.find((u) => u.username === selectedUsername) ?? null;
  }

  // Submission Log, Project Totals, and the Project Summary accordion only
  // make sense once an employee is selected (the UI hides these sections
  // entirely until then) — skip their queries otherwise.
  const userById = new Map(users.map((u) => [u.id, u]));
  let submissions: { employeeName: string; date: string; totalHours: number; submittedAt: string }[] = [];
  let submissionsTotal = 0;
  let submissionsTotalPages = 1;
  let safeSubmissionsPage = 1;
  let projectTotals: { label: string; hours: number }[] = [];
  let totalsTotalPages = 1;
  let safeTotalsPage = 1;
  let allProjectTotalsLength = 0;
  const projectTotalsById: Record<string, number> = {};

  if (selectedEmployee) {
    // Submission log for the selected employee — paginated server-side so
    // only PAGE_SIZE rows are ever fetched for the page shown.
    function submissionsBaseQuery() {
      return supabaseAdmin
        .from("submitted_days")
        .select("employee_id, entry_date, total_hours, submitted_at", { count: "exact" })
        .eq("employee_id", selectedEmployee!.id);
    }

    const { count: submissionsCount, error: subCountErr } = await submissionsBaseQuery();
    if (subCountErr) throw subCountErr;
    submissionsTotal = submissionsCount ?? 0;
    submissionsTotalPages = Math.max(1, Math.ceil(submissionsTotal / PAGE_SIZE));
    safeSubmissionsPage = Math.min(submissionsPage, submissionsTotalPages);
    const subFrom = (safeSubmissionsPage - 1) * PAGE_SIZE;
    const subTo = subFrom + PAGE_SIZE - 1;

    const { data: submissionLog, error: subLogErr } = await submissionsBaseQuery()
      .order("submitted_at", { ascending: false })
      .range(subFrom, subTo);
    if (subLogErr) throw subLogErr;

    submissions = (submissionLog ?? []).map((s) => ({
      employeeName: userById.get(s.employee_id)?.name ?? s.employee_id,
      date: s.entry_date,
      totalHours: Number(s.total_hours),
      submittedAt: s.submitted_at,
    }));

    // Aggregate project totals for the selected employee, SCOPED TO THE
    // SELECTED MONTH — mirrors v1's /reports exactly: its aggregation
    // pipeline filters by `date_filtered_queries`, which includes the same
    // month's date range used everywhere else on this page (the grid,
    // PTO/Vacation summaries, etc.), not the employee's entire history.
    // This also feeds the Project Summary accordion's per-project hours
    // badge below, which must match for the same reason.
    const dateInfo = getDateInfoForMonth(year, month);
    const monthFirstDate = dateInfo[0].date;
    const monthLastDate = dateInfo[dateInfo.length - 1].date;

    // Note: this still needs every matching timesheet_entries row to
    // compute the per-project sums in memory (Supabase's JS client has no
    // GROUP BY), but the RENDERED list below is paginated server-side so
    // the browser never has to mount more than PAGE_SIZE rows either.
    const { data: allEntries, error: allEntriesErr } = await supabaseAdmin
      .from("timesheet_entries")
      .select("project_id, category, hours, employee_id")
      .eq("employee_id", selectedEmployee.id)
      .gte("entry_date", monthFirstDate)
      .lte("entry_date", monthLastDate);
    if (allEntriesErr) throw allEntriesErr;

    const allProjectTotals: { label: string; hours: number }[] = [];
    const totalsMap = new Map<string, number>();
    for (const e of allEntries ?? []) {
      const key = e.project_id ? `p:${e.project_id}` : `c:${e.category}`;
      totalsMap.set(key, (totalsMap.get(key) ?? 0) + Number(e.hours ?? 0));
    }
    for (const [key, hours] of totalsMap.entries()) {
      if (key.startsWith("p:")) {
        const p = projectMap[key.slice(2)];
        allProjectTotals.push({ label: p ? `${p.client_name} — ${p.name}` : "Unknown project", hours });
      } else {
        allProjectTotals.push({ label: key.slice(2), hours });
      }
    }
    allProjectTotals.sort((a, b) => b.hours - a.hours);
    allProjectTotalsLength = allProjectTotals.length;

    totalsTotalPages = Math.max(1, Math.ceil(allProjectTotals.length / PAGE_SIZE));
    safeTotalsPage = Math.min(totalsPage, totalsTotalPages);
    const totalsFrom = (safeTotalsPage - 1) * PAGE_SIZE;
    projectTotals = allProjectTotals.slice(totalsFrom, totalsFrom + PAGE_SIZE);

    // Project-id-keyed totals for the "Project Summary" accordion's inline
    // hours badge (separate from the label-keyed list above).
    for (const e of allEntries ?? []) {
      if (!e.project_id) continue;
      projectTotalsById[e.project_id] = (projectTotalsById[e.project_id] ?? 0) + Number(e.hours ?? 0);
    }
  }

  // Mirrors v1's "Project Summary" accordion exactly: v1's equivalent list
  // (`projects_with_hours`) is explicitly built as `[p for p in all_projects
  // if project_totals.get(p['id'], 0) > 0]` — i.e. ONLY projects the
  // selected employee actually has hours > 0 on (for the selected month,
  // same scope as projectTotalsById above), never every project in the
  // database. Filterable by status (defaults to "active" projects only)
  // and a free-text search across name/number/client, same as v1's
  // ps_page pagination.
  const psFilteredProjects = projects.filter((p) => {
    if ((projectTotalsById[p.id] ?? 0) <= 0) return false;
    if (psSelectedStatuses.length > 0 && !psSelectedStatuses.includes(p.status)) return false;
    if (psSearch) {
      const haystack = `${p.name} ${p.project_number ?? ""} ${p.client_name}`.toLowerCase();
      if (!haystack.includes(psSearch)) return false;
    }
    return true;
  });
  const psTotalPages = Math.max(1, Math.ceil(psFilteredProjects.length / PAGE_SIZE));
  const safePsPage = Math.min(psPage, psTotalPages);
  const psFrom = (safePsPage - 1) * PAGE_SIZE;
  const paginatedProjects = [...psFilteredProjects]
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(psFrom, psFrom + PAGE_SIZE);

  // Detailed grid + PTO/overtime summary for selected employee
  let gridData = null;
  if (selectedEmployee) {
    const dateInfo = getDateInfoForMonth(year, month);
    const firstDate = dateInfo[0].date;
    const lastDate = dateInfo[dateInfo.length - 1].date;

    const { data: entries, error: entErr } = await supabaseAdmin
      .from("timesheet_entries")
      .select("*")
      .eq("employee_id", selectedEmployee.id)
      .gte("entry_date", firstDate)
      .lte("entry_date", lastDate);
    if (entErr) throw entErr;

    const { data: submittedDays, error: sdErr } = await supabaseAdmin
      .from("submitted_days")
      .select("entry_date, total_hours")
      .eq("employee_id", selectedEmployee.id)
      .gte("entry_date", firstDate)
      .lte("entry_date", lastDate);
    if (sdErr) throw sdErr;

    const entriesByDate: Record<string, Record<string, GridEntryValue>> = {};
    const projectIdsWithEntries = new Set<string>();
    const byCategoryTotals: Record<string, number> = {};

    for (const e of (entries ?? []) as TimesheetEntry[]) {
      const rowKey = e.project_id ? `p:${e.project_id}` : `c:${e.category}`;
      entriesByDate[e.entry_date] ??= {};
      entriesByDate[e.entry_date][rowKey] = {
        hours: Number(e.hours ?? 0),
        comment: e.comment ?? "",
      };
      if (e.project_id) projectIdsWithEntries.add(e.project_id);
      if (e.category) byCategoryTotals[e.category] = (byCategoryTotals[e.category] ?? 0) + Number(e.hours ?? 0);
    }

    const ptoSummary = computePtoTotal(byCategoryTotals);
    // Mirrors v1's /reports vacation_summary: month-scoped, same range as
    // PTO above (NOT the year-wide figure — that's special vacation only).
    const vacationSummary = byCategoryTotals["Vacation"] ?? 0;

    let overtimeSummary = 0;
    for (const d of dateInfo) {
      const dayTotal = Object.values(entriesByDate[d.date] ?? {}).reduce((s, v) => s + v.hours, 0);
      overtimeSummary += computeDailyOvertime(d.date, dayTotal);
    }

    const submittedMap = new Map((submittedDays ?? []).map((s) => [s.entry_date, Number(s.total_hours)]));
    const monthlyTotal = [...submittedMap.values()].reduce((a, b) => a + b, 0);

    // Mirrors v1's /reports spv_hours_year/spv_banked_year: a genuinely
    // separate YEAR-TO-DATE query (Jan 1 - Dec 31 of the selected year),
    // not derived from the month-scoped entries fetched above.
    const yearStart = `${year}-01-01`;
    const yearEnd = `${year}-12-31`;
    const { data: yearEntries, error: yearErr } = await supabaseAdmin
      .from("timesheet_entries")
      .select("category, hours")
      .eq("employee_id", selectedEmployee.id)
      .gte("entry_date", yearStart)
      .lte("entry_date", yearEnd)
      .in("category", ["Special Vacation", "Special Vacation Banking"]);
    if (yearErr) throw yearErr;

    let specialVacationYear = 0;
    let specialVacationBankedYear = 0;
    for (const e of yearEntries ?? []) {
      const hours = Number(e.hours ?? 0);
      if (e.category === "Special Vacation") specialVacationYear += hours;
      else if (e.category === "Special Vacation Banking") specialVacationBankedYear += hours;
    }

    gridData = {
      dateInfo,
      entriesByDate,
      submittedDates: [...submittedMap.keys()],
      monthlyTotal,
      ptoSummary,
      vacationSummary,
      specialVacationYear,
      specialVacationBankedYear,
      overtimeSummary,
      projectsWithEntries: projects.filter((p: Project) => projectIdsWithEntries.has(p.id)),
    };
  }

  return (
    <PageTransition>
      <ReportsClient
        employees={employees}
        selectedUsername={selectedUsername}
        year={year}
        month={month}
        submissions={submissions}
        submissionsPage={safeSubmissionsPage}
        submissionsTotalPages={submissionsTotalPages}
        submissionsTotal={submissionsTotal}
        projectTotals={projectTotals}
        totalsPage={safeTotalsPage}
        totalsTotalPages={totalsTotalPages}
        totalsTotal={allProjectTotalsLength}
        paginatedProjects={paginatedProjects}
        projectTotalsById={projectTotalsById}
        psPage={safePsPage}
        psTotalPages={psTotalPages}
        psTotal={psFilteredProjects.length}
        psSelectedStatuses={psSelectedStatuses}
        psSearch={resolvedSearchParams.psSearch ?? ""}
        gridData={gridData}
      />
    </PageTransition>
  );
}
