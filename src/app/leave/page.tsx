import { redirect } from "next/navigation";
import { getSession, isSuperAdminOnly } from "@/lib/session";
import {
  getLeaveRequestsForEmployee,
  getAllLeaveRequests,
  getLeaveRequestMessages,
  getLeaveSummaryForEmployee,
  getAllUsers,
  getCurrentLeaveBalancesByEmployee,
  getMedicalCertificateStatusByEmployee,
} from "@/lib/data";
import { quarterRangeForDate } from "@/lib/leavePolicy";
import PageTransition from "@/components/PageTransition";
import LeaveClient from "./LeaveClient";
import type { LeaveRequest, LeaveRequestMessage, LeaveSummary, PublicUser, LeaveBalance } from "@/lib/types";

export const dynamic = "force-dynamic";

// Everyone gets "My Requests" + a new-request form, including the reply
// thread on their own request — an Admin requesting leave is just another
// requester here, same as an Employee/Intern/Consultant/etc (2026-11-22:
// "admins also will request or send contact like employees and others").
// Only Super Admin gets the org-wide approval/decision view — Abeer,
// 2026-11-21: "make sure only superadmins are able to see that, normal
// admins cant they can only request" — that restriction is specifically
// about DECIDING (and reading/replying on someone ELSE's request), not
// about an Admin's own request. isSuperAdminOnly is fallback-aware, so
// this works for today's unmigrated single-admin-tier accounts too.
// allRequests is the FULL, unfiltered history (every status, every
// employee, no date bound) — the client derives "still pending" from it
// for the quick-action list, and renders the rest as a permanent decision
// history. Both queries are wrapped so this page never 500s if
// supabase_patch_10_leave_requests.sql hasn't been run yet.
export default async function LeavePage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const canDecide = isSuperAdminOnly(session);

  let myRequests: LeaveRequest[] = [];
  let allRequests: LeaveRequest[] = [];
  let threads: Record<string, LeaveRequestMessage[]> = {};
  let mySummary: LeaveSummary | null = null;
  let allUsers: PublicUser[] = [];
  let leaveBalances: Record<string, LeaveBalance> = {};
  // Abeer, 2026-11-27: "medical certificate after 3 single sick days in a
  // quarter... superadmins can see that document" — computed for
  // everyone, but only Super Admin gets the full org-wide map; a regular
  // employee only ever learns their OWN status (myCertOnFile), never
  // whether some other employee has filed one.
  let medicalCertStatusByEmployee: Record<string, boolean> = {};
  let myCertOnFile = false;
  try {
    [myRequests, mySummary] = await Promise.all([
      getLeaveRequestsForEmployee(session.userId),
      getLeaveSummaryForEmployee(session.userId),
    ]);
    const quarter = quarterRangeForDate();
    const certMap = await getMedicalCertificateStatusByEmployee(quarter.start).catch(() => ({}) as Record<string, boolean>);
    myCertOnFile = certMap[session.userId] ?? false;
    if (canDecide) {
      [allRequests, threads, allUsers, leaveBalances] = await Promise.all([
        getAllLeaveRequests(),
        // Super Admin sees every thread at once — covers their own requests too.
        getLeaveRequestMessages(),
        getAllUsers(),
        getCurrentLeaveBalancesByEmployee(),
      ]);
      medicalCertStatusByEmployee = certMap;
    } else {
      threads = await getLeaveRequestMessages(myRequests.map((r) => r.id));
    }
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code !== "PGRST205") throw err;
  }

  return (
    <PageTransition>
      <LeaveClient
        myRequests={myRequests}
        allRequests={allRequests}
        canDecide={canDecide}
        threads={threads}
        viewerId={session.userId}
        mySummary={mySummary}
        allUsers={allUsers}
        leaveBalances={leaveBalances}
        medicalCertStatusByEmployee={medicalCertStatusByEmployee}
        myCertOnFile={myCertOnFile}
      />
    </PageTransition>
  );
}
