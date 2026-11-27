"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { PROJECT_STATUSES, type ProjectStatus } from "@/lib/constants";
import type { ProjectType } from "@/lib/types";

function normalizeStatus(input: FormDataEntryValue | null): ProjectStatus {
  const s = String(input ?? "active").toLowerCase().trim();
  return (PROJECT_STATUSES as readonly string[]).includes(s)
    ? (s as ProjectStatus)
    : "active";
}

// Matches v1's edit_project.html: any project with no explicit type (or an
// unrecognized one) defaults to "Energy Modelling".
function normalizeProjectType(input: FormDataEntryValue | null): ProjectType {
  return String(input ?? "") === "BIM and AutoCad" ? "BIM and AutoCad" : "Energy Modelling";
}

export async function createProjectAction(formData: FormData) {
  await requireAdmin();

  const { error } = await supabaseAdmin.from("projects").insert({
    project_number: String(formData.get("project_number") ?? "") || null,
    client_name: String(formData.get("client_name") ?? ""),
    name: String(formData.get("name") ?? ""),
    description: String(formData.get("description") ?? "") || null,
    status: normalizeStatus(formData.get("status")),
    project_type: normalizeProjectType(formData.get("project_type")),
  });
  if (error) throw error;

  revalidatePath("/projects");
  revalidateTag("projects");
  revalidateTag("database-stats");
  redirect("/projects");
}

export interface NewProjectInput {
  // v3.0: project_number is never user-typed when the taxonomy migration
  // (supabase_patch_9) is live — left here only so a pre-migration
  // client can still submit it exactly like before; the action ignores
  // it whenever client_id/scope_ids are present (the v3.0 path).
  project_number: string;
  client_name: string;
  name: string;
  description: string;
  project_type: string;
  status: string;
  // v3.0 fields — all optional, absent entirely on the pre-migration form.
  client_id?: string;
  client_project_number?: string;
  scope_ids?: string[];
  // v3.0 (supabase_patch_11) horizontal create form — the admin's edited
  // value for the auto-generated number, if they changed it. Empty/absent
  // means "use the next atomically-generated number" (the original
  // behavior). Only meaningful alongside client_id.
  eco_matrix_number_override?: string;
  // Absent on any form that predates supabase_patch_11 — the insert below
  // only includes the column when this is actually sent.
  billable?: boolean;
  // v3.0 (supabase_patch_12) — which UserType(s) may see this project on
  // the timesheet. Undefined (not just an empty array) means "don't touch
  // this column" — the create form only sends it when every user type is
  // NOT checked, i.e. the admin actually narrowed the audience down; an
  // empty/absent value here always means "everyone", matching the
  // column's own NULL default.
  visible_user_types?: string[];
}

/**
 * Mirrors v1's real create_project.html: "Create New Project(s)" — a
 * bulk-add form where an admin can stack multiple project rows (via an
 * "Add New" button) and submit them all in one request.
 *
 * v3.0: when a row carries client_id (meaning the create form detected
 * supabase_patch_9 is live and rendered the new fields), the ECO Matrix
 * number is generated server-side via generate_eco_matrix_number() —
 * never taken from the client — and project_scope_links rows are written
 * for its scope_ids. A row with no client_id falls back to the exact
 * pre-v3.0 behavior (free-typed project_number, no scopes), so this
 * keeps working unchanged until that migration has actually run.
 */
