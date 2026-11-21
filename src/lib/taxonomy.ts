import type { TimesheetTaxonomy } from "./data";

/**
 * Builds project_id -> active task names (deduped, grouped by billing
 * group) from one batched getTimesheetTaxonomy() fetch — computed once
 * server-side and passed down as a plain object, same pattern as
 * toProjectMap/toUserMap, rather than querying per project.
 */
export function buildProjectTaskMap(taxonomy: TimesheetTaxonomy): Record<string, string[]> {
  const activeBillingGroupIds = new Set(
    taxonomy.billingGroups.filter((g) => g.active).map((g) => g.id)
  );

  const tasksByBillingGroup = new Map<string, string[]>();
  for (const t of taxonomy.tasks) {
    if (!t.active || !activeBillingGroupIds.has(t.billing_group_id)) continue;
    const arr = tasksByBillingGroup.get(t.billing_group_id) ?? [];
    arr.push(t.name);
    tasksByBillingGroup.set(t.billing_group_id, arr);
  }

  const billingGroupsByScope = new Map<string, string[]>();
  for (const link of taxonomy.scopeBillingGroupLinks) {
    const arr = billingGroupsByScope.get(link.scope_id) ?? [];
    arr.push(link.billing_group_id);
    billingGroupsByScope.set(link.scope_id, arr);
  }

  const scopesByProject = new Map<string, string[]>();
  for (const link of taxonomy.projectScopeLinks) {
    const arr = scopesByProject.get(link.project_id) ?? [];
    arr.push(link.scope_id);
    scopesByProject.set(link.project_id, arr);
  }

  const result: Record<string, string[]> = {};
  for (const [projectId, scopeIds] of scopesByProject) {
    const seen = new Set<string>();
    const names: string[] = [];
    for (const scopeId of scopeIds) {
      for (const groupId of billingGroupsByScope.get(scopeId) ?? []) {
        for (const name of tasksByBillingGroup.get(groupId) ?? []) {
          if (!seen.has(name)) {
            seen.add(name);
            names.push(name);
          }
        }
      }
    }
    // "Other" naturally lands wherever its billing group happened to be
    // merged in (e.g. right after Energy's own tasks, before Revit's get
    // appended) once a project has more than one scope — Abeer asked for
    // it to always be the last option in the comment modal regardless.
    const otherIndex = names.indexOf("Other");
    if (otherIndex !== -1 && otherIndex !== names.length - 1) {
      names.splice(otherIndex, 1);
      names.push("Other");
    }
    result[projectId] = names;
  }
  return result;
}

/**
 * project_id -> its scope name(s) (e.g. "Energy", "BIM - Revit",
 * "Marketing & BD"), from the SAME taxonomy fetch buildProjectTaskMap
 * uses — no extra query. Used by the timesheet page's project picker
 * filter (supabase_patch_9/13), the finer-grained replacement for
 * filtering by the old flat project_type.
 */
export function buildProjectScopeNameMap(taxonomy: TimesheetTaxonomy): Record<string, string[]> {
  const scopeNameById = new Map(taxonomy.scopes.map((s) => [s.id, s.name]));
  const result: Record<string, string[]> = {};
  for (const link of taxonomy.projectScopeLinks) {
    const name = scopeNameById.get(link.scope_id);
    if (!name) continue;
    (result[link.project_id] ??= []).push(name);
  }
  return result;
}

export type TaskBucket = "Energy" | "Revit" | "Cad" | "ShopDrawings";

/**
 * Maps both the OLD (pre-v3.0, flat COMMENT_CATEGORIES) and NEW
 * (billing-group/task taxonomy) category names to the same coarse
 * bucket used by the monthly billing export's classifier
 * (monthlyTimesheetWorkbook.ts) and the Insights "Energy Modeling
 * Category Hours" chart (InsightsClient.tsx). Kept as the one shared
 * source both of those import from, instead of each maintaining its own
 * parallel string list that could silently drift out of sync with a
 * future taxonomy rename. Anything not in this map (Other, every
 * Marketing & BD task, unrecognized/blank) is intentionally left
 * unmapped — both callers already have their own "Other" fallback.
 */
export const TASK_NAME_TO_BUCKET: Record<string, TaskBucket> = {
  Geometry: "Energy",
  "Thermal Template": "Energy", // pre-rename, kept so old history still buckets correctly
  "Thermal setup": "Energy",
  HVAC: "Energy",
  "Simulation & QA/QC": "Energy",
  Reporting: "Energy",
  Review: "Energy",
  "Coordination & meetings": "Energy",
  "BIM-REVIT": "Revit", // pre-rename
  "Revit modeling": "Revit",
  "Revit review": "Revit",
  "Revit Coordination & meetings": "Revit",
  "BIM-CAD": "Cad", // pre-rename
  "CAD drafting": "Cad",
  "CAD review": "Cad",
  "CAD Coordination & meetings": "Cad",
  "Shop drawings": "ShopDrawings",
  "Shop drawing review": "ShopDrawings",
};
