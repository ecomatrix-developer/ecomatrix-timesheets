import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import {
  getProjectById,
  getAllClients,
  getAllProjectScopes,
  isBillableColumnSupported,
  isVisibilityColumnSupported,
} from "@/lib/data";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import PageTransition from "@/components/PageTransition";
import ProjectForm from "../../ProjectForm";
import { updateProjectAction } from "@/app/(actions)/projectActions";
import type { Client, ProjectScope } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function EditProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "admin") redirect("/dashboard");

  const { id } = await params;
  const project = await getProjectById(id);
  if (!project) notFound();

  // v3.0: same PGRST205 fallback as the create page — empty lists make
  // ProjectForm render the exact pre-v3.0 fields.
  let clients: Client[] = [];
  let scopes: ProjectScope[] = [];
  let selectedScopeIds: string[] = [];
  try {
    const [clientsRes, scopesRes, linksRes] = await Promise.all([
      getAllClients(),
      getAllProjectScopes(),
      supabaseAdmin.from("project_scope_links").select("scope_id").eq("project_id", id),
    ]);
    // Keeps the project's CURRENT client selectable even if it's since
    // been deactivated (so Edit never shows a blank/invalid selection),
    // while every other option offered is active-only — same rule as the
    // Create page.
    clients = clientsRes.filter((c) => c.active || c.id === project.client_id);
    scopes = scopesRes;
    if (linksRes.error) throw linksRes.error;
    selectedScopeIds = linksRes.data.map((r) => r.scope_id);
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code !== "PGRST205") throw err;
  }

  const [billableSupported, visibilitySupported] = await Promise.all([
    isBillableColumnSupported(),
    isVisibilityColumnSupported(),
  ]);

  const boundAction = updateProjectAction.bind(null, id);

  return (
    <PageTransition>
      <ProjectForm
        project={project}
        action={boundAction}
        clients={clients}
        scopes={scopes}
        selectedScopeIds={selectedScopeIds}
        billableSupported={billableSupported}
        visibilitySupported={visibilitySupported}
      />
    </PageTransition>
  );
}
