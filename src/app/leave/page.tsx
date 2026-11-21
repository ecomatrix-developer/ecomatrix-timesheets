import { redirect } from "next/navigation";
import { getSession, isAdminOrAbove } from "@/lib/session";
import { getLeaveRequestsForEmployee, getAllLeaveRequests } from "@/lib/data";
import PageTransition from "@/components/PageTransition";
import LeaveClient from "./LeaveClient";
import type { LeaveRequest } from "@/lib/types";

export const dynamic = "force-dynamic";

// Everyone gets "My Requests" + a new-request form. Admin/Super Admin
// additionally get an org-wide "Pending Approvals" section — isAdminOrAbove
// is fallback-aware, so this works for today's unmigrated accounts too.
// Both queries are wrapped so this page never 500s if
// supabase_patch_10_leave_requests.sql hasn't been run yet.
export default async function LeavePage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const canApprove = isAdminOrAbove(session);

  let myRequests: LeaveRequest[] = [];
  let pendingRequests: LeaveRequest[] = [];
  try {
    myRequests = await getLeaveRequestsForEmployee(session.userId);
    if (canApprove) {
      pendingRequests = (await getAllLeaveRequests()).filter((r) => r.status === "pending");
    }
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code !== "PGRST205") throw err;
  }

  return (
    <PageTransition>
      <LeaveClient myRequests={myRequests} pendingRequests={pendingRequests} canApprove={canApprove} />
    </PageTransition>
  );
}
