import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getDateInfoForMonth, todayYearMonth } from "@/lib/dateUtils";
import PageTransition from "@/components/PageTransition";
import ExportTimesheetClient from "./ExportTimesheetClient";

export const dynamic = "force-dynamic";

export default async function ExportTimesheetPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; year?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "admin") redirect("/dashboard");

  const resolvedSearchParams = await searchParams;
  const { year: defaultYear, month: defaultMonth } = todayYearMonth();
  const year = parseInt(resolvedSearchParams.year ?? "", 10) || defaultYear;
  const month = parseInt(resolvedSearchParams.month ?? "", 10) || defaultMonth;

  const dateInfo = getDateInfoForMonth(year, month);
  const monthFirstDate = dateInfo[0].date;
  const monthLastDate = dateInfo[dateInfo.length - 1].date;

  const { data: entries, error } = await supabaseAdmin
    .from("timesheet_entries")
    .select("employee_id, project_id, hours")
    .gte("entry_date", monthFirstDate)
    .lte("entry_date", monthLastDate)
    .not("project_id", "is", null);
  if (error) throw error;

  const employeeIds = new Set<string>();
  const projectIds = new Set<string>();
  let totalHours = 0;
  for (const e of entries ?? []) {
    employeeIds.add(e.employee_id);
    if (e.project_id) projectIds.add(e.project_id);
    totalHours += Number(e.hours ?? 0);
  }

  return (
    <PageTransition>
      <ExportTimesheetClient
        year={year}
        month={month}
        employeeCount={employeeIds.size}
        projectCount={projectIds.size}
        totalHours={totalHours}
      />
    </PageTransition>
  );
}
