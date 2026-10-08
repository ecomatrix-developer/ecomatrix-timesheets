"use server";

import { revalidatePath } from "next/cache";
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
  redirect("/projects");
}

export interface NewProjectInput {
  project_number: string;
  client_name: string;
  name: string;
  description: string;
  project_type: string;
  status: string;
}

/**
 * Mirrors v1's real create_project.html: "Create New Project(s)" — a
 * bulk-add form where an admin can stack multiple project rows (via an
 * "Add New" button) and submit them all in one request.
 */
export async function createProjectsBulkAction(
  inputs: NewProjectInput[]
): Promise<{ success: boolean; error?: string; count?: number }> {
  await requireAdmin();

  if (!Array.isArray(inputs) || inputs.length === 0) {
    return { success: false, error: "No projects to create." };
  }

  const rows = inputs.map((p) => ({
    project_number: p.project_number?.trim() || null,
    client_name: p.client_name?.trim() ?? "",
    name: p.name?.trim() ?? "",
    description: p.description?.trim() || null,
    status: normalizeStatus(p.status),
    project_type: normalizeProjectType(p.project_type),
  }));

  for (const r of rows) {
    if (!r.client_name || !r.name) {
      return { success: false, error: "Client Name and Project Name are required for every row." };
    }
  }

  const { error } = await supabaseAdmin.from("projects").insert(rows);
  if (error) return { success: false, error: error.message };

  revalidatePath("/projects");
  return { success: true, count: rows.length };
}

export async function updateProjectAction(projectId: string, formData: FormData) {
  await requireAdmin();

  const { error } = await supabaseAdmin
    .from("projects")
    .update({
      project_number: String(formData.get("project_number") ?? "") || null,
      client_name: String(formData.get("client_name") ?? ""),
      name: String(formData.get("name") ?? ""),
      description: String(formData.get("description") ?? "") || null,
      status: normalizeStatus(formData.get("status")),
      project_type: normalizeProjectType(formData.get("project_type")),
    })
    .eq("id", projectId);
  if (error) throw error;

  revalidatePath("/projects");
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
}
