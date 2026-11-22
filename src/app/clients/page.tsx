import { redirect } from "next/navigation";
import { getSession, isSuperAdminOnly } from "@/lib/session";
import { getAllClients } from "@/lib/data";
import PageTransition from "@/components/PageTransition";
import ClientsClient from "./ClientsClient";

export const dynamic = "force-dynamic";

/**
 * Abeer, 2026-11-22: "create the client creation page for the super admin
 * as well" — clients (supabase_patch_9) have never had a management UI;
 * until now they could only be added/edited directly in the database.
 * Super-Admin-only, same tier as Database Stats/Reopen Timesheets/Inbox.
 */
export default async function ClientsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!isSuperAdminOnly(session)) redirect("/login");

  let clients: Awaited<ReturnType<typeof getAllClients>> = [];
  try {
    clients = await getAllClients();
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code !== "PGRST205") throw err;
  }

  return (
    <PageTransition>
      <ClientsClient clients={clients} />
    </PageTransition>
  );
}
