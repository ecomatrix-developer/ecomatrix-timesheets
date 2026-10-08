import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getDateInfoForMonth, todayYearMonth } from "@/lib/dateUtils";
import { CATEGORIES_FOR_GRID } from "@/lib/constants";
import type { Project, TimesheetEntry } from "@/lib/types";
import PageTransition from "@/components/PageTransition";
import TimesheetGrid, { type GridEntryValue } from "@/components/TimesheetGrid";

export const dynamic = "force-dynamic";

// This route replaces v1's /admin/timesheet_view/<username>, which raised a
// NameError on every request (app.py:1938 referenced `dates_in_month`, a
// name that was never defined in that function — the local variable was
// actually named `dates`). Here the date list is computed once, correctly,
// via getDateInfoForMonth, with no such bug possible.
export default async function AdminTimesheetViewPage({
  params,
  searchParams,
}: {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ month?: string; year?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "admin") redirect("/login");

  const { username: rawUsername } = await params;
  const resolvedSearchParams = await searchParams;
  const username = decodeURIComponent(rawUsername);

  const { data: employee, error: userErr } = await supabaseAdmin
    .from("users")
    .select("id, name, username")
    .eq("username", username)
    .maybeSingle();
  if (userErr) throw userErr;
  if (!employee) notFound();

  const { year: defYear, month: defMonth } = todayYearMonth();
  const year = parseInt(resolvedSearchParams.year ?? "", 10) || defYear;
  const month = parseInt(resolvedSearchParams.month ?? "", 10) || defMonth;

  const dateInfo = getDateInfoForMonth(year, month);
  const firstDate = dateInfo[0].date;
  const lastDate = dateInfo[dateInfo.length - 1].date;

  const [{ data: allProjects, error: projErr }, { data: entries, error: entErr }, { data: submitted, error: subErr }] =
    await Promise.all([
      supabaseAdmin.from("projects").select("*").order("name"),
      supabaseAdmin
        .from("timesheet_entries")
        .select("*")
        .eq("employee_id", employee.id)
        .gte("entry_date", firstDate)
        .lte("entry_date", lastDate),
      supabaseAdmin
        .from("submitted_days")
        .select("entry_date, total_hours")
        .eq("employee_id", employee.id)
        .gte("entry_date", firstDate)
        .lte("entry_date", lastDate),
    ]);
  if (projErr) throw projErr;
  if (entErr) throw entErr;
  if (subErr) throw subErr;

  const entriesByDate: Record<string, Record<string, GridEntryValue>> = {};
  const projectIdsWithEntries = new Set<string>();
  for (const e of (entries ?? []) as TimesheetEntry[]) {
    const rowKey = e.project_id ? `p:${e.project_id}` : `c:${e.category}`;
    entriesByDate[e.entry_date] ??= {};
    entriesByDate[e.entry_date][rowKey] = {
      hours: Number(e.hours ?? 0),
      comment: e.comment ?? "",
    };
    if (e.project_id) projectIdsWithEntries.add(e.project_id);
  }

  const projectsWithEntries = ((allProjects ?? []) as Project[]).filter((p) =>
    projectIdsWithEntries.has(p.id)
  );
  const submittedDates = (submitted ?? []).map((s) => s.entry_date);

  return (
    <PageTransition>
      <TimesheetGrid
        key={`${year}-${month}`}
        projects={projectsWithEntries}
        categories={[...CATEGORIES_FOR_GRID]}
        dateInfo={dateInfo}
        entriesByDate={entriesByDate}
        submittedDates={submittedDates}
        year={year}
        month={month}
        readOnly
        employeeLabel={employee.name}
      />
    </PageTransition>
  );
}
