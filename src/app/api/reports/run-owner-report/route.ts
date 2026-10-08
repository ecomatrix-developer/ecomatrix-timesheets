import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { buildOwnerReportData } from "@/lib/reportData";
import { renderPdfInChildProcess } from "@/lib/pdf/renderInChildProcess";
import { sendReportEmail } from "@/lib/mailer";

/**
 * Mirrors v1's /run-owner-report-now. SECURITY FIX vs v1: that route also had
 * NO auth check. Here it requires an authenticated admin session.
 */
export async function POST() {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const data = await buildOwnerReportData();
  // Rendered in a separate child process — @react-pdf/renderer is
  // incompatible with the React 19 canary Next.js's server runtime
  // substitutes in-process. See renderInChildProcess.ts for details.
  const pdfBuffer = await renderPdfInChildProcess(
    "lib/pdf/OwnerSnapshotReport.tsx",
    "OwnerSnapshotReportDoc",
    { data }
  );

  const recipients = [process.env.ADMIN_EMAIL, process.env.OWNER_EMAIL].filter(
    (v): v is string => !!v
  );

  const emailResult = await sendReportEmail(
    recipients,
    `Owner's Weekly Snapshot: Week of ${data.dates[0]}`,
    "Attached is the comprehensive weekly snapshot report.",
    { filename: `owner_snapshot_${data.dates[0]}.pdf`, content: pdfBuffer }
  );

  return NextResponse.json({
    success: true,
    week: { start: data.dates[0], end: data.dates[data.dates.length - 1] },
    emailed: emailResult.sent,
    reason: emailResult.reason,
  });
}
