import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { Project } from "@/lib/types";
import PageTransition from "@/components/PageTransition";
import ProjectsClient from "./ProjectsClient";
import { PAGE_SIZE } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string | string[];
    project_type?: string | string[];
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
  const searchTerm = (resolvedSearchParams.search_term ?? "").trim();
  const page = Math.max(1, parseInt(resolvedSearchParams.page ?? "1", 10) || 1);

  function applyFilters(query: ReturnType<typeof supabaseAdmin.from>) {
    let q = query.select("*", { count: "exact" });
    if (selectedStatuses.length > 0) {
      q = q.in("status", selectedStatuses);
    }
    if (selectedTypes.length > 0) {
      q = q.in("project_type", selectedTypes);
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

  return (
    <PageTransition>
      <ProjectsClient
        projects={(data ?? []) as Project[]}
        selectedStatuses={selectedStatuses}
        selectedTypes={selectedTypes}
        searchTerm={searchTerm}
        page={safePage}
        totalPages={totalPages}
        totalItems={totalItems}
      />
    </PageTransition>
  );
}
