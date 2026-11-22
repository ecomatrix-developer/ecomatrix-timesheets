import { redirect } from "next/navigation";
import { getSession, isSuperAdminOnly } from "@/lib/session";
import { getAllContactSubmissions, getContactSubmissionMessages } from "@/lib/data";
import PageTransition from "@/components/PageTransition";
import ContactSubmissionsClient from "./ContactSubmissionsClient";
import type { ContactSubmission, ContactSubmissionMessage } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Super Admin only (Abeer, 2026-11-22: "remove inbox from admins") — a
 * plain Admin no longer has this tab or route access at all. Also shows
 * "Forgot Password?" requests — both sources write to the same
 * contact_submissions table (supabase_patch_15). No pagination
 * (2026-11-22: "it should show all the past msg as well") — the full
 * history renders in one scrollable list instead.
 */
export default async function ContactSubmissionsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!isSuperAdminOnly(session)) redirect("/dashboard");

  let items: ContactSubmission[] = [];
  let messages: Record<string, ContactSubmissionMessage[]> = {};
  try {
    items = await getAllContactSubmissions();
    messages = await getContactSubmissionMessages();
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code !== "PGRST205") throw err;
  }

  return (
    <PageTransition>
      <ContactSubmissionsClient items={items} messages={messages} viewerId={session.userId} />
    </PageTransition>
  );
}
