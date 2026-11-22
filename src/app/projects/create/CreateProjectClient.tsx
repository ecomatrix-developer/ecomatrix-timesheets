"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { FaPlus, FaSave, FaTrash, FaMagic } from "react-icons/fa";
import { PROJECT_STATUSES, USER_TYPE_OPTIONS, ALL_USER_TYPES } from "@/lib/constants";
import {
  CATEGORY_OPTIONS,
  CATEGORY_TO_SCOPE_NAME,
  CATEGORY_LABEL,
  isMarketingOnly,
  legacyTypeForCategories,
  type Category,
} from "@/lib/projectCategories";
import {
  createProjectsBulkAction,
  type NewProjectInput,
} from "@/app/(actions)/projectActions";
import { toast } from "@/lib/toast";
import Select from "@/components/Select";
import BackLink from "@/components/BackLink";
import type { Client, ProjectScope } from "@/lib/types";

// v3.0 (supabase_patch_12): who may see/select this project on the
// timesheet. Every type checked (the default for a new row) means
// "everyone" — identical to how every pre-patch_12 project already
// behaves — so a project only becomes restricted when an admin actually
// unchecks something. USER_TYPE_OPTIONS/ALL_USER_TYPES live in
// lib/constants.ts so ProjectForm's edit-side picker always offers the
// same set.

interface RowState extends NewProjectInput {
  _id: number;
  categories: Category[];
  eco_number: string;
  // True only once the admin has actually typed into the Project Number
  // field — distinguishes "still showing the auto-generated preview" (use
  // the real atomic generator at save time) from "admin wants exactly
  // this number" (send it as an override). Without this distinction every
  // row would send the previewed number as an override and the real
  // counter would never advance, producing the exact duplicate-number bug
  // Abeer hit (re-using "26-001" every time).
  ecoNumberEdited: boolean;
  visibleTypes: string[];
}

let nextId = 0;

function parsePreview(preview: string | null): { year: string; seq: number } {
  const match = preview?.match(/^(\d{2})-(\d{3})$/);
  if (!match) {
    return { year: String(new Date().getFullYear() % 100).padStart(2, "0"), seq: 1 };
  }
  return { year: match[1], seq: parseInt(match[2], 10) };
}

function blankRow(v3: boolean): RowState {
  return {
    _id: nextId++,
    project_number: "",
    client_name: "",
    client_id: "",
    client_project_number: "",
    name: "",
    description: "",
    project_type: "Energy Modelling",
    status: "active",
    scope_ids: v3 ? [] : undefined,
    categories: ["energy"],
    eco_number: "",
    ecoNumberEdited: false,
    billable: true,
    visibleTypes: [...ALL_USER_TYPES],
  };
}

/**
 * Mirrors v1's real create_project.html: "Create New Project(s)" — a
 * stack of project forms with an "Add New" button, submitted together in
 * one bulk request.
 *
 * Three render tiers, each a strict superset of the one before it, so the
 * page degrades gracefully to whichever migrations have actually been run:
 *  - Neither patch_9 nor patch_11 run: the exact original pre-v3.0 form
 *    (free-typed project number/client name, no scope picker).
 *  - patch_9 run, patch_11 not yet: the v3.0 form (client picker, scope
 *    chips, system-generated number on save) — unchanged from before.
 *  - Both run (`fullV3`): the new horizontal "type → number → client →
 *    name" layout from Abeer's 2026-11-21 request, with a live preview
 *    string, Billable/Non-billable, and a reduced Marketing & BD variant
 *    (name/status/billable/description only — no number/client fields,
 *    since that bucket logs internal, non-client work).
 */
