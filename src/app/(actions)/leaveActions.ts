"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { requireSession, isSuperAdminOnly } from "@/lib/session";
import { getLeaveRequestById, getAdminAndSuperAdminEmails } from "@/lib/data";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendHtmlEmail } from "@/lib/mailer";
import { buildLeaveRequestEmail } from "@/lib/emailTemplates";
import { enumerateDateRange } from "@/lib/leavePolicy";
import type { LeaveType } from "@/lib/types";

const LEAVE_TYPES: LeaveType[] = ["sick", "casual", "annual", "unpaid", "other"];

export interface LeaveRequestState {
  error?: string;
  success?: boolean;
}

interface DayPlanInput {
  date: string;
  leave_type: unknown;
  half: unknown;
}

interface DaySegment {
  startDate: string;
  endDate: string;
  leaveType: LeaveType;
  daysCount: number;
  half: boolean;
}

/**
 * Abeer, 2026-11-27: "along with the type add that sick annual unpaid so
 * that they can select on which day they need to take which leave" — each
 * date in the picked range can now have its own leave type and its own
 * half/full flag, so one form submission can turn into several
 * leave_requests rows: one per contiguous run of dates sharing BOTH the
 * same leave type AND the same half/full flag. Re-derives everything from
 * the actual date range server side rather than trusting the client's
 * grouping/totals — same reasoning as the past-date guard below.
 *
 * Abeer, 2026-11-27 (follow-up): "on calender its not showing proper half
 * day and full day" — this used to group by leave type alone, so a single
 * half day in the middle of an otherwise-full range got silently merged
 * into one row spanning the whole range with one aggregate days_count,
 * and the calendar had no way to tell which specific day inside it was
 * actually half. Splitting on the half flag too means every row is either
 * "every day in this range is full" or "every day in this range is
 * half" — never a mix — so the calendar can correctly infer which from
 * days_count alone (see isWhollyHalfDayRow in leavePolicy.ts).
 */
function buildSegments(startDate: string, endDate: string, rawDayPlans: unknown): DaySegment[] | { error: string } {
  if (!Array.isArray(rawDayPlans)) return { error: "Missing day-by-day leave selections." };

  const validDates = enumerateDateRange(startDate, endDate);
  const byDate = new Map<string, { leaveType: LeaveType; half: boolean }>();
  for (const raw of rawDayPlans as DayPlanInput[]) {
    if (!raw || typeof raw.date !== "string") continue;
    if (!validDates.includes(raw.date)) continue; // outside the picked range — ignore, don't trust
    if (typeof raw.leave_type !== "string" || !LEAVE_TYPES.includes(raw.leave_type as LeaveType)) continue;
    byDate.set(raw.date, { leaveType: raw.leave_type as LeaveType, half: raw.half === true });
  }

  // Every date in the range must have a valid plan — a gap means the
  // client sent something malformed/tampered with, not a real request.
  if (validDates.some((d) => !byDate.has(d))) {
    return { error: "Each date in the range needs a leave type. Please try again." };
  }

  const segments: DaySegment[] = [];
  for (const date of validDates) {
    const plan = byDate.get(date)!;
    const amount = plan.half ? 0.5 : 1;
    const last = segments[segments.length - 1];
    if (last && last.leaveType === plan.leaveType && last.half === plan.half && last.endDate < date) {
      // Extends the current run only when it's truly the next calendar
      // day after the run's last date — validDates is already a
      // contiguous sequence, so this is always true in practice, but it's
      // cheap insurance against ever silently merging non-adjacent dates.
      const nextDay = new Date(`${last.endDate}T00:00:00Z`);
      nextDay.setUTCDate(nextDay.getUTCDate() + 1);
      if (nextDay.toISOString().slice(0, 10) === date) {
        last.endDate = date;
        last.daysCount += amount;
        continue;
      }
    }
    segments.push({ startDate: date, endDate: date, leaveType: plan.leaveType, daysCount: amount, half: plan.half });
  }
  return segments;
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
  const reason = String(formData.get("reason") ?? "").trim();

  if (!startDate || !endDate) {
    return { error: "Pick both a start and end date." };
  }
  // Defense-in-depth for the same rule the date pickers already enforce
  // client-side (2026-11-26: "the start must always be loaded as today so
  // that no one selects ths day older") — India runs ahead of UTC, so a
  // UTC "today" here is never later than the submitter's own local today.
  const todayIso = new Date().toISOString().slice(0, 10);
  if (startDate < todayIso) {
    return { error: "Start date can't be in the past." };
  }
  if (endDate < startDate) {
    return { error: "End date can't be before the start date." };
  }

  let rawDayPlans: unknown = [];
  const rawField = formData.get("day_plans");
  if (typeof rawField === "string" && rawField) {
    try {
      rawDayPlans = JSON.parse(rawField);
    } catch {
      return { error: "Could not read the day-by-day leave selections. Please try again." };
    }
  }
  const segmentsResult = buildSegments(startDate, endDate, rawDayPlans);
  if ("error" in segmentsResult) return { error: segmentsResult.error };
  const segments = segmentsResult;

  const { error } = await supabaseAdmin.from("leave_requests").insert(
    segments.map((seg) => ({
      employee_id: session.userId,
      start_date: seg.startDate,
      end_date: seg.endDate,
      leave_type: seg.leaveType,
      day_type: "full",
      days_count: seg.daysCount,
      reason: reason || null,
    }))
  );
  if (error) {
    if (error.code === "PGRST205") {
      return {
        error: "The leave portal hasn't been set up yet. Contact your developer, then try again.",
      };
    }
    return { error: error.message };
  }

  // One notification email per segment (a request that mixes leave types
  // across the range is really several distinct requests, each needing
  // its own approval) — sent one after another rather than in parallel,
  // same "awaited, not fire-and-forget" reasoning as contactActions.ts (a
  // Vercel function can freeze right after returning, before an
  // un-awaited send has actually gone out).
  const submittedAt = new Date().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
  for (const seg of segments) {
    const { subject, html, text } = buildLeaveRequestEmail({
      employeeName: session.name,
      employeeUsername: session.username,
      startDate: seg.startDate,
      endDate: seg.endDate,
      dayType: seg.half ? "half" : "full",
      daysCount: seg.daysCount,
      leaveType: seg.leaveType,
      reason,
      submittedAt,
    });
    // Abeer, 2026-11-27: "make sure that leave request emails should go
    // to admins and superadmins now, remove that abeergandhi2@gmail.com
    // from there, its perfect so make it for admins and superadmins" —
    // the single-test-address override from earlier is gone; every
    // Admin + Super Admin gets notified again, same as before testing.
    const recipients = await getAdminAndSuperAdminEmails().catch(() => []);
    if (recipients.length > 0) {
      await sendHtmlEmail(recipients, subject, html, text).catch(() => {});
    }
  }

  revalidatePath("/leave");
  revalidateTag("leave-requests");
  return { success: true };
}

