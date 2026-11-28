import { redirect } from "next/navigation";
import { getSession, isSuperAdminOrAccountant } from "@/lib/session";
import { getAllUsersWithRoles, getRecentSalarySlips } from "@/lib/data";
import PageTransition from "@/components/PageTransition";
import SalarySlipsClient from "./SalarySlipsClient";

export const dynamic = "force-dynamic";

// Abeer, 2026-11-28: "in the accountant panel we need to make a change
// like there would a salary slip generation module" — gated exactly like
// /manage_documents (Super Admin or Accountant only); the generated PDF is
// filed straight into the employee's own "Salary Slips" folder via the
// existing document portal, so it shows up in their My Documents with no
// new table needed.
export default async function SalarySlipsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!isSuperAdminOrAccountant(session)) redirect("/dashboard");

  const users = await getAllUsersWithRoles();

  let recentSlips: Awaited<ReturnType<typeof getRecentSalarySlips>> = [];
  try {
    recentSlips = await getRecentSalarySlips();
  } catch (err) {
    // supabase_patch_8_documents.sql not run yet — show an empty history
    // rather than 500ing this page.
    const code = (err as { code?: string })?.code;
    if (code !== "PGRST205") throw err;
  }

  return (
    <PageTransition>
      <SalarySlipsClient users={users} recentSlips={recentSlips} />
    </PageTransition>
  );
}
