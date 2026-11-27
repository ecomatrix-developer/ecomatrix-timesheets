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
// 2026-11-22: briefly collapsed BIM into one "BIM/CADD" option, reverted
// the same day to separate "BIM - Revit"/"BIM - CAD" pills because the
// merged option's comment dropdown only showed one discipline's tasks.
// 2026-11-27: merged back to a single "BIM" option — Abeer: "there would
// be no BIM Revit and BIM CAD separately... inside BIM it will handle
// both Revit and CAD comments." This time it genuinely does: "bim" maps
// to the "BIM/CADD" scope, which supabase_patch_9 already links to BOTH
// the Revit and CAD billing groups, so buildProjectTaskMap (taxonomy.ts)
// unions both disciplines' tasks into one project's comment dropdown —
// the 2026-11-22 problem (only one discipline's tasks showing) doesn't
// recur, since nothing here narrows a project down to a single discipline
// anymore. The old "BIM - Revit"/"BIM - CAD" scopes stay in the DB
// untouched (existing projects keep their current tasks until re-saved —
// see SCOPE_NAME_TO_CATEGORY below); they're just no longer offered as
// NEW choices.
//
// Shared between CreateProjectClient and ProjectForm (edit) so both pages
// present the exact same category experience.
export const CATEGORY_OPTIONS = [
  { value: "energy", label: "Energy" },
  { value: "bim", label: "BIM" },
  { value: "marketing_bd", label: "Marketing & BD" },
] as const;
export type Category = (typeof CATEGORY_OPTIONS)[number]["value"];

export const CATEGORY_TO_SCOPE_NAME: Record<Category, string> = {
  energy: "Energy",
  bim: "BIM/CADD",
  marketing_bd: "Marketing & BD",
};
export const CATEGORY_TO_LEGACY_TYPE: Record<Category, string> = {
  energy: "Energy Modelling",
  bim: "BIM and AutoCad",
  marketing_bd: "BIM and AutoCad",
};
export const CATEGORY_LABEL: Record<Category, string> = {
  energy: "Energy",
  bim: "BIM",
  marketing_bd: "Marketing & BD",
};

// Folds the old "BIM - Revit"/"BIM - CAD" scopes back onto the generic
// "BIM" pill — an existing project linked to either (from before the
// 2026-11-27 merge) still shows correctly checked on Edit instead of
// appearing to have no category at all. Its actual scope_links row isn't
// touched until the project is next saved, at which point it resolves to
// "BIM/CADD" like every other BIM project.
const SCOPE_NAME_TO_CATEGORY: Record<string, Category> = {
  Energy: "energy",
  "BIM/CADD": "bim",
  "BIM - Revit": "bim",
  "BIM - CAD": "bim",
  "Marketing & BD": "marketing_bd",
};

// Abeer, 2026-11-27: "remove the separate filters of bim cad and bim
// revit from there no need as we have only one category" — the Projects
// page's category filter pills are built from the FULL live project_scopes
// table (so an existing project linked to either retired scope still
// counts/filters correctly), which still has these two rows for the
// reason SCOPE_NAME_TO_CATEGORY above does. UI lists that render one pill
// per scope (the Projects page filter, SearchableProjectSelect's type
// filter) should filter these out before rendering.
export const RETIRED_SCOPE_NAMES = new Set(["BIM - Revit", "BIM - CAD"]);

export function isMarketingOnly(categories: Category[]): boolean {
  return categories.length === 1 && categories[0] === "marketing_bd";
}

// Legacy project_type only has 2 buckets; BIM wins if checked at all
// (matches the pre-multi-select behavior), else Energy, else (Marketing &
// BD alone) falls back to "BIM and AutoCad" — the same convention
// patch_9's own internal Marketing & BD project already uses.
export function legacyTypeForCategories(categories: Category[]): string {
  if (categories.includes("bim")) return CATEGORY_TO_LEGACY_TYPE.bim;
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