export async function createProjectsBulkAction(
  inputs: NewProjectInput[]
): Promise<{ success: boolean; error?: string; count?: number }> {
  const session = await requireAdmin();

  if (!Array.isArray(inputs) || inputs.length === 0) {
    return { success: false, error: "No projects to create." };
  }

  for (const p of inputs) {
    if (!p.client_id && !p.client_name?.trim()) {
      return { success: false, error: "Client is required for every row." };
    }
    if (!p.name?.trim()) {
      return { success: false, error: "Project Name is required for every row." };
    }
  }

  const createdIds: { id: string; scope_ids?: string[]; status: ProjectStatus }[] = [];

  // A row that fails partway through this loop must not leave EARLIER
  // rows from the same batch sitting in the DB while the admin is told
  // the whole operation failed — that's exactly how "26-003" ended up
  // permanently consumed-but-missing. Every early exit below goes through
  // this so a reported failure genuinely means nothing was created.
  async function rollbackAndFail(message: string) {
    if (createdIds.length > 0) {
      await supabaseAdmin.from("projects").delete().in("id", createdIds.map((c) => c.id));
    }
    return { success: false, error: message };
  }

  for (const p of inputs) {
    let clientName = p.client_name?.trim() ?? "";
    let ecoMatrixNumber: string | null = null;
    let projectNumber = p.project_number?.trim() || null;

    if (p.client_id) {
      const { data: client, error: clientErr } = await supabaseAdmin
        .from("clients")
        .select("name")
        .eq("id", p.client_id)
        .maybeSingle();
      if (clientErr) return rollbackAndFail(clientErr.message);
      if (!client) return rollbackAndFail("Selected client not found.");
      clientName = client.name;

      // Abeer, 2026-11-27: "if there is duplicate project number along
      // with client's project name and project name, so like if all the
      // four fields are already present in the backend, then it won't
      // allow to create another project" — project_number itself is
      // already globally unique (the DB's partial unique index on
      // eco_matrix_number, caught as 23505 below), so this catches the
      // other case: the SAME client + client's project number + name
      // being entered again under a new system-generated number.
      // ilike treats % and _ as wildcards — escape them so a name/number
      // that happens to contain either can't accidentally match things it
      // shouldn't (or, worse, turn into an unintentionally broad pattern).
      const escapeIlike = (s: string) => s.replace(/[%_]/g, "\\$&");
      const clientProjectNumber = p.client_project_number?.trim() || null;
      const nameTrimmed = p.name.trim();
      let dupQuery = supabaseAdmin
        .from("projects")
        .select("id")
        .eq("client_id", p.client_id)
        .ilike("name", escapeIlike(nameTrimmed));
      dupQuery = clientProjectNumber
        ? dupQuery.ilike("client_project_number", escapeIlike(clientProjectNumber))
        : dupQuery.is("client_project_number", null);
      const { data: dup, error: dupErr } = await dupQuery.limit(1).maybeSingle();
      if (dupErr) return rollbackAndFail(dupErr.message);
      if (dup) {
        return rollbackAndFail(
          `A project for this client with the same name${clientProjectNumber ? " and client's project number" : ""} already exists.`
        );
      }

      // v3.0 (supabase_patch_11): the horizontal create form shows the
      // next number up front and lets the admin edit it before saving —
      // an explicit override skips the atomic generator entirely instead
      // of generating a number and then throwing it away.
      const override = p.eco_matrix_number_override?.trim();
      if (override) {
        ecoMatrixNumber = override;
      } else {
        const { data: generated, error: genErr } = await supabaseAdmin.rpc(
          "generate_eco_matrix_number"
        );
        if (genErr) return rollbackAndFail(genErr.message);
        ecoMatrixNumber = generated as string;
      }
      projectNumber = ecoMatrixNumber; // keep every existing project_number-based
      // query/display/export working unchanged for new projects too.
    }

    const status = normalizeStatus(p.status);
    const { data: inserted, error } = await supabaseAdmin
      .from("projects")
      .insert({
        project_number: projectNumber,
        client_name: clientName,
        name: p.name.trim(),
        description: p.description?.trim() || null,
        status,
        project_type: normalizeProjectType(p.project_type),
        ...(p.client_id ? { client_id: p.client_id, eco_matrix_number: ecoMatrixNumber } : {}),
        ...(p.client_project_number?.trim()
          ? { client_project_number: p.client_project_number.trim() }
          : {}),
        ...(p.billable !== undefined ? { billable: p.billable } : {}),
        ...(p.visible_user_types !== undefined
          ? { visible_user_types: p.visible_user_types.length > 0 ? p.visible_user_types : null }
          : {}),
      })
      .select("id")
      .single();
    if (error) {
      // 23505 = unique_violation — almost always the partial unique index
      // on eco_matrix_number, hit when an admin manually typed a number
      // that's already in use. Friendlier than the raw Postgres message.
      if (error.code === "23505") {
        return rollbackAndFail(
          `Project number "${ecoMatrixNumber ?? projectNumber}" is already in use — pick a different one.`
        );
      }
      return rollbackAndFail(error.message);
    }

    createdIds.push({ id: inserted.id, scope_ids: p.scope_ids, status });
  }

  const scopeLinkRows = createdIds.flatMap(({ id, scope_ids }) =>
    (scope_ids ?? []).map((scope_id) => ({ project_id: id, scope_id }))
  );
  if (scopeLinkRows.length > 0) {
    const { error: linkErr } = await supabaseAdmin.from("project_scope_links").insert(scopeLinkRows);
    if (linkErr) return { success: false, error: linkErr.message };
  }

  // Best-effort audit trail — a failure here shouldn't undo the projects
  // that were already successfully created above.
  await supabaseAdmin.from("project_status_audit").insert(
    createdIds.map(({ id, status }) => ({
      project_id: id,
      old_status: null,
      new_status: status,
      changed_by: session.userId,
    }))
  );

  revalidatePath("/projects");
  revalidateTag("projects");
  revalidateTag("database-stats");
  return { success: true, count: createdIds.length };
}

