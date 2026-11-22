"use server";

import { revalidatePath } from "next/cache";
import { requireSession, isSuperAdminOnly } from "@/lib/session";
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
 * Super Admin only (fallback-aware) — Abeer, 2026-11-22: "make sure only
 * superadmins are able to see that, normal admins cant they can only
 * request." A plain Admin can still submit their own leave requests via
 * createLeaveRequestAction above, just never decide anyone else's.
 */
export async function decideLeaveRequestAction(
  requestId: string,
  decision: "approved" | "rejected",
  note?: string
): Promise<{ success: boolean; message: string }> {
  const session = await requireSession();
  if (!isSuperAdminOnly(session)) {
    return { success: false, message: "Only a Super Admin can approve or reject leave requests." };
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

/**
 * Full two-way thread (supabase_patch_18) — Abeer, 2026-11-22: "if user
 * want he can reply there as well to the same thread so make that enable
 * for leaves as well as contact us." Either the request's own submitter —
 * an Admin requesting leave is just another requester here, same as an
 * Employee/Intern/Consultant/etc (2026-11-22: "admins also will request or
 * send contact like employees and others") — or a Super Admin, can keep
 * adding messages, independent of the approve/reject decision. Only the
 * DECIDE side (approve/reject, and reading/replying on someone ELSE's
 * request) stays Super-Admin-only. In-app only, never emailed.
 */
export async function addLeaveRequestMessageAction(
  requestId: string,
  message: string
): Promise<{ success: boolean; message: string }> {
  const session = await requireSession();
  const trimmed = message.trim();
  if (!trimmed) return { success: false, message: "Write a message first." };

  const request = await getLeaveRequestById(requestId);
  if (!request) return { success: false, message: "Request not found." };

  if (!isSuperAdminOnly(session) && request.employee_id !== session.userId) {
    return { success: false, message: "You don't have permission to do that." };
  }

  const { error } = await supabaseAdmin.from("leave_request_messages").insert({
    request_id: requestId,
    sender_id: session.userId,
    message: trimmed,
  });
  if (error) {
    if (error.code === "PGRST205") {
      return { success: false, message: "Replies haven't been set up yet. Contact your developer, then try again." };
    }
    return { success: false, message: error.message };
  }

  revalidatePath("/leave");
  return { success: true, message: "Message sent." };
}
