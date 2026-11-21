import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { getProjectById, getAllClients, getAllProjectScopes } from "@/lib/data";
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
    clients = clientsRes;
    scopes = scopesRes;
    if (linksRes.error) throw linksRes.error;
    selectedScopeIds = linksRes.data.map((r) => r.scope_id);
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code !== "PGRST205") throw err;
  }

  const boundAction = updateProjectAction.bind(null, id);

  return (
    <PageTransition>
      <ProjectForm
        project={project}
        action={boundAction}
        clients={clients}
        scopes={scopes}
        selectedScopeIds={selectedScopeIds}
      />
    </PageTransition>
  );
}
