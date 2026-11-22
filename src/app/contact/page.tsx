import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getContactSubmissionsForUser, getContactSubmissionMessages } from "@/lib/data";
import PageTransition from "@/components/PageTransition";
import ContactFormClient from "./ContactFormClient";
import type { ContactSubmission, ContactSubmissionMessage } from "@/lib/types";

export default async function ContactPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  // v3.0 (supabase_patch_16/18) — so the employee can see the full reply
  // thread on a past message, and add their own follow-up to it. Wrapped
  // so this page never 500s if those migrations haven't been run yet.
  let pastMessages: ContactSubmission[] = [];
  let threads: Record<string, ContactSubmissionMessage[]> = {};
  try {
    pastMessages = await getContactSubmissionsForUser(session.userId);
    threads = await getContactSubmissionMessages(pastMessages.map((m) => m.id));
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code !== "PGRST205") throw err;
  }

  return (
    <PageTransition>
      <ContactFormClient name={session.name} pastMessages={pastMessages} threads={threads} viewerId={session.userId} />
    </PageTransition>
  );
}
