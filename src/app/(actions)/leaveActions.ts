"use server";

import { revalidatePath } from "next/cache";
import { requireSession, isAdminOrAbove } from "@/lib/session";
import { getLeaveRequestById } from "@/lib/data";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { LeaveType } from "@/lib/types";

const LEAVE_TYPES: LeaveType[] = ["sick", "casual", "annual", "unpaid", "other"];

export interface LeaveRequestState {
  error?: string;
  success?: boolean;
}

/**
 * Any authenticated user. Submits a leave request for themselves only —
 * there's no employeeId parameter, it's always session.userId. Will fail
 * with a friendly message if supabase_patch_10_leave_requests.sql hasn't
 * been run yet (missing table).
 */
export async function createLeaveRequestAction(
  _prevState: LeaveRequestState,
  formData: FormData
): Promise<LeaveRequestState> {
  const session = await requireSession();

  const startDate = String(formData.get("start_date") ?? "");
  const endDate = String(formData.get("end_date") ?? "");
  const leaveType = String(formData.get("leave_type") ?? "other");
  const reason = String(formData.get("reason") ?? "").trim();

  if (!startDate || !endDate) {
    return { error: "Pick both a start and end date." };
  }
  if (endDate < startDate) {
    return { error: "End date can't be before the start date." };
  }
  if (!LEAVE_TYPES.includes(leaveType as LeaveType)) {
    return { error: "Invalid leave type." };
  }

  const { error } = await supabaseAdmin.from("leave_requests").insert({
    employee_id: session.userId,
    start_date: startDate,
    end_date: endDate,
    leave_type: leaveType,
    reason: reason || null,
  });
  if (error) {
    if (error.code === "PGRST205") {
      return {
        error: "The leave portal hasn't been set up yet. Contact your developer, then try again.",
      };
    }
    return { error: error.message };
  }

  revalidatePath("/leave");
  return { success: true };
}

/**
 * Admin or Super Admin only (fallback-aware — same tier as "approve/reopen
 * timesheets" per the brief). Approves or rejects any employee's request,
 * org-wide — Admin is a flat tier, not scoped to a subset of people.
 */
export async function decideLeaveRequestAction(
  requestId: string,
  decision: "approved" | "rejected",
  note?: string
): Promise<{ success: boolean; message: string }> {
  const session = await requireSession();
  if (!isAdminOrAbove(session)) {
    return { success: false, message: "You don't have permission to approve leave." };
  }

  const request = await getLeaveRequestById(requestId);
  if (!request) return { success: false, message: "Request not found." };
  if (request.status !== "pending") {
    return { success: false, message: "This request has already been decided." };
  }

  const { error } = await supabaseAdmin
    .from("leave_requests")
    .update({
      status: decision,
      decided_by: session.userId,
      decided_at: new Date().toISOString(),
      decision_note: note || null,
    })
    .eq("id", requestId);
  if (error) return { success: false, message: error.message };

  revalidatePath("/leave");
  return { success: true, message: `Request ${decision}.` };
}
