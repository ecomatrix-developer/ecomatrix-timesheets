import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getAllUsers, getAllProjects, toProjectMap } from "@/lib/data";
import { buildGridFromEntries, previousWeekRange } from "@/lib/reportData";
import { renderPdfInChildProcess } from "@/lib/pdf/renderInChildProcess";
import { sendReportEmail } from "@/lib/mailer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { TimesheetEntry } from "@/lib/types";

/**
 * Mirrors v1's /run-backup-now, which generates AND EMAILS every employee's
 * weekly timesheet PDF. SECURITY FIX vs v1: that route had NO auth check at
 * all — any anonymous visitor could trigger PDF generation and outbound
 * email. Here it requires an authenticated admin session.
 */
export async function POST() {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { dates } = previousWeekRange();
  const [users, projects, { data: weekEntries, error: entriesErr }] = await Promise.all([
    getAllUsers(),
    getAllProjects(),
    supabaseAdmin
      .from("timesheet_entries")
      .select("*")
      .gte("entry_date", dates[0])
      .lte("entry_date", dates[dates.length - 1]),
  ]);
  if (entriesErr) throw entriesErr;
  const employees = users.filter((u) => u.role === "employee");
  const projectMap = toProjectMap(projects);
  const adminEmail = process.env.ADMIN_EMAIL;

  // One query for every employee's week instead of one query per employee.
  const entriesByEmployee = new Map<string, TimesheetEntry[]>();
  for (const e of (weekEntries ?? []) as TimesheetEntry[]) {
    const list = entriesByEmployee.get(e.employee_id);
    if (list) list.push(e);
    else entriesByEmployee.set(e.employee_id, [e]);
  }

  const results: { username: string; emailed: boolean; reason?: string }[] = [];

  for (const emp of employees) {
    const grid = buildGridFromEntries(emp, dates, projectMap, entriesByEmployee.get(emp.id) ?? []);
    // Rendered in a separate child process — @react-pdf/renderer is
    // incompatible with the React 19 canary Next.js's server runtime
    // substitutes in-process. See renderInChildProcess.ts for details.
    const pdfBuffer = await renderPdfInChildProcess(
      "lib/pdf/WeeklyEmployeeReport.tsx",
      "WeeklyEmployeeReportDoc",
      { grid }
    );

    if (adminEmail) {
      const emailResult = await sendReportEmail(
        [adminEmail],
        `Weekly Timesheet Backup: ${emp.username} (Week of ${dates[0]})`,
        `Attached is the timesheet report for ${emp.username} for the week of ${dates[0]}.`,
        { filename: `timesheet_${emp.username}_${dates[0]}.pdf`, content: pdfBuffer }
      );
      results.push({ username: emp.username, emailed: emailResult.sent, reason: emailResult.reason });
    } else {
      results.push({ username: emp.username, emailed: false, reason: "ADMIN_EMAIL not configured" });
    }
  }

  return NextResponse.json({
    success: true,
    week: { start: dates[0], end: dates[dates.length - 1] },
    results,
  });
}
