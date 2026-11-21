import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import {
  getAllClients,
  getAllProjectScopes,
  isBillableColumnSupported,
  isVisibilityColumnSupported,
  peekNextEcoMatrixNumber,
} from "@/lib/data";
import PageTransition from "@/components/PageTransition";
import CreateProjectClient from "./CreateProjectClient";
import type { Client, ProjectScope } from "@/lib/types";

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

  return (
    <PageTransition>
      <CreateProjectClient
        clients={clients}
        scopes={scopes}
        fullV3={fullV3}
        nextNumberPreview={nextNumberPreview}
        visibilitySupported={visibilitySupported}
      />
    </PageTransition>
  );
}
