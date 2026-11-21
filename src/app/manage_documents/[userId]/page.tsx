import { redirect, notFound } from "next/navigation";
import { getSession, isSuperAdmin } from "@/lib/session";
import { getUserByIdWithRoles, getDocumentsForEmployee } from "@/lib/data";
import PageTransition from "@/components/PageTransition";
import ManageDocumentsClient from "./ManageDocumentsClient";
import type { EmployeeDocument } from "@/lib/types";

export const dynamic = "force-dynamic";

// Super-Admin-only combined employee detail + documents screen. Strict
// isSuperAdmin (no legacy-role fallback) — same reasoning as
// canAccessEmployeeDocuments: this is a brand-new feature with no old
// behavior to preserve.
export default async function ManageDocumentsPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!isSuperAdmin(session)) redirect("/dashboard");

  const { userId } = await params;
  const employee = await getUserByIdWithRoles(userId);
  if (!employee) notFound();

  let documents: EmployeeDocument[] = [];
  try {
    documents = await getDocumentsForEmployee(userId);
  } catch (err) {
    // See src/app/my_documents/page.tsx for why this checks PGRST205.
    const code = (err as { code?: string })?.code;
    if (code !== "PGRST205") throw err;
  }

  return (
    <PageTransition>
      <ManageDocumentsClient employee={employee} documents={documents} />
    </PageTransition>
  );
}
