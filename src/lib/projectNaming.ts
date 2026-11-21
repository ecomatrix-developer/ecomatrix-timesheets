import type { Project } from "./types";

/**
 * v3.0 display name, used everywhere a project is shown (dropdowns,
 * lists, export): "ECO Matrix no. | Client code + client's project no. |
 * Project name", e.g. "26-041 | SMS 25-200-01 | CCMB". With no client
 * number: "27-003 | HGS | Salem Housing". Falls back to the pre-v3.0
 * "#number - client - name" format for a legacy project with no
 * eco_matrix_number yet, so nothing changes for projects that predate
 * supabase_patch_9.
 */
export function buildProjectDisplayName(
  project: Project,
  clientShortCode?: string | null
): string {
  if (!project.eco_matrix_number) {
    return `${project.project_number ? `#${project.project_number} - ` : ""}${project.client_name} - ${project.name}`;
  }
  const code = clientShortCode || project.client_name;
  const middle = project.client_project_number ? `${code} ${project.client_project_number}` : code;
  return `${project.eco_matrix_number} | ${middle} | ${project.name}`;
}

/**
 * Folder name shown on the project page, parts joined with underscores
 * so a Drive folder can be named directly from it, e.g.
 * "26-041_SMS_25-200-01_CCMB". Only meaningful once a project has an
 * eco_matrix_number (v3.0 projects) — returns null for legacy projects.
 */
export function buildFolderName(project: Project, clientShortCode?: string | null): string | null {
  if (!project.eco_matrix_number) return null;
  const code = clientShortCode || project.client_name;
  const parts = [project.eco_matrix_number, code, project.client_project_number, project.name].filter(
    (p): p is string => !!p && p.trim() !== ""
  );
  return parts.join("_").replace(/\s+/g, "_");
}
