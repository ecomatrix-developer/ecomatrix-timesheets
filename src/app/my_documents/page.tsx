import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getDocumentsForEmployee } from "@/lib/data";
import PageTransition from "@/components/PageTransition";
import MyDocumentsClient from "./MyDocumentsClient";
import type { EmployeeDocument } from "@/lib/types";

export const dynamic = "force-dynamic";

// Every authenticated user gets this page, scoped to their own documents
// only — the server query itself filters by session.userId, never a
// client-supplied id, so there's no way to request someone else's.
export default async function MyDocumentsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  // This page is reachable by every current user, not gated behind a
  // not-yet-granted role the way /manage_roles is — so unlike that page,
  // this one must not 500 for everyone if supabase_patch_8_documents.sql
  // hasn't been run yet. Treat a missing table as "no documents." Checked
  // live: PostgREST reports this as its own PGRST205 ("table not found in
  // schema cache"), not the raw Postgres 42P01 — it resolves the table
  // before the query ever reaches Postgres.
  let documents: EmployeeDocument[] = [];
  try {
    documents = await getDocumentsForEmployee(session.userId);
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code !== "PGRST205") throw err;
  }

  return (
    <PageTransition>
      <MyDocumentsClient documents={documents} />
    </PageTransition>
  );
}
