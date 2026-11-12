import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { buildMonthlyTimesheetWorkbook } from "@/lib/excel/monthlyTimesheetWorkbook";
import { MONTH_NAMES } from "@/lib/dateUtils";

function sanitizeFilenamePart(name: string): string {
  return name.replace(/[^a-zA-Z0-9 _-]/g, "").trim().replace(/\s+/g, "_") || "Client";
}

// Admin-only: regenerates the "Monthly time" workbook (the one Abeer used
// to assemble by hand) for a given year/month straight from the database.
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const year = parseInt(searchParams.get("year") ?? "", 10);
  const month = parseInt(searchParams.get("month") ?? "", 10);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return NextResponse.json({ error: "Valid year and month query params are required" }, { status: 400 });
  }

  // Repeated "client" params (?client=A&client=B) select the client-wise
  // export mode — one sheet per client instead of the default consolidated
  // single sheet. See buildMonthlyTimesheetWorkbook's clientNames option.
  const clientNames = searchParams.getAll("client").map((c) => c.trim()).filter(Boolean);

  const workbook = await buildMonthlyTimesheetWorkbook(year, month, { clientNames });
  const buffer = await workbook.xlsx.writeBuffer();

  const filenameSuffix =
    clientNames.length === 1
      ? `_${sanitizeFilenamePart(clientNames[0])}`
      : clientNames.length > 1
        ? "_ClientWise"
        : "";
  const filename = `Monthly_Timesheet_${MONTH_NAMES[month - 1]}_${year}${filenameSuffix}.xlsx`;
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
