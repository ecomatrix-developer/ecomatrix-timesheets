import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAllUsers } from "@/lib/data";

export const dynamic = "force-dynamic";

/**
 * Mirrors v1's /reports/project/<project_id> exactly: returns the
 * project's summary (total hours, unique employees, entry count, date
 * range), a per-employee hours breakdown, and the raw entry list — used
 * by the Reports page's project drill-down accordion.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { id: projectId } = await params;

  const { data: project, error: projectErr } = await supabaseAdmin
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .maybeSingle();
  if (projectErr) return NextResponse.json({ error: projectErr.message }, { status: 500 });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const { data: entries, error: entriesErr } = await supabaseAdmin
    .from("timesheet_entries")
    .select("*")
    .eq("project_id", projectId)
    .order("entry_date");
  if (entriesErr) return NextResponse.json({ error: entriesErr.message }, { status: 500 });

  const users = await getAllUsers();
  const userById = new Map(users.map((u) => [u.id, u]));

  const totalHours = (entries ?? []).reduce((sum, e) => sum + Number(e.hours ?? 0), 0);
  const uniqueEmployees = new Set((entries ?? []).map((e) => e.employee_id).filter(Boolean));

  let dateRange: { start?: string; end?: string } = {};
  if (entries && entries.length > 0) {
    const dates = entries.map((e) => e.entry_date).sort();
    dateRange = { start: dates[0], end: dates[dates.length - 1] };
  }

  const employeeSummary: Record<string, { name: string; total_hours: number }> = {};
  for (const e of entries ?? []) {
    const empId = e.employee_id;
    if (!empId) continue;
    if (!employeeSummary[empId]) {
      employeeSummary[empId] = { name: userById.get(empId)?.name ?? empId, total_hours: 0 };
    }
    employeeSummary[empId].total_hours += Number(e.hours ?? 0);
  }

  const safeEntries = (entries ?? []).map((e) => ({
    id: e.id,
    employee: userById.get(e.employee_id)?.name ?? e.employee_id,
    date: e.entry_date,
    hours: Number(e.hours ?? 0),
    comment: e.comment,
  }));

  return NextResponse.json({
    project: {
      id: project.id,
      name: project.name,
      project_number: project.project_number,
      description: project.description,
      status: project.status,
    },
    summary: {
      total_hours: totalHours,
      unique_employees: uniqueEmployees.size,
      total_entries: (entries ?? []).length,
      date_range: dateRange,
    },
    employee_summary: employeeSummary,
    entries: safeEntries,
  });
}