export async function updateProjectAction(projectId: string, formData: FormData) {
  const session = await requireAdmin();

  const { data: existing, error: existingErr } = await supabaseAdmin
    .from("projects")
    .select("status")
    .eq("id", projectId)
    .maybeSingle();
  if (existingErr) throw existingErr;

  const status = normalizeStatus(formData.get("status"));
  const clientId = String(formData.get("client_id") ?? "").trim() || null;
  const clientProjectNumber = String(formData.get("client_project_number") ?? "").trim() || null;
  const scopeIdsRaw = formData.getAll("scope_ids");
  // v3.0 (supabase_patch_11/12) — only present once ProjectForm actually
  // rendered that field (billableSupported/visibilitySupported), same
  // "_submitted" sentinel pattern scope_ids already uses below, so an
  // absent field is left untouched rather than wiped back to a default.
  const billableSubmitted = formData.has("billable_submitted");
  const visibilitySubmitted = formData.has("visibility_submitted");
  const visibleUserTypesRaw = formData.getAll("visible_user_types").map(String).filter(Boolean);

  const { error } = await supabaseAdmin
    .from("projects")
    .update({
      project_number: String(formData.get("project_number") ?? "") || null,
      client_name: String(formData.get("client_name") ?? ""),
      name: String(formData.get("name") ?? ""),
      description: String(formData.get("description") ?? "") || null,
      status,
      project_type: normalizeProjectType(formData.get("project_type")),
      // v3.0 fields — only present on the form once supabase_patch_9 is
      // live; absent on the pre-migration form, so these stay untouched
      // (undefined keys aren't sent in a Supabase update) until then.
      ...(clientId ? { client_id: clientId } : {}),
      ...(clientProjectNumber !== null ? { client_project_number: clientProjectNumber } : {}),
      ...(billableSubmitted ? { billable: formData.get("billable") === "true" } : {}),
      // Empty array means "every type" (unrestricted) — stored as NULL,
      // matching createProjectsBulkAction's own convention exactly.
      ...(visibilitySubmitted
        ? { visible_user_types: visibleUserTypesRaw.length > 0 ? visibleUserTypesRaw : null }
        : {}),
    })
    .eq("id", projectId);
  if (error) throw error;

  if (scopeIdsRaw.length > 0 || formData.has("scopes_submitted")) {
    await supabaseAdmin.from("project_scope_links").delete().eq("project_id", projectId);
    const scopeIds = scopeIdsRaw.map(String).filter(Boolean);
    if (scopeIds.length > 0) {
      await supabaseAdmin
        .from("project_scope_links")
        .insert(scopeIds.map((scope_id) => ({ project_id: projectId, scope_id })));
    }
  }

  if (existing && existing.status !== status) {
    await supabaseAdmin.from("project_status_audit").insert({
      project_id: projectId,
      old_status: existing.status,
      new_status: status,
      changed_by: session.userId,
    });
  }

  revalidatePath("/projects");
  revalidateTag("projects");
  revalidateTag("database-stats");
  redirect("/projects");
}

/**
 * Fix vs v1: this is a real server action invoked via POST from a form/button,
 * not a plain GET link (v1's /projects/<id>/delete was reachable via GET,
 * meaning prefetch/crawlers could destroy data).
 *
 * The schema's FK is ON DELETE SET NULL (not CASCADE), so to match v1's
 * behavior of deleting that project's timesheet entries entirely, we
 * explicitly delete the entries first, then the project.
 */
export async function deleteProjectAction(projectId: string) {
  await requireAdmin();

  const { error: entriesError } = await supabaseAdmin
    .from("timesheet_entries")
    .delete()
    .eq("project_id", projectId);
  if (entriesError) throw entriesError;

  const { error } = await supabaseAdmin.from("projects").delete().eq("id", projectId);
  if (error) throw error;

  revalidatePath("/projects");
  revalidateTag("projects");
  revalidateTag("database-stats");
}
