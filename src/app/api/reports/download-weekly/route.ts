import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getUserByUsername, getAllProjects, toProjectMap } from "@/lib/data";
import { buildEmployeeWeeklyGrid } from "@/lib/reportData";
import { renderPdfInChildProcess } from "@/lib/pdf/renderInChildProcess";

// Mirrors v1's /download-report/<username>/<start>/<end> — admin-only PDF
// download of a single employee's weekly grid, generated in memory.
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const username = searchParams.get("username");
  const start = searchParams.get("start");
  const end = searchParams.get("end");

  if (!username || !start || !end) {
    return NextResponse.json({ error: "username, start and end are required" }, { status: 400 });
  }

  const employee = await getUserByUsername(username);
  if (!employee) {
    return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  }

  const dates: string[] = [];
  const cursor = new Date(start + "T00:00:00Z");
  const endDate = new Date(end + "T00:00:00Z");
  while (cursor <= endDate) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  const projects = await getAllProjects();
  const projectMap = toProjectMap(projects);
  const grid = await buildEmployeeWeeklyGrid(
    { id: employee.id, mongo_id: employee.mongo_id, username: employee.username, name: employee.name, role: employee.role, created_at: employee.created_at, updated_at: employee.updated_at },
    dates,
    projectMap
  );

  // Rendered in a separate child process — @react-pdf/renderer is
  // incompatible with the React 19 canary Next.js's server runtime
  // substitutes in-process. See renderInChildProcess.ts for details.
  const pdfBuffer = await renderPdfInChildProcess(
    "lib/pdf/WeeklyEmployeeReport.tsx",
    "WeeklyEmployeeReportDoc",
    { grid }
  );

  return new NextResponse(new Uint8Array(pdfBuffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="timesheet_${username}_${start}.pdf"`,
    },
  });
}
