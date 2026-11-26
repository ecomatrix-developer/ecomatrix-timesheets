import { redirect } from "next/navigation";
import { getSession, isSuperAdminOrAccountant } from "@/lib/session";
import { getAllUsers, getAllLeaveRequests, getCurrentLeaveBalancesByEmployee } from "@/lib/data";
import PageTransition from "@/components/PageTransition";
import LeaveOverviewClient from "./LeaveOverviewClient";
import type { LeaveRequest, PublicUser, LeaveBalance } from "@/lib/types";

export const dynamic = "force-dynamic";

// Abeer, 2026-11-27: "for the accountant login... leaves view where the
// format would be 2 tab annual leave calender and sick leaves calender...
// a complete year view would be there so that accountant can see the
// leaves properly" — Accountant (and Super Admin, who already has the
// full approve/reject Leave page) get a read-only org-wide year-by-month
// breakdown instead. Gated the same as the folder-based Documents page:
// isSuperAdminOrAccountant, no legacy-role fallback (brand-new feature).
export default async function LeaveOverviewPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!isSuperAdminOrAccountant(session)) redirect("/dashboard");

  let allUsers: PublicUser[] = [];
  let allRequests: LeaveRequest[] = [];
  let leaveBalances: Record<string, LeaveBalance> = {};
  try {
    [allUsers, allRequests, leaveBalances] = await Promise.all([
      getAllUsers(),
      getAllLeaveRequests(),
      getCurrentLeaveBalancesByEmployee(),
    ]);
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code !== "PGRST205") throw err;
  }

  return (
    <PageTransition>
      <LeaveOverviewClient allUsers={allUsers} allRequests={allRequests} leaveBalances={leaveBalances} />
    </PageTransition>
  );
}
