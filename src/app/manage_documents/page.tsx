import { redirect } from "next/navigation";
import { getSession, isSuperAdmin } from "@/lib/session";
import { getAllUsersWithRoles, getDocumentCountsByEmployee } from "@/lib/data";
import PageTransition from "@/components/PageTransition";
import ManageDocumentsIndexClient from "./ManageDocumentsIndexClient";

export const dynamic = "force-dynamic";

// v3.0, Super Admin only — strict isSuperAdmin, same reasoning as
// /manage_documents/[userId] and /manage_roles: the document portal is
// brand-new with no legacy behavior to stay compatible with. Consolidated
// landing page: every employee with how many documents they have on file,
// click through to /manage_documents/[userId] to upload/view/delete.
export default async function ManageDocumentsIndexPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!isSuperAdmin(session)) redirect("/dashboard");

  const users = await getAllUsersWithRoles();

  let counts: Record<string, number> = {};
  try {
    counts = await getDocumentCountsByEmployee();
  } catch (err) {
    // supabase_patch_8_documents.sql not run yet — show everyone at 0
    // rather than 500ing this page.
    const code = (err as { code?: string })?.code;
    if (code !== "PGRST205") throw err;
  }

  return (
    <PageTransition>
      <ManageDocumentsIndexClient users={users} counts={counts} />
    </PageTransition>
  );
}
