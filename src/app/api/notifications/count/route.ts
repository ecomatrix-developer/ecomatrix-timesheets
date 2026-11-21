import { NextResponse } from "next/server";
import { getSession, isAdminOrAbove } from "@/lib/session";
import { getUnreadContactSubmissionsCount, getPendingLeaveRequestsCount } from "@/lib/data";

export const dynamic = "force-dynamic";

/**
 * Backs the Sidebar's notification bell — polled client-side every 60s so
 * Admin/Super Admin see new Contact Us/password-reset/leave activity
 * without needing to navigate. Both counts are guarded so a missing table
 * (pre-migration) degrades to 0 instead of 500ing the whole bell.
 */
export async function GET() {
  const session = await getSession();
  if (!session || !isAdminOrAbove(session)) {
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
