import { redirect } from "next/navigation";
import { getSession, isSuperAdminOnly } from "@/lib/session";
import { getAllUsersWithRoles } from "@/lib/data";
import PageTransition from "@/components/PageTransition";
import ManageRolesClient from "./ManageRolesClient";

export const dynamic = "force-dynamic";

// v3.0, Super Admin only. Merged with the old standalone /create_employee
// page (Abeer, 2026-11-21: "create employee and manage roles... make them
// in a single page... no 2 separate pages will be there") — that route is
// deleted; its create/delete-employee actions are now reachable from here
// via a modal. Uses isSuperAdminOnly (not the stricter isSuperAdmin) so
// today's single pre-migration admin tier keeps the exact access it had
// on /create_employee — this page must not regress to "nobody can reach
// it" just because it absorbed that page's job. getAllUsersWithRoles()
// selects the v3.0 role columns, which already exist (supabase_patch_7
// has been run) even though nobody's access_level/user_type is assigned
// yet — they just come back null, same as every other v3.0-aware page.
export default async function ManageRolesPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!isSuperAdminOnly(session)) redirect("/login");

  const users = await getAllUsersWithRoles();

  return (
    <PageTransition>
      <ManageRolesClient users={users} />
    </PageTransition>
  );
}
