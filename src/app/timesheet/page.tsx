import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getDateInfoForMonth, todayYearMonth } from "@/lib/dateUtils";
import { CATEGORIES_FOR_GRID } from "@/lib/constants";
import { getTimesheetTaxonomy } from "@/lib/data";
import { buildProjectTaskMap, buildProjectScopeNameMap } from "@/lib/taxonomy";
import { filterSelectableProjects } from "@/lib/projectVisibility";
import type { Project, ProjectScope, TimesheetEntry } from "@/lib/types";
import PageTransition from "@/components/PageTransition";
import TimesheetGrid, { type GridEntryValue } from "@/components/TimesheetGrid";

// This is the single most-used page in the app — every employee opens it
// daily. If supabase_patch_9_projects_and_taxonomy.sql hasn't been run
// yet (or a project genuinely has no scope assigned), this must NOT
// break the comment dropdown: an empty/undefined map here makes
// CommentModal fall back to the original flat COMMENT_CATEGORIES list
// automatically (see CommentModal.tsx's categoryOptions fallback).
// Both maps come from ONE taxonomy fetch — no second query.
async function getTaxonomyMapsSafely(): Promise<{
  projectTaskMap: Record<string, string[]> | undefined;
  projectScopeNames: Record<string, string[]> | undefined;
  scopes: ProjectScope[];
}> {
  try {
    const taxonomy = await getTimesheetTaxonomy();
    return {
      projectTaskMap: buildProjectTaskMap(taxonomy),
      projectScopeNames: buildProjectScopeNameMap(taxonomy),
      scopes: taxonomy.scopes,
    };
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === "PGRST205" || code === "PGRST204") {
      return { projectTaskMap: undefined, projectScopeNames: undefined, scopes: [] };
    }
    throw err;
  }
}

export const dynamic = "force-dynamic";

export default async function TimesheetPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; year?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const resolvedSearchParams = await searchParams;
  const { year: defYear, month: defMonth } = todayYearMonth();
  const year = parseInt(resolvedSearchParams.year ?? "", 10) || defYear;
  const month = parseInt(resolvedSearchParams.month ?? "", 10) || defMonth;

  const dateInfo = getDateInfoForMonth(year, month);
  const firstDate = dateInfo[0].date;
  const lastDate = dateInfo[dateInfo.length - 1].date;
  // The "finish last week before starting a new one" gate needs to check
  // the preceding Mon-Fri week for each visible weekday, which can fall up
  // to ~13 days before the 1st of the viewed month — so submittedDates
  // must cover that lookback window too, not just the visible month,
  // otherwise the client would wrongly treat an already-submitted prior
  // week as incomplete just because it's outside the fetched range.
  const lookbackStart = (() => {
    const [y, m, d] = firstDate.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() - 14);
    return dt.toISOString().slice(0, 10);
  })();

  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;

  const [
    { data: allProjects, error: projErr },
    { data: entries, error: entErr },
    { data: submitted, error: subErr },
    { data: yearEntries, error: yearErr },
    { projectTaskMap, projectScopeNames, scopes },
  ] = await Promise.all([
    supabaseAdmin.from("projects").select("*").order("name"),
    supabaseAdmin
      .from("timesheet_entries")
      .select("*")
      .eq("employee_id", session.userId)
      .gte("entry_date", firstDate)
      .lte("entry_date", lastDate),
    supabaseAdmin
      .from("submitted_days")
      .select("entry_date, total_hours")
      .eq("employee_id", session.userId)
      .gte("entry_date", lookbackStart)
      .lte("entry_date", lastDate),
    // Mirrors v1's /timesheet route exactly: "Special Vacation" and
    // "Special Vacation Banking" on this page's metric card are a
    // YEAR-TO-DATE total (Jan 1 - Dec 31 of the selected year), genuinely
    // independent of the month-scoped queries above (PTO/Vacation are
    // month-scoped, same as the grid itself) — fetched alongside them
    // rather than after, since neither depends on the other.
    supabaseAdmin
      .from("timesheet_entries")
      .select("category, hours")
      .eq("employee_id", session.userId)
      .gte("entry_date", yearStart)
      .lte("entry_date", yearEnd)
      .in("category", ["Special Vacation", "Special Vacation Banking"]),
    getTaxonomyMapsSafely(),
  ]);

  if (projErr) throw projErr;
  if (entErr) throw entErr;
  if (subErr) throw subErr;
  if (yearErr) throw yearErr;

  // Build entries keyed by date -> rowKey -> {hours, comment}
  const entriesByDate: Record<string, Record<string, GridEntryValue>> = {};
  for (const e of (entries ?? []) as TimesheetEntry[]) {
    const rowKey = e.project_id ? `p:${e.project_id}` : `c:${e.category}`;
    entriesByDate[e.entry_date] ??= {};
    entriesByDate[e.entry_date][rowKey] = {
      hours: Number(e.hours ?? 0),
      comment: e.comment ?? "",
    };
  }

  const submittedDates = new Set((submitted ?? []).map((s) => s.entry_date));

  let specialVacationHoursYear = 0;
  let specialVacationBankedYear = 0;
  for (const e of yearEntries ?? []) {
    const hours = Number(e.hours ?? 0);
    if (e.category === "Special Vacation") specialVacationHoursYear += hours;
    else if (e.category === "Special Vacation Banking") specialVacationBankedYear += hours;
  }

  const projects = (allProjects ?? []) as Project[];
  // v3.0 (supabase_patch_12): the FULL list still goes to `projects` so
  // rows the employee already has hours against keep rendering their
  // proper name/number even if narrowed out of visibility later — only
  // the "add a new project" picker is scoped to what this session may add.
  const selectableProjects = filterSelectableProjects(projects, session);

  return (
    <PageTransition>
      <TimesheetGrid
        key={`${year}-${month}`}
        projects={projects}
        selectableProjects={selectableProjects}
        categories={[...CATEGORIES_FOR_GRID]}
        dateInfo={dateInfo}
        entriesByDate={entriesByDate}
        submittedDates={[...submittedDates]}
        year={year}
        month={month}
        readOnly={false}
        specialVacationHoursYear={specialVacationHoursYear}
        specialVacationBankedYear={specialVacationBankedYear}
        isAdminViewer={session.role === "admin"}
        projectTaskMap={projectTaskMap}
        projectScopeNames={projectScopeNames}
        scopes={scopes}
      />
    </PageTransition>
  );
}
