import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getDateInfoForMonth, todayYearMonth } from "@/lib/dateUtils";
import { CATEGORIES_FOR_GRID } from "@/lib/constants";
import type { Project, TimesheetEntry } from "@/lib/types";
import PageTransition from "@/components/PageTransition";
import TimesheetGrid, { type GridEntryValue } from "@/components/TimesheetGrid";

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

  const [{ data: allProjects, error: projErr }, { data: entries, error: entErr }, { data: submitted, error: subErr }] =
    await Promise.all([
      supabaseAdmin.from("projects").select("*").neq("status", "archived").order("name"),
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
    ]);

  if (projErr) throw projErr;
  if (entErr) throw entErr;
  if (subErr) throw subErr;

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

  // Mirrors v1's /timesheet route exactly: "Special Vacation" and "Special
  // Vacation Banking" on this page's metric card are a YEAR-TO-DATE total
  // (Jan 1 – Dec 31 of the selected year), a genuinely separate query from
  // every other metric on this page (PTO/Vacation are month-scoped, same
  // as the grid itself). This must not be derived from the month's
  // entriesByDate — that would silently understate it.
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;
  const { data: yearEntries, error: yearErr } = await supabaseAdmin
    .from("timesheet_entries")
    .select("category, hours")
    .eq("employee_id", session.userId)
    .gte("entry_date", yearStart)
    .lte("entry_date", yearEnd)
    .in("category", ["Special Vacation", "Special Vacation Banking"]);
  if (yearErr) throw yearErr;

  let specialVacationHoursYear = 0;
  let specialVacationBankedYear = 0;
  for (const e of yearEntries ?? []) {
    const hours = Number(e.hours ?? 0);
    if (e.category === "Special Vacation") specialVacationHoursYear += hours;
    else if (e.category === "Special Vacation Banking") specialVacationBankedYear += hours;
  }

  return (
    <PageTransition>
      <TimesheetGrid
        key={`${year}-${month}`}
        projects={(allProjects ?? []) as Project[]}
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
      />
    </PageTransition>
  );
}
