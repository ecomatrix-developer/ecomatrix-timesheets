import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import {
  getAllClients,
  getAllProjects,
  getAllProjectScopes,
  isBillableColumnSupported,
  isVisibilityColumnSupported,
  peekNextEcoMatrixNumber,
} from "@/lib/data";
import PageTransition from "@/components/PageTransition";
import CreateProjectClient from "./CreateProjectClient";
import type { Client, Project, ProjectScope } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function CreateProjectPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "admin") redirect("/dashboard");

  // v3.0: if supabase_patch_9 hasn't been run yet, these tables don't
  // exist — fall back to empty lists, which makes CreateProjectClient
  // render the exact pre-v3.0 form (free-typed project number/client
  // name, no scope picker) instead of 500ing for every admin.
  let clients: Client[] = [];
  let scopes: ProjectScope[] = [];
  try {
    [clients, scopes] = await Promise.all([getAllClients(), getAllProjectScopes()]);
    // A new project should only ever be assigned an active client —
    // deactivating one (via the new /clients page) removes it from this
    // picker without touching any existing project that already uses it.
    clients = clients.filter((c) => c.active);
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code !== "PGRST205") throw err;
  }

  // v3.0 (supabase_patch_11): the new horizontal "type → number → client →
  // name" layout and the Billable/Non-billable field only render once both
  // the billable column and the number-preview function exist — these two
  // helpers never throw, so a partial/not-yet-run patch_11 just keeps the
  // page on the existing (patch_9-only) create form, same as today.
  const [billableSupported, nextNumberPreview, visibilitySupported] = await Promise.all([
    isBillableColumnSupported(),
    peekNextEcoMatrixNumber(),
    isVisibilityColumnSupported(),
  ]);
  const fullV3 = clients.length > 0 && billableSupported && !!nextNumberPreview;

  // Abeer, 2026-11-27: "show below the drop-down where it will show the
  // previous project so that user comes to know that existing project is
  // there" — every project, for the client-side duplicate-detection hints
  // under Project Number / Client's Project Number / Project Name (see
  // findMatches in CreateProjectClient.tsx). Small enough (a few hundred
  // rows) to ship whole rather than building a search endpoint.
  let existingProjects: Project[] = [];
  try {
    existingProjects = await getAllProjects();
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code !== "PGRST205") throw err;
  }

  return (
    <PageTransition>
      <CreateProjectClient
        clients={clients}
        scopes={scopes}
        fullV3={fullV3}
        nextNumberPreview={nextNumberPreview}
        visibilitySupported={visibilitySupported}
        existingProjects={existingProjects}
      />
    </PageTransition>
  );
}
