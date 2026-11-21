import "server-only";
import { isAdminOrAbove } from "./session";
import type { Project, SessionPayload } from "./types";

/**
 * v3.0 (supabase_patch_12, tightened 2026-11-21 per Abeer, then refined
 * same day once he hit the consequence of the first version: "all 198
 * projects cant be again edit and made to emp intern consultant... by
 * default emp will see all projects whether updated from frontend or
 * not"). Can this session SELECT this project as a new timesheet row?
 *
 * Three tiers, not two:
 *  - Admin/Super Admin: always see everything.
 *  - No userType assigned yet (every real employee today, before roles
 *    are rolled out), OR userType is "employee" specifically: sees every
 *    project UNLESS it has an explicit visible_user_types list that
 *    excludes "employee" — i.e. the old, lenient "visible unless
 *    narrowed down" rule. Employee is the default/baseline role covering
 *    almost the whole org, so it keeps the behavior every existing
 *    project already has without needing all 198 of them individually
 *    re-scoped.
 *  - Any OTHER assigned userType (Intern/Consultant/Accountant/Marketing
 *    & BD) is strict allow-list-only: visible only if that project's
 *    visible_user_types explicitly includes it. These are the exception
 *    roles that are actually meant to be scoped to specific projects.
 *
 * Deliberately NOT used to hide a project's EXISTING rows/history on the
 * grid (see timesheet/page.tsx) — only to filter the "add a project"
 * picker, so narrowing a project's audience later never hides hours an
 * employee already logged against it.
 */
export function isProjectSelectableBySession(project: Project, session: SessionPayload): boolean {
  if (isAdminOrAbove(session)) return true;
  const allowed = project.visible_user_types;
  if (!session.userType || session.userType === "employee") {
    return !allowed || allowed.length === 0 || allowed.includes("employee");
  }
  return !!allowed && allowed.includes(session.userType);
}

export function filterSelectableProjects(projects: Project[], session: SessionPayload): Project[] {
  return projects.filter((p) => isProjectSelectableBySession(p, session));
}
