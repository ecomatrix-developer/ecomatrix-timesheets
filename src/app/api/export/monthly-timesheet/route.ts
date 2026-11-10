import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { buildMonthlyTimesheetWorkbook } from "@/lib/excel/monthlyTimesheetWorkbook";
import { MONTH_NAMES } from "@/lib/dateUtils";

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

  const workbook = await buildMonthlyTimesheetWorkbook(year, month);
  const buffer = await workbook.xlsx.writeBuffer();

  const filename = `Monthly_Timesheet_${MONTH_NAMES[month - 1]}_${year}.xlsx`;
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
