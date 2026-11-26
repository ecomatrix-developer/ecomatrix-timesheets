"use server";

import { revalidateTag } from "next/cache";
import { requireSession, isSuperAdminOnly } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSuperAdminEmails } from "@/lib/data";
import { sendHtmlEmail } from "@/lib/mailer";
import { buildContactFormEmail } from "@/lib/emailTemplates";

export interface ContactFormState {
  error?: string;
  success?: boolean;
}

/**
 * Replaces v1's external link to ecomatrix.io/contact-us. Stores the
 * submission (supabase_patch_15) and, as of 2026-11-26, also emails every
 * Super Admin a formatted notification so they don't have to be watching
 * the inbox live — Super-Admin-only recipients, not Admins (2026-11-26:
 * "for contact us form only superadmins will see that"), consistent with
 * /contact_submissions itself already being Super-Admin-only (2026-11-22:
 * "remove inbox from admins"). Super Admin still sees every submission
 * (read or not) there, and new ones surface in the notification bell too.
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

  const { subject: emailSubject, html, text } = buildContactFormEmail({
    senderName: session.name,
    senderUsername: session.username,
    subject,
    message,
    submittedAt: new Date().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }),
  });
  // Awaited (not fire-and-forget): on Vercel, a serverless function can be
  // frozen the instant it returns, so an un-awaited send can simply never
  // go out. Failure is swallowed — a slow/broken mail server must never
  // block the submission from succeeding.
  const recipients = await getSuperAdminEmails().catch(() => []);
  if (recipients.length > 0) {
    await sendHtmlEmail(recipients, emailSubject, html, text).catch(() => {});
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