export default function CreateProjectClient({
  clients,
  scopes,
  fullV3 = false,
  nextNumberPreview = null,
  visibilitySupported = false,
}: {
  clients: Client[];
  scopes: ProjectScope[];
  fullV3?: boolean;
  nextNumberPreview?: string | null;
  visibilitySupported?: boolean;
}) {
  const router = useRouter();
  const v3 = clients.length > 0;
  const [pending, startTransition] = useTransition();

  // Only a live-preview hint for the admin — the authoritative number is
  // still allocated atomically server-side at save time (see
  // generate_eco_matrix_number in projectActions.ts). Seeded once from the
  // server-peeked value (a prop, so already known on the very first
  // render) — a genuine race with another admin saving in between just
  // means an edited/duplicate number, which this admin can see and fix
  // before saving.
  const numberBase = useRef(parsePreview(nextNumberPreview)).current;
  const numberCounter = useRef(numberBase.seq);
  function nextPreviewNumber(): string {
    const seq = numberCounter.current++;
    return `${numberBase.year}-${String(seq).padStart(3, "0")}`;
  }

  const [rows, setRows] = useState(() => {
    const row = blankRow(v3);
    if (fullV3 && !isMarketingOnly(row.categories)) {
      row.eco_number = nextPreviewNumber();
    }
    return [row];
  });

  function addRow() {
    setRows((prev) => {
      const row = blankRow(v3);
      if (fullV3 && !isMarketingOnly(row.categories)) {
        row.eco_number = nextPreviewNumber();
      }
      return [...prev, row];
    });
  }

  function removeRow(id: number) {
    setRows((prev) => (prev.length > 1 ? prev.filter((r) => r._id !== id) : prev));
  }

  function updateRow(id: number, patch: Partial<RowState>) {
    setRows((prev) => prev.map((r) => (r._id === id ? { ...r, ...patch } : r)));
  }

  function toggleCategory(id: number, category: Category) {
    setRows((prev) =>
      prev.map((r) => {
        if (r._id !== id) return r;
        const has = r.categories.includes(category);
        if (has && r.categories.length === 1) return r; // keep at least one checked
        const categories = has
          ? r.categories.filter((c) => c !== category)
          : [...r.categories, category];
        const marketingOnly = isMarketingOnly(categories);
        // Assign a preview number the first time a row switches INTO a
        // numbered state (anything but Marketing & BD alone) — never
        // regenerate one that already exists.
        const eco_number = !marketingOnly && !r.eco_number ? nextPreviewNumber() : r.eco_number;
        // Matches Abeer's own scope/billing-group table: Energy and BIM
        // are billable, Marketing & BD alone is not — a sensible default
        // on category change, still freely editable via the Billing
        // dropdown.
        const billable = !marketingOnly;
        return { ...r, categories, eco_number, billable };
      })
    );
  }

  function toggleScope(id: number, scopeId: string) {
    setRows((prev) =>
      prev.map((r) => {
        if (r._id !== id) return r;
        const current = r.scope_ids ?? [];
        const next = current.includes(scopeId)
          ? current.filter((s) => s !== scopeId)
          : [...current, scopeId];
        return { ...r, scope_ids: next };
      })
    );
  }

  function toggleVisibleType(id: number, type: string) {
    setRows((prev) =>
      prev.map((r) => {
        if (r._id !== id) return r;
        const has = r.visibleTypes.includes(type);
        if (has && r.visibleTypes.length === 1) return r; // always keep at least one
        const next = has ? r.visibleTypes.filter((t) => t !== type) : [...r.visibleTypes, type];
        return { ...r, visibleTypes: next };
      })
    );
  }

  // v3.0 (supabase_patch_12) — shared between the fullV3 and legacy/v3
  // branches below, since visibility is independent of which numbering
  // tier the project otherwise uses.
  function renderVisibilityPicker(row: RowState) {
    if (!visibilitySupported) return null;
    const everyone = row.visibleTypes.length === ALL_USER_TYPES.length;
    return (
      <div>
        <label className="text-sm text-muted mb-1 block">
          Visible To{" "}
          {everyone && <span className="font-normal text-muted">(everyone — default)</span>}
        </label>
        <div className="flex flex-wrap gap-2">
          {USER_TYPE_OPTIONS.map((o) => {
            const checked = row.visibleTypes.includes(o.value);
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => toggleVisibleType(row._id, o.value)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  checked
                    ? "bg-accent text-white border-accent"
                    : "bg-white text-muted border-gray-200 hover:border-gray-300"
                }`}
              >
                {o.label}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  function buildPreview(row: RowState): string {
    const categoryLabel = row.categories.map((c) => CATEGORY_LABEL[c]).join(" + ");
    const client = clients.find((c) => c.id === row.client_id);
    const code = client?.short_code ?? "";
    const middle = row.client_project_number?.trim()
      ? `${code} ${row.client_project_number.trim()}`.trim()
      : code;
    let out = `${categoryLabel} ${row.eco_number || "…"}`;
    if (middle) out += ` | ${middle}`;
    if (row.name.trim()) out += ` | ${row.name.trim()}`;
    return out;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (fullV3) {
      for (const r of rows) {
        const marketingOnly = isMarketingOnly(r.categories);
        if (!marketingOnly && !r.client_id) {
          toast.error("Pick a client for every project row.");
          return;
        }
        if (!marketingOnly && !r.eco_number.trim()) {
          toast.error("Project number is required for every project row.");
          return;
        }
        if (!r.name.trim()) {
          toast.error("Project Name is required for every row.");
          return;
        }
      }
    } else if (v3 && rows.some((r) => !r.client_id)) {
      toast.error("Pick a client for every row.");
      return;
    }

    startTransition(async () => {
      const result = await createProjectsBulkAction(
        rows.map((row): NewProjectInput => {
          const visibleUserTypes = visibilitySupported
            ? row.visibleTypes.length === ALL_USER_TYPES.length
              ? []
              : row.visibleTypes
            : undefined;

          if (!fullV3) {
            return {
              project_number: row.project_number,
              client_name: row.client_name,
              client_id: row.client_id,
              client_project_number: row.client_project_number,
              name: row.name,
              description: row.description,
              project_type: row.project_type,
              status: row.status,
              scope_ids: row.scope_ids,
              visible_user_types: visibleUserTypes,
            };
          }

          const isMarketing = isMarketingOnly(row.categories);
          const scopeIds = row.categories
            .map((c) => scopes.find((s) => s.name === CATEGORY_TO_SCOPE_NAME[c])?.id)
            .filter((id): id is string => !!id);
          const client = clients.find((c) => c.id === row.client_id);
          return {
            project_number: "",
            client_name: isMarketing ? "ECO Matrix" : client?.name ?? "",
            client_id: isMarketing ? undefined : row.client_id,
            client_project_number: isMarketing ? undefined : row.client_project_number,
            // Only an actually-edited number is sent as an override — the
            // previewed default must fall through to undefined so the
            // server calls the real atomic generator instead of re-saving
            // the same preview number every time (see RowState.ecoNumberEdited).
            eco_matrix_number_override:
              isMarketing || !row.ecoNumberEdited ? undefined : row.eco_number.trim(),
            name: row.name,
            description: row.description,
            project_type: legacyTypeForCategories(row.categories),
            status: row.status,
            billable: row.billable,
            scope_ids: scopeIds,
            visible_user_types: visibleUserTypes,
          };
        })
      );
      if (result.success) {
        toast.success(`${result.count} project${result.count === 1 ? "" : "s"} created.`);
        router.push("/projects");
      } else {
        toast.error(result.error ?? "Could not create projects.");
      }
    });
  }

  return (
    <div className="w-full">
      <BackLink href="/projects" label="Back to Projects" />
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 mb-6">
        <h1 className="text-xl font-semibold">Create New Project(s)</h1>
        <p className="text-xs text-muted">
          {fullV3
            ? "Project number auto-fills — edit it if needed."
            : v3
            ? "ECO Matrix number is assigned automatically on save."
            : "Use “Add New” to create several projects at once."}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <AnimatePresence initial={false}>
          {rows.map((row, i) => (
            <motion.div
              key={row._id}
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="glass-strong p-5 flex flex-col gap-3 relative"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-muted">Project {i + 1}</h3>
                {rows.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeRow(row._id)}
                    className="text-red-600 hover:text-red-700 p-1"
                    title="Remove this project"
                  >
                    <FaTrash className="h-3 w-3" />
                  </button>
                )}
              </div>

              {fullV3 ? (
                <>
                  <div>
                    <label className="text-sm text-muted mb-1 block">Project Type</label>
                    <div className="flex flex-wrap gap-2">
                      {CATEGORY_OPTIONS.map((o) => {
                        const checked = row.categories.includes(o.value);
                        return (
                          <button
                            key={o.value}
                            type="button"
                            onClick={() => toggleCategory(row._id, o.value)}
                            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                              checked
                                ? "bg-accent text-white border-accent"
                                : "bg-white text-muted border-gray-200 hover:border-gray-300"
                            }`}
                          >
                            {o.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {isMarketingOnly(row.categories) ? (
                    <div>
                      <label className="text-sm text-muted mb-1 block">Project Name *</label>
                      <input
                        required
                        value={row.name}
                        onChange={(e) => updateRow(row._id, { name: e.target.value })}
                        className="glass-input w-full px-3 py-2"
                      />
                    </div>
                  ) : (
                    <>
                      <div className="flex flex-wrap items-end gap-2">
                        <div className="w-28">
                          <label className="text-sm text-muted mb-1 block">Project Number</label>
                          <input
                            value={row.eco_number}
                            onChange={(e) =>
                              updateRow(row._id, { eco_number: e.target.value, ecoNumberEdited: true })
                            }
                            className="glass-input w-full px-3 py-2"
                          />
                        </div>
                        <span className="text-muted font-semibold pb-2.5">|</span>
                        <div className="flex-1 min-w-[180px]">
                          <label className="text-sm text-muted mb-1 block">Client *</label>
                          <Select
                            value={row.client_id ?? ""}
                            onChange={(value) => updateRow(row._id, { client_id: value })}
                            placeholder="-- Select Client --"
                            options={clients.map((c) => ({
                              value: c.id,
                              label: `${c.short_code} — ${c.name}`,
                            }))}
                          />
                        </div>
                        <div className="flex-1 min-w-[160px]">
                          <label className="text-sm text-muted mb-1 block">
                            Client&apos;s Project Number
                          </label>
                          <input
                            value={row.client_project_number}
                            onChange={(e) =>
                              updateRow(row._id, { client_project_number: e.target.value })
                            }
                            placeholder="e.g. SMS 25-200-01"
                            className="glass-input w-full px-3 py-2"
                          />
                        </div>
                        <span className="text-muted font-semibold pb-2.5">|</span>
                        <div className="flex-[2] min-w-[200px]">
                          <label className="text-sm text-muted mb-1 block">Project Name *</label>
                          <input
                            required
                            value={row.name}
                            onChange={(e) => updateRow(row._id, { name: e.target.value })}
                            className="glass-input w-full px-3 py-2"
                          />
                        </div>
                      </div>

                      <div className="rounded-lg border border-sky-100 bg-sky-50 px-3 py-2">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-sky-700 mb-0.5">
                          Preview
                        </p>
                        <p className="text-sm text-gray-700 break-words">{buildPreview(row)}</p>
                      </div>
                    </>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-sm text-muted mb-1 block">Status</label>
                      <Select
                        value={row.status}
                        onChange={(value) => updateRow(row._id, { status: value })}
                        options={PROJECT_STATUSES.map((s) => ({ value: s, label: s }))}
                      />
                    </div>
                    <div>
                      <label className="text-sm text-muted mb-1 block">Billing</label>
                      <Select
                        value={row.billable ? "true" : "false"}
                        onChange={(value) => updateRow(row._id, { billable: value === "true" })}
                        options={[
                          { value: "true", label: "Billable" },
                          { value: "false", label: "Non-billable" },
                        ]}
                      />
                    </div>
                  </div>

                  {renderVisibilityPicker(row)}

                  <div>
                    <label className="text-sm text-muted mb-1 block">Description</label>
                    <textarea
                      rows={2}
                      value={row.description}
                      onChange={(e) => updateRow(row._id, { description: e.target.value })}
                      className="glass-input w-full px-3 py-2"
                    />
                  </div>
                </>
              ) : (
                <>
                  {v3 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-sm text-muted mb-1 block">
                          ECO Matrix Number
                        </label>
                        <div className="glass-input w-full px-3 py-2 text-muted flex items-center gap-2">
                          <FaMagic className="h-3 w-3 shrink-0" /> Auto-assigned on save
                        </div>
                      </div>
                      <div>
                        <label className="text-sm text-muted mb-1 block">Client *</label>
                        <Select
                          value={row.client_id ?? ""}
                          onChange={(value) => updateRow(row._id, { client_id: value })}
                          placeholder="-- Select Client --"
                          options={clients.map((c) => ({ value: c.id, label: `${c.short_code} — ${c.name}` }))}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-sm text-muted mb-1 block">Project Number</label>
                        <input
                          value={row.project_number}
                          onChange={(e) => updateRow(row._id, { project_number: e.target.value })}
                          className="glass-input w-full px-3 py-2"
                        />
                      </div>
                      <div>
                        <label className="text-sm text-muted mb-1 block">Client Name *</label>
                        <input
                          required
                          value={row.client_name}
                          onChange={(e) => updateRow(row._id, { client_name: e.target.value })}
                          className="glass-input w-full px-3 py-2"
                        />
                      </div>
                    </div>
                  )}

                  {v3 && (
                    <div>
                      <label className="text-sm text-muted mb-1 block">
                        Client&apos;s Own Project Number
                      </label>
                      <input
                        value={row.client_project_number}
                        onChange={(e) => updateRow(row._id, { client_project_number: e.target.value })}
                        placeholder="e.g. SMS 25-200-01"
                        className="glass-input w-full px-3 py-2"
                      />
                    </div>
                  )}

                  <div>
                    <label className="text-sm text-muted mb-1 block">Project Name *</label>
                    <input
                      required
                      value={row.name}
                      onChange={(e) => updateRow(row._id, { name: e.target.value })}
                      className="glass-input w-full px-3 py-2"
                    />
                  </div>

                  <div>
                    <label className="text-sm text-muted mb-1 block">Description</label>
                    <textarea
                      rows={2}
                      value={row.description}
                      onChange={(e) => updateRow(row._id, { description: e.target.value })}
                      className="glass-input w-full px-3 py-2"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-sm text-muted mb-1 block">Project Type</label>
                      <Select
                        value={row.project_type}
                        onChange={(value) => updateRow(row._id, { project_type: value })}
                        options={[
                          { value: "Energy Modelling", label: "Energy Modelling" },
                          { value: "BIM and AutoCad", label: "BIM and AutoCad" },
                        ]}
                      />
                    </div>
                    <div>
                      <label className="text-sm text-muted mb-1 block">Status</label>
                      <Select
                        value={row.status}
                        onChange={(value) => updateRow(row._id, { status: value })}
                        options={PROJECT_STATUSES.map((s) => ({ value: s, label: s }))}
                      />
                    </div>
                  </div>

                  {renderVisibilityPicker(row)}

                  {v3 && scopes.length > 0 && (
                    <div>
                      <label className="text-sm text-muted mb-1 block">
                        Scopes (which tasks show on the timesheet)
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {scopes.map((s) => {
                          const checked = (row.scope_ids ?? []).includes(s.id);
                          return (
                            <button
                              key={s.id}
                              type="button"
                              onClick={() => toggleScope(row._id, s.id)}
                              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                                checked
                                  ? "bg-accent text-white border-accent"
                                  : "bg-white text-muted border-gray-200 hover:border-gray-300"
                              }`}
                            >
                              {s.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}
            </motion.div>
          ))}
        </AnimatePresence>

        <button
          type="button"
          onClick={addRow}
          className="btn-ghost self-start inline-flex items-center gap-2 px-4 py-2 text-sm"
        >
          <FaPlus className="h-3 w-3" /> Add New
        </button>

        <div className="flex justify-between items-center pt-2">
          <button
            type="button"
            onClick={() => router.push("/projects")}
            className="btn-ghost px-4 py-2 text-sm"
          >
            Cancel
          </button>
          <motion.button
            whileTap={{ scale: 0.97 }}
            type="submit"
            disabled={pending}
            className="btn-primary inline-flex items-center gap-2 px-5 py-2.5 text-sm"
          >
            <FaSave className="h-3.5 w-3.5" />
            {pending ? "Saving…" : `Create Project${rows.length > 1 ? "s" : ""}`}
          </motion.button>
        </div>
      </form>
    </div>
  );
}
