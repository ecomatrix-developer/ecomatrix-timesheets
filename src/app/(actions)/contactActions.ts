"use server";

import { requireSession } from "@/lib/session";
import { sendPlainEmail } from "@/lib/mailer";

export interface ContactFormState {
  error?: string;
  success?: boolean;
}

/**
 * Replaces v1's external link to ecomatrix.io/contact-us: this form sends
 * straight to the owner's inbox (OWNER_EMAIL), CC'ing ADMIN_EMAIL so both
 * are informed, using the same Gmail SMTP credentials (EMAIL_USER /
 * EMAIL_PASSWORD) already configured for the automated PDF reports.
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

  const recipients = [process.env.OWNER_EMAIL, process.env.ADMIN_EMAIL].filter(
    (v): v is string => !!v
  );

  const body = [
    `From: ${session.name} (${session.username})`,
    `Role: ${session.role}`,
    "",
    message,
  ].join("\n");

  const result = await sendPlainEmail(
    recipients,
    `[Timesheet App] ${subject}`,
    body
  );

  if (!result.sent) {
    return { error: result.reason ?? "Could not send your message. Please try again." };
  }

  return { success: true };
}
