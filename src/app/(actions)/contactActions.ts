"use server";

import { requireSession, isAdminOrAbove } from "@/lib/session";
import { sendPlainEmail } from "@/lib/mailer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export interface ContactFormState {
  error?: string;
  success?: boolean;
}

/**
 * Replaces v1's external link to ecomatrix.io/contact-us. Stores the
 * submission FIRST (supabase_patch_15) — so a submission is never lost
 * even if email happens to be down or misconfigured — then best-effort
 * emails OWNER_EMAIL/ADMIN_EMAIL as before. Super Admin can see every
 * submission (read or not) on /contact_submissions, and new ones surface
 * in the notification bell for Admin/Super Admin.
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

  // Best-effort only from here — the submission is already safely stored
  // and visible to Super Admin regardless of whether this email goes out.
  const recipients = [process.env.OWNER_EMAIL, process.env.ADMIN_EMAIL].filter(
    (v): v is string => !!v
  );
  if (recipients.length > 0) {
    const body = [
      `From: ${session.name} (${session.username})`,
      `Role: ${session.role}`,
      "",
      message,
    ].join("\n");
    await sendPlainEmail(recipients, `[Timesheet App] ${subject}`, body).catch(() => {});
  }

  return { success: true };
}

/** Admin-or-above — marks one inbox item read/unread from /contact_submissions. */
export async function markContactSubmissionReadAction(
  id: string,
  read: boolean
): Promise<{ success: boolean; error?: string }> {
  const session = await requireSession();
  if (!isAdminOrAbove(session)) {
    return { success: false, error: "You don't have permission to do that." };
  }

  const { error } = await supabaseAdmin
    .from("contact_submissions")
    .update(read ? { read_at: new Date().toISOString(), read_by: session.userId } : { read_at: null, read_by: null })
    .eq("id", id);
  if (error) return { success: false, error: error.message };

  return { success: true };
}
