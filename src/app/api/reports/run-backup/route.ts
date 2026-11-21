import { NextRequest, NextResponse } from "next/server";
import { getSession, isSuperAdminOnly } from "@/lib/session";
import { getAllUsers, getAllProjects, toProjectMap } from "@/lib/data";
import { buildGridFromEntries, previousWeekRange } from "@/lib/reportData";
import { renderPdfInChildProcess } from "@/lib/pdf/renderInChildProcess";
import { sendReportEmail } from "@/lib/mailer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { TimesheetEntry } from "@/lib/types";

// Abeer, 2026-11-21: "weekly backup - save on drive... and send to
// anup@ecomatrix.io" — Drive upload deferred until real OAuth credentials
// for that account exist (see conversation); for now, emailed properly to
// both addresses he gave. Configurable via WEEKLY_BACKUP_RECIPIENTS
// (comma-separated) so this never needs a code change to adjust later —
// falls back to the two literal addresses if that env var isn't set.
function getBackupRecipients(): string[] {
  const configured = process.env.WEEKLY_BACKUP_RECIPIENTS;
  if (configured) {
    return configured.split(",").map((s) => s.trim()).filter(Boolean);
  }
  return ["anup@ecomatrix.io", "ervtool.ecomatrix@gmail.com"];
}

async function runWeeklyBackup() {
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
  const recipients = getBackupRecipients();

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

    if (recipients.length > 0) {
      const emailResult = await sendReportEmail(
        recipients,
        `Weekly Timesheet Backup: ${emp.username} (Week of ${dates[0]})`,
        `Attached is the timesheet report for ${emp.username} for the week of ${dates[0]}.`,
        { filename: `timesheet_${emp.username}_${dates[0]}.pdf`, content: pdfBuffer }
      );
      results.push({ username: emp.username, emailed: emailResult.sent, reason: emailResult.reason });
    } else {
      results.push({ username: emp.username, emailed: false, reason: "No backup recipients configured" });
    }
  }

  return {
    success: true,
    week: { start: dates[0], end: dates[dates.length - 1] },
    results,
  };
}

/**
 * Manual trigger (the "Run Backup Now" button on Database Stats) —
 * requires an authenticated Super Admin session, same as before.
 */
export async function POST() {
  const session = await getSession();
  if (!session || !isSuperAdminOnly(session)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }
  return NextResponse.json(await runWeeklyBackup());
}

/**
 * Automatic weekly trigger — Vercel Cron Jobs call routes via GET, not
 * POST, and have no browser session to check, so this is gated on
 * CRON_SECRET instead: Vercel sends `Authorization: Bearer $CRON_SECRET`
 * on every cron-invoked request (set CRON_SECRET in the Vercel project's
 * environment variables, and it's included automatically — see
 * vercel.json for the schedule). Without a matching header, this behaves
 * exactly like an unauthenticated request to any other admin route.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }
  return NextResponse.json(await runWeeklyBackup());
}
