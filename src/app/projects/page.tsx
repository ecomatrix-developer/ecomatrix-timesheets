import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAllProjectScopes } from "@/lib/data";
import type { Project, ProjectScope } from "@/lib/types";
import PageTransition from "@/components/PageTransition";
import ProjectsClient from "./ProjectsClient";
import { PAGE_SIZE } from "@/lib/constants";

export const dynamic = "force-dynamic";

// A sentinel that matches no real project — used to force a zero-result
// page instead of accidentally sending an empty `.in("id", [])`, which
// PostgREST does not treat as "match nothing".
const NO_MATCH_ID = "00000000-0000-0000-0000-000000000000";

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string | string[];
    project_type?: string | string[];
    scope?: string | string[];
    search_term?: string;
    page?: string;
  }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "admin") redirect("/dashboard");

  const resolvedSearchParams = await searchParams;
  const statusesParam = resolvedSearchParams.status;
  // Default to "active" only when the status filter has never been touched
  // (no `status` key in the URL at all). Once the user clears every status
  // chip, the client still sends an explicit `status=` (empty) so this key
  // is present but resolves to [] below, distinct from "never touched".
  const statusWasTouched = "status" in resolvedSearchParams;
  const selectedStatuses = Array.isArray(statusesParam)
    ? statusesParam
    : statusesParam
    ? [statusesParam]
    : statusWasTouched
    ? []
    : ["active"];
  const typesParam = resolvedSearchParams.project_type;
  const selectedTypes = Array.isArray(typesParam) ? typesParam : typesParam ? [typesParam] : [];
  const scopesParam = resolvedSearchParams.scope;
  const selectedScopes = Array.isArray(scopesParam) ? scopesParam : scopesParam ? [scopesParam] : [];
  const searchTerm = (resolvedSearchParams.search_term ?? "").trim();
  const page = Math.max(1, parseInt(resolvedSearchParams.page ?? "1", 10) || 1);

  // v3.0 (supabase_patch_9/13): the real category a project belongs to
  // (Energy / BIM - Revit / BIM - CAD / Marketing & BD / ...) lives in
  // project_scope_links now, not the old 2-value project_type column —
  // Marketing & BD projects are otherwise invisible under "BIM and
  // AutoCad". Both the scope list (for filter chips) and the per-project
  // scope names (for the table's Type column) swallow a missing-table
  // error so this page still works exactly as before patch_9.
  let scopes: ProjectScope[] = [];
  try {
    scopes = await getAllProjectScopes();
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code !== "PGRST205") throw err;
  }

  let scopeFilterProjectIds: string[] | null = null;
  if (scopes.length > 0 && selectedScopes.length > 0) {
    const scopeIds = scopes.filter((s) => selectedScopes.includes(s.name)).map((s) => s.id);
    const { data: linkRows, error: linkErr } = await supabaseAdmin
      .from("project_scope_links")
      .select("project_id")
      .in("scope_id", scopeIds.length > 0 ? scopeIds : [NO_MATCH_ID]);
    if (linkErr) throw linkErr;
    scopeFilterProjectIds = [...new Set((linkRows ?? []).map((r) => r.project_id as string))];
  }

  function applyFilters(query: ReturnType<typeof supabaseAdmin.from>) {
    let q = query.select("*", { count: "exact" });
    if (selectedStatuses.length > 0) {
      q = q.in("status", selectedStatuses);
    }
    if (selectedTypes.length > 0) {
      q = q.in("project_type", selectedTypes);
    }
    if (scopeFilterProjectIds) {
      q = q.in("id", scopeFilterProjectIds.length > 0 ? scopeFilterProjectIds : [NO_MATCH_ID]);
    }
    if (searchTerm) {
      const escaped = searchTerm.replace(/[%_]/g, "\\$&");
      q = q.or(`client_name.ilike.%${escaped}%,name.ilike.%${escaped}%,project_number.ilike.%${escaped}%,project_type.ilike.%${escaped}%`);
    }
    return q;
  }

  // Count matching rows first so pagination reflects the current filters,
  // then fetch only the 10 rows for the requested page.
  const { count, error: countErr } = await applyFilters(
    supabaseAdmin.from("projects")
  ).order("name");
  if (countErr) throw countErr;

  const totalItems = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const from = (safePage - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const { data, error } = await applyFilters(supabaseAdmin.from("projects"))
    .order("name")
    .range(from, to);
  if (error) throw error;

  const projects = (data ?? []) as Project[];

  // Best-effort — falls back to every row showing its legacy project_type
  // badge (exactly today's behavior) rather than failing the whole page if
  // this embedded-FK query ever errors for an unforeseen reason.
  const scopeNamesByProject: Record<string, string[]> = {};
  if (scopes.length > 0 && projects.length > 0) {
    try {
      const { data: links, error: linkErr } = await supabaseAdmin
        .from("project_scope_links")
        .select("project_id, project_scopes(name)")
        .in(
          "project_id",
          projects.map((p) => p.id)
        );
      if (linkErr) throw linkErr;
      for (const l of (links ?? []) as unknown as {
        project_id: string;
        project_scopes: { name: string } | { name: string }[] | null;
      }[]) {
        const embedded = l.project_scopes;
        const name = Array.isArray(embedded) ? embedded[0]?.name : embedded?.name;
        if (!name) continue;
        (scopeNamesByProject[l.project_id] ??= []).push(name);
      }
    } catch {
      // swallow — scopeNamesByProject stays empty, Type column falls back
    }
  }

  return (
    <PageTransition>
      <ProjectsClient
        projects={projects}
        selectedStatuses={selectedStatuses}
        selectedTypes={selectedTypes}
        scopes={scopes}
        selectedScopes={selectedScopes}
        scopeNamesByProject={scopeNamesByProject}
        searchTerm={searchTerm}
        page={safePage}
        totalPages={totalPages}
        totalItems={totalItems}
      />
    </PageTransition>
  );
}
