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

  const [{ data: entries, error }, { data: projectRows, error: projectsError }] = await Promise.all([
    supabaseAdmin
      .from("timesheet_entries")
      .select("employee_id, project_id, hours")
      .gte("entry_date", monthFirstDate)
      .lte("entry_date", monthLastDate)
      .not("project_id", "is", null),
    supabaseAdmin.from("projects").select("client_name"),
  ]);
  if (error) throw error;
  if (projectsError) throw projectsError;

  const employeeIds = new Set<string>();
  const projectIds = new Set<string>();
  let totalHours = 0;
  for (const e of entries ?? []) {
    employeeIds.add(e.employee_id);
    if (e.project_id) projectIds.add(e.project_id);
    totalHours += Number(e.hours ?? 0);
  }

  const clients = [...new Set((projectRows ?? []).map((p) => p.client_name?.trim()).filter((c): c is string => !!c))].sort(
    (a, b) => a.localeCompare(b)
  );

  return (
    <PageTransition>
      <ExportTimesheetClient
        year={year}
        month={month}
        employeeCount={employeeIds.size}
        projectCount={projectIds.size}
        totalHours={totalHours}
        clients={clients}
      />
    </PageTransition>
  );
}
