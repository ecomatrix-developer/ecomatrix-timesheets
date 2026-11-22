import { NextResponse } from "next/server";
import { getSession, isSuperAdminOnly } from "@/lib/session";
import { getUnreadContactSubmissionsCount, getPendingLeaveRequestsCount } from "@/lib/data";

export const dynamic = "force-dynamic";

/**
 * Backs the Sidebar's notification bell — polled client-side every 60s.
 * Both contactUnread and leavePending are Super-Admin-only now
 * (2026-11-22: "remove inbox from admins" — a plain Admin no longer has
 * the Inbox tab/route at all, so a badge pointing at it would just be a
 * dead end; same reasoning already applied to leavePending). Both counts
 * are guarded so a missing table (pre-migration) degrades to 0 instead of
 * 500ing the whole bell.
 */
export async function GET() {
  const session = await getSession();
  if (!session || !isSuperAdminOnly(session)) {
    return NextResponse.json({ contactUnread: 0, leavePending: 0 });
  }

  let contactUnread = 0;
  let leavePending = 0;
  try {
    contactUnread = await getUnreadContactSubmissionsCount();
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code !== "PGRST205") throw err;
  }
  try {
    leavePending = await getPendingLeaveRequestsCount();
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code !== "PGRST205") throw err;
  }

  return NextResponse.json({ contactUnread, leavePending });
}
