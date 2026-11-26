import "server-only";

// 2026-11-26, Abeer: "create the proper good format complete html format
// email and proper subject for that so that the superadmins and admin
// capture that properly" — Contact Us and Leave Request submissions now
// send a branded HTML notification email (see emailActions below), while
// still being purely a notification: approving/rejecting/replying always
// happens in-app, never by replying to the email. Confirmed working in
// testing, then wired to real recipients (2026-11-26: "the email is
// perfect so make it now for leaves admins and superadmins will get the
// emails and for contact us form only superadmins will see that") — see
// getSuperAdminEmails()/getAdminAndSuperAdminEmails() in data.ts.

const BRAND_GRADIENT = "linear-gradient(135deg, #667eea 0%, #764ba2 100%)";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function nl2br(value: string): string {
  return escapeHtml(value).replace(/\n/g, "<br />");
}

interface DetailRow {
  label: string;
  value: string;
}

function layout(opts: {
  heading: string;
  introLine: string;
  rows: DetailRow[];
  messageLabel: string;
  message: string;
  footerNote: string;
}): string {
  const rowsHtml = opts.rows
    .map(
      (r) => `
        <tr>
          <td style="padding:10px 16px;border-bottom:1px solid #eef0f4;font-size:13px;color:#6b7280;white-space:nowrap;vertical-align:top;">${escapeHtml(r.label)}</td>
          <td style="padding:10px 16px;border-bottom:1px solid #eef0f4;font-size:14px;color:#111827;vertical-align:top;">${escapeHtml(r.value)}</td>
        </tr>`
    )
    .join("");

  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background-color:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,0.06);">
            <tr>
              <td style="background:${BRAND_GRADIENT};padding:28px 28px 22px 28px;">
                <p style="margin:0;color:#ffffff;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;opacity:0.85;">Eco Matrix Engineering · Timesheets</p>
                <h1 style="margin:6px 0 0 0;color:#ffffff;font-size:20px;font-weight:600;">${escapeHtml(opts.heading)}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 28px 8px 28px;">
                <p style="margin:0 0 16px 0;font-size:14px;color:#374151;line-height:1.5;">${escapeHtml(opts.introLine)}</p>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #eef0f4;border-radius:8px;overflow:hidden;">
                  ${rowsHtml}
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:4px 28px 4px 28px;">
                <p style="margin:18px 0 6px 0;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#9ca3af;">${escapeHtml(opts.messageLabel)}</p>
                <div style="background-color:#f9fafb;border-radius:8px;padding:14px 16px;font-size:14px;color:#111827;line-height:1.6;white-space:pre-wrap;">${nl2br(opts.message) || "<em>(no message provided)</em>"}</div>
              </td>
            </tr>
            <tr>
              <td style="padding:22px 28px 28px 28px;">
                <p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.5;">${escapeHtml(opts.footerNote)}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function buildContactFormEmail(data: {
  senderName: string;
  senderUsername: string;
  subject: string;
  message: string;
  submittedAt: string;
}): { subject: string; html: string; text: string } {
  const subject = `New Contact Us message: ${data.subject}`;
  const html = layout({
    heading: "New Contact Us message",
    introLine: `${data.senderName} (${data.senderUsername}) just submitted a message through the Contact Us form.`,
    rows: [
      { label: "From", value: `${data.senderName} (${data.senderUsername})` },
      { label: "Subject", value: data.subject },
      { label: "Submitted", value: data.submittedAt },
    ],
    messageLabel: "Message",
    message: data.message,
    footerNote:
      "This is an automated notification. Reply from inside the app (Contact Us inbox) — replying to this email will not reach the sender.",
  });
  const text = `New Contact Us message\n\nFrom: ${data.senderName} (${data.senderUsername})\nSubject: ${data.subject}\nSubmitted: ${data.submittedAt}\n\nMessage:\n${data.message}\n\nReply from inside the app's Contact Us inbox — replying to this email will not reach the sender.`;
  return { subject, html, text };
}

export function buildLeaveRequestEmail(data: {
  employeeName: string;
  employeeUsername: string;
  startDate: string;
  endDate: string;
  dayType: string;
  daysCount: number;
  leaveType: string;
  reason: string;
  submittedAt: string;
}): { subject: string; html: string; text: string } {
  const subject = `New Leave Request: ${data.employeeName} (${data.startDate} – ${data.endDate})`;
  const dateRange =
    data.startDate === data.endDate ? data.startDate : `${data.startDate} – ${data.endDate}`;
  const html = layout({
    heading: "New Leave Request",
    introLine: `${data.employeeName} (${data.employeeUsername}) just submitted a new leave request awaiting your decision.`,
    rows: [
      { label: "Employee", value: `${data.employeeName} (${data.employeeUsername})` },
      { label: "Dates", value: dateRange },
      { label: "Day type", value: data.dayType === "half" ? "Half day" : "Full day" },
      { label: "Days counted", value: String(data.daysCount) },
      { label: "Leave type", value: data.leaveType },
      { label: "Submitted", value: data.submittedAt },
    ],
    messageLabel: "Reason",
    message: data.reason,
    footerNote:
      "This is an automated notification. Approve or reject from inside the app (Leave page) — replying to this email will not reach the employee.",
  });
  const text = `New Leave Request\n\nEmployee: ${data.employeeName} (${data.employeeUsername})\nDates: ${dateRange}\nDay type: ${data.dayType === "half" ? "Half day" : "Full day"}\nDays counted: ${data.daysCount}\nLeave type: ${data.leaveType}\nSubmitted: ${data.submittedAt}\n\nReason:\n${data.reason}\n\nApprove or reject from inside the app's Leave page.`;
  return { subject, html, text };
}
