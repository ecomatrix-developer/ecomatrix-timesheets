import type { ProjectScope } from "./types";

// v3.0 (supabase_patch_11; multi-select per Abeer's 2026-11-21 follow-up:
// "project type we can choose multi select energy bim so that a single
// project can have energy as well as bim"). Each checked category maps to
// one project_scopes row (for the timesheet taxonomy — a project with
// several checked gets several scope links, and the comment modal shows
// the UNION of all their tasks) and feeds the legacy project_type enum
// (for every pre-v3.0 page that still groups by it — dashboard, insights,
// exports).
//
// 2026-11-22 (second request): BIM was briefly collapsed into one single
// "BIM/CADD" option (both Revit AND CAD tasks together, no way to pick
// just one), per Abeer's own earlier request. Reversed again, same day,
// once he hit the consequence: "there is only one option as Bim so based
// on that we cant check the comments so add a option as Bim cad and Bim
// revit along with bim" — a project that's specifically Revit-only or
// CAD-only work needs its comment dropdown to show ONLY that discipline's
// tasks, not the merged union. "BIM" (-> BIM/CADD) stays as the broad
// option for projects that genuinely span both; "BIM - Revit" and
// "BIM - CAD" are the two precise ones, each wired to its own existing
// scope/billing-group (supabase_patch_9 already seeded all three scopes —
// nothing new to migrate).
//
// Shared between CreateProjectClient and ProjectForm (edit) so both pages
// present the exact same category experience.
export const CATEGORY_OPTIONS = [
  { value: "energy", label: "Energy" },
  { value: "bim", label: "BIM" },
  { value: "bim_revit", label: "BIM - Revit" },
  { value: "bim_cad", label: "BIM - CAD" },
  { value: "marketing_bd", label: "Marketing & BD" },
] as const;
export type Category = (typeof CATEGORY_OPTIONS)[number]["value"];

export const CATEGORY_TO_SCOPE_NAME: Record<Category, string> = {
  energy: "Energy",
  bim: "BIM/CADD",
  bim_revit: "BIM - Revit",
  bim_cad: "BIM - CAD",
  marketing_bd: "Marketing & BD",
};
export const CATEGORY_TO_LEGACY_TYPE: Record<Category, string> = {
  energy: "Energy Modelling",
  bim: "BIM and AutoCad",
  bim_revit: "BIM and AutoCad",
  bim_cad: "BIM and AutoCad",
  marketing_bd: "BIM and AutoCad",
};
export const CATEGORY_LABEL: Record<Category, string> = {
  energy: "Energy",
  bim: "BIM",
  bim_revit: "BIM - Revit",
  bim_cad: "BIM - CAD",
  marketing_bd: "Marketing & BD",
};

// Every BIM-family scope name maps straight back to its own pill — no
// more folding Revit/CAD onto the generic "BIM" option, so a project
// that's specifically one discipline shows as exactly that pill checked.
const SCOPE_NAME_TO_CATEGORY: Record<string, Category> = {
  Energy: "energy",
  "BIM/CADD": "bim",
  "BIM - Revit": "bim_revit",
  "BIM - CAD": "bim_cad",
  "Marketing & BD": "marketing_bd",
};

export function isMarketingOnly(categories: Category[]): boolean {
  return categories.length === 1 && categories[0] === "marketing_bd";
}

// Legacy project_type only has 2 buckets; any BIM-family pill (bim,
// bim_revit, bim_cad) wins if checked at all (matches the pre-multi-select
// behavior), else Energy, else (Marketing & BD alone) falls back to "BIM
// and AutoCad" — the same convention patch_9's own internal Marketing &
// BD project already uses.
export function legacyTypeForCategories(categories: Category[]): string {
  if (categories.some((c) => c === "bim" || c === "bim_revit" || c === "bim_cad")) {
    return CATEGORY_TO_LEGACY_TYPE.bim;
  }
  if (categories.includes("energy")) return CATEGORY_TO_LEGACY_TYPE.energy;
  return CATEGORY_TO_LEGACY_TYPE.marketing_bd;
}

// Reverse mapping, used by the Edit page to turn an existing project's
// linked scope ids back into checked categories for the pill picker.
export function categoriesFromScopeIds(scopeIds: string[], scopes: ProjectScope[]): Category[] {
  const scopeById = new Map(scopes.map((s) => [s.id, s.name]));
  const categories = new Set<Category>();
  for (const id of scopeIds) {
    const name = scopeById.get(id);
    const category = name ? SCOPE_NAME_TO_CATEGORY[name] : undefined;
    if (category) categories.add(category);
  }
  return categories.size > 0 ? [...categories] : ["energy"];
}

// Category -> the one scope id each resolves to (skipping any category
// whose named scope isn't in the given catalog, so a not-yet-migrated/
// partial scopes table degrades to "no scope links" rather than crashing).
export function scopeIdsFromCategories(categories: Category[], scopes: ProjectScope[]): string[] {
  return categories
    .map((c) => scopes.find((s) => s.name === CATEGORY_TO_SCOPE_NAME[c])?.id)
    .filter((id): id is string => !!id);
}
