import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAllProjects, getAllUsers, toProjectMap, toUserMap } from "@/lib/data";

// Mirrors v1's /export/csv: admin exports every entry, an employee exports
// only their own. Same columns: Employee, Date, Project/Category, Hours, Comments.
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const [projects, users] = await Promise.all([getAllProjects(), getAllUsers()]);
  const projectMap = toProjectMap(projects);
  const userMap = toUserMap(users);

  let query = supabaseAdmin
    .from("timesheet_entries")
    .select("employee_id, entry_date, project_id, category, hours, comment")
    .order("employee_id")
    .order("entry_date");

  if (session.role !== "admin") {
    query = query.eq("employee_id", session.userId);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = ["Employee,Date,Project/Category,Hours,Comments"];
  for (const e of data ?? []) {
    const employeeName = userMap[e.employee_id]?.name ?? e.employee_id;
    const projectOrCategory = e.project_id
      ? projectMap[e.project_id]?.name ?? e.project_id
      : e.category ?? "";
    const comment = (e.comment ?? "").replace(/"/g, '""');
    rows.push(
      [
        csvEscape(employeeName),
        e.entry_date,
        csvEscape(projectOrCategory),
        String(e.hours ?? 0),
        `"${comment}"`,
      ].join(",")
    );
  }

  const csv = rows.join("\n");
  const filename = `timesheet_report_${new Date().toISOString().slice(0, 10).replace(/-/g, "")}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