interface AdminLeaveEntryInput {
  date: unknown;
  leave_type: unknown;
  half: unknown;
}

/**
 * Super Admin only — Abeer, 2026-11-27: "figure out a way to hard code a
 * half day or full day leave for any employee for the ones formal
 * request is not received. Ex - late coming for 3 days in a month, or
 * any other scenario." Unlike createLeaveRequestAction, the dates here
 * are each entered independently (not a contiguous start/end range) —
 * "3 days in a month" are rarely consecutive — so this inserts one
 * leave_requests row per date, already approved (there's no employee
 * request behind it to decide), flagged added_by_admin so it's clearly
 * labeled everywhere it shows up. No past-date guard: the whole point is
 * recording something that already happened.
 */
export async function addLeaveForEmployeeAction(
  employeeId: string,
  _prevState: LeaveRequestState,
  formData: FormData
): Promise<LeaveRequestState> {
  const session = await requireSession();
  if (!isSuperAdminOnly(session)) {
    return { error: "Only a Super Admin can add a leave entry for someone else." };
  }
  if (!employeeId) return { error: "Pick an employee." };

  const reason = String(formData.get("reason") ?? "").trim();
  let rawEntries: unknown = [];
  const rawField = formData.get("entries");
  if (typeof rawField === "string" && rawField) {
    try {
      rawEntries = JSON.parse(rawField);
    } catch {
      return { error: "Could not read the date entries. Please try again." };
    }
  }
  if (!Array.isArray(rawEntries) || rawEntries.length === 0) {
    return { error: "Add at least one date." };
  }

  const dateFormat = /^\d{4}-\d{2}-\d{2}$/;
  const byDate = new Map<string, { leaveType: LeaveType; half: boolean }>();
  for (const raw of rawEntries as AdminLeaveEntryInput[]) {
    if (!raw || typeof raw.date !== "string" || !dateFormat.test(raw.date)) continue;
    if (typeof raw.leave_type !== "string" || !LEAVE_TYPES.includes(raw.leave_type as LeaveType)) continue;
    byDate.set(raw.date, { leaveType: raw.leave_type as LeaveType, half: raw.half === true });
  }
  if (byDate.size === 0) {
    return { error: "Add at least one valid date." };
  }

  const nowIso = new Date().toISOString();
  const { error } = await supabaseAdmin.from("leave_requests").insert(
    [...byDate.entries()].map(([date, plan]) => ({
      employee_id: employeeId,
      start_date: date,
      end_date: date,
      leave_type: plan.leaveType,
      day_type: "full",
      days_count: plan.half ? 0.5 : 1,
      status: "approved",
      added_by_admin: true,
      decided_by: session.userId,
      decided_at: nowIso,
      decision_note: reason || null,
      reason: reason || null,
    }))
  );
  if (error) {
    if (error.code === "PGRST205") {
      return { error: "This needs supabase_patch_26_admin_added_leave.sql run first. Contact your developer." };
    }
    if (error.code === "23503") {
      return { error: "That employee no longer exists." };
    }
    return { error: error.message };
  }

  revalidatePath("/leave");
  revalidateTag("leave-requests");
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
  revalidateTag("leave-requests");
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
  revalidateTag("leave-requests");
  return { success: true, message: "Message sent." };
}
