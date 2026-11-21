import { redirect } from "next/navigation";
import { getSession, isAdminOrAbove } from "@/lib/session";
import { getContactSubmissions } from "@/lib/data";
import { PAGE_SIZE } from "@/lib/constants";
import PageTransition from "@/components/PageTransition";
import ContactSubmissionsClient from "./ContactSubmissionsClient";
import type { ContactSubmission } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Admin-or-above inbox (Abeer, 2026-11-21): "create one page where super
 * admin can see them when they fill contact us forms... and save those
 * data in some table so that super admins can see every old user
 * queries." Matches the notification bell's own visibility (Admin and
 * Super Admin both) and the same Admin-or-above tier Leave approvals
 * already use — a narrower page guard than the bell that links to it
 * would just be a broken link for Admin. Also shows "Forgot Password?"
 * requests — both sources write to the same contact_submissions table
 * (supabase_patch_15).
 */
export default async function ContactSubmissionsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!isAdminOrAbove(session)) redirect("/dashboard");

  const resolvedSearchParams = await searchParams;
  const page = Math.max(1, parseInt(resolvedSearchParams.page ?? "1", 10) || 1);

  let items: ContactSubmission[] = [];
  let total = 0;
  try {
    const result = await getContactSubmissions(PAGE_SIZE, (page - 1) * PAGE_SIZE);
    items = result.data;
    total = result.count;
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code !== "PGRST205") throw err;
  }

  return (
    <PageTransition>
      <ContactSubmissionsClient
        items={items}
        page={page}
        totalPages={Math.max(1, Math.ceil(total / PAGE_SIZE))}
        totalItems={total}
      />
    </PageTransition>
  );
}
