import "server-only";
import nodemailer from "nodemailer";

function getTransporter() {
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASSWORD;
  if (!user || !pass) return null;
  return {
    user,
    transporter: nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      auth: { user, pass },
      // LOCAL-DEV-ONLY escape hatch: some antivirus "mail shield" features
      // (e.g. Avast) intercept outbound SMTP TLS and re-sign it with their
      // own root cert, which Node then correctly rejects as untrusted —
      // this never happens on Vercel/production (nothing is intercepting
      // traffic there), so this must NEVER be set true in a real
      // deployment. Set EMAIL_TLS_INSECURE=true in .env.local only, to
      // unblock local testing while that interception is active.
      tls:
        process.env.EMAIL_TLS_INSECURE === "true"
          ? { rejectUnauthorized: false }
          : undefined,
    }),
  };
}

export async function sendReportEmail(
  recipients: string[],
  subject: string,
  body: string,
  attachment: { filename: string; content: Buffer }
): Promise<{ sent: boolean; reason?: string }> {
  const setup = getTransporter();
  if (!setup) {
    console.warn("Email credentials not configured (EMAIL_USER/EMAIL_PASSWORD). Skipping email.");
    return { sent: false, reason: "Email credentials not configured." };
  }
  if (recipients.length === 0) {
    return { sent: false, reason: "No recipients configured." };
  }

  try {
    await setup.transporter.sendMail({
      from: setup.user,
      to: recipients.join(", "),
      subject,
      text: body,
      attachments: [attachment],
    });
    return { sent: true };
  } catch (err) {
    console.error("Failed to send email:", err);
    return { sent: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Plain (no-attachment) email — used by the in-app Contact form to send a
 * message straight to the owner/admin inboxes, replacing v1's external
 * link to ecomatrix.io/contact-us with a form that actually delivers to
 * this deployment's configured email addresses.
 */
export async function sendPlainEmail(
  recipients: string[],
  subject: string,
  body: string,
  replyTo?: string
): Promise<{ sent: boolean; reason?: string }> {
  const setup = getTransporter();
  if (!setup) {
    console.warn("Email credentials not configured (EMAIL_USER/EMAIL_PASSWORD). Skipping email.");
    return { sent: false, reason: "Email is not configured yet. Please contact the admin directly." };
  }
  if (recipients.length === 0) {
    return { sent: false, reason: "No recipient email is configured for this deployment." };
  }

  try {
    await setup.transporter.sendMail({
      from: setup.user,
      to: recipients.join(", "),
      replyTo,
      subject,
      text: body,
    });
    return { sent: true };
  } catch (err) {
    console.error("Failed to send email:", err);
    return { sent: false, reason: err instanceof Error ? err.message : String(err) };
  }
}
