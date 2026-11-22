"use server";

import { revalidateTag } from "next/cache";
import { requireSession, isSuperAdminOnly } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export interface ContactFormState {
  error?: string;
  success?: boolean;
}

/**
 * Replaces v1's external link to ecomatrix.io/contact-us. Stores the
 * submission (supabase_patch_15) — in-app only, never emailed (2026-11-22:
 * "remove this email from there which is sending to anup and erv email
 * when someone fills contact us forms, not need to send real email
 * there"). Super Admin sees every submission (read or not) on
 * /contact_submissions, and new ones surface in the notification bell
 * (2026-11-22: "remove inbox from admins" — Super-Admin-only now).
 */
export async function submitContactFormAction(
  _prevState: ContactFormState,
  formData: FormData
): Promise<ContactFormState> {
  const session = await requireSession();

  const subject = String(formData.get("subject") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();

  if (!subject || !message) {
    return { error: "Please fill in both a subject and a message." };
  }

  const { error: insertErr } = await supabaseAdmin.from("contact_submissions").insert({
    user_id: session.userId,
    username: session.username,
    name: session.name,
    subject,
    message,
    source: "contact_form",
  });
  if (insertErr) {
    if (insertErr.code === "PGRST205") {
      return {
        error: "The contact inbox hasn't been set up yet. Contact your developer, then try again.",
      };
    }
    return { error: insertErr.message };
  }

  revalidateTag("contact-submissions");
  return { success: true };
}

/**
 * Super Admin only (2026-11-22: "remove inbox from admins") — marks one
 * inbox item read/unread from /contact_submissions.
 */
export async function markContactSubmissionReadAction(
  id: string,
  read: boolean
): Promise<{ success: boolean; error?: string }> {
  const session = await requireSession();
  if (!isSuperAdminOnly(session)) {
    return { success: false, error: "You don't have permission to do that." };
  }

  const { error } = await supabaseAdmin
    .from("contact_submissions")
    .update(read ? { read_at: new Date().toISOString(), read_by: session.userId } : { read_at: null, read_by: null })
    .eq("id", id);
  if (error) return { success: false, error: error.message };

  revalidateTag("contact-submissions");
  return { success: true };
}

/**
 * Full two-way thread (supabase_patch_18) — Abeer, 2026-11-22: "if user
 * want he can reply there as well to the same thread so make that enable
 * for leaves as well as contact us." Either the submission's own sender —
 * an Admin submitting their own Contact Us message is just another
 * sender here, same as an Employee/Intern/Consultant/etc — or a Super
 * Admin, can keep adding messages to the same conversation. Only the
 * ADMIN-SIDE capability (replying to/managing someone ELSE's submission)
 * is Super-Admin-only (2026-11-22: "remove inbox from admins"). In-app
 * only, never emailed.
 *
 * When the admin side posts, the item is marked read (they're clearly
 * engaged). When the SENDER posts a follow-up, it's marked unread again
 * so it resurfaces for Super Admin instead of silently sitting answered.
 */
export async function addContactSubmissionMessageAction(
  submissionId: string,
  message: string
): Promise<{ success: boolean; error?: string }> {
  const session = await requireSession();
  const trimmed = message.trim();
  if (!trimmed) return { success: false, error: "Write a message first." };

  const { data: submission, error: fetchErr } = await supabaseAdmin
    .from("contact_submissions")
    .select("user_id")
    .eq("id", submissionId)
    .maybeSingle();
  if (fetchErr) return { success: false, error: fetchErr.message };
  if (!submission) return { success: false, error: "Submission not found." };

  const isAdminSide = isSuperAdminOnly(session);
  if (!isAdminSide && submission.user_id !== session.userId) {
    return { success: false, error: "You don't have permission to do that." };
  }

  const { error: insertErr } = await supabaseAdmin.from("contact_submission_messages").insert({
    submission_id: submissionId,
    sender_id: session.userId,
    message: trimmed,
  });
  if (insertErr) {
    if (insertErr.code === "PGRST205") {
      return { success: false, error: "Replies haven't been set up yet. Contact your developer, then try again." };
    }
    return { success: false, error: insertErr.message };
  }

  await supabaseAdmin
    .from("contact_submissions")
    .update(
      isAdminSide
        ? { read_at: new Date().toISOString(), read_by: session.userId }
        : { read_at: null, read_by: null }
    )
    .eq("id", submissionId);

  revalidateTag("contact-submissions");
  return { success: true };
}
