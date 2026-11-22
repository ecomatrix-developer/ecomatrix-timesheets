"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { FaSave, FaLock } from "react-icons/fa";
import { PROJECT_STATUSES, USER_TYPE_OPTIONS, ALL_USER_TYPES } from "@/lib/constants";
import type { Project, Client, ProjectScope } from "@/lib/types";
import Select from "@/components/Select";
import BackLink from "@/components/BackLink";

export default function ProjectForm({
  project,
  action,
  clients = [],
  scopes = [],
  selectedScopeIds = [],
  billableSupported = false,
  visibilitySupported = false,
}: {
  project?: Project;
  action: (formData: FormData) => void;
  clients?: Client[];
  scopes?: ProjectScope[];
  selectedScopeIds?: string[];
  billableSupported?: boolean;
  visibilitySupported?: boolean;
}) {
  const v3 = clients.length > 0;
  // Select renders its own button/panel, not a native <select>, so its
  // value isn't picked up by FormData automatically — a hidden input
  // mirrors the controlled state into the form submission.
  const [projectType, setProjectType] = useState<string>(project?.project_type ?? "Energy Modelling");
  const [status, setStatus] = useState<string>(project?.status ?? "active");
  const [clientId, setClientId] = useState<string>(project?.client_id ?? "");
  const [scopeIds, setScopeIds] = useState<string[]>(selectedScopeIds);
  // v3.0 (supabase_patch_11/12) — same fields Create Project lets you set,
  // now editable too (previously Billing/Visible To could only ever be set
  // once, at creation, with no way back in). Undefined project.billable
  // (pre-patch_11 projects) defaults to billable, matching the DB column's
  // own default.
  const [billable, setBillable] = useState<boolean>(project?.billable ?? true);
  const [visibleTypes, setVisibleTypes] = useState<string[]>(
    project?.visible_user_types && project.visible_user_types.length > 0
      ? project.visible_user_types
      : [...ALL_USER_TYPES]
  );

  function toggleScope(id: string) {
    setScopeIds((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  }

  function toggleVisibleType(type: string) {
    setVisibleTypes((prev) => {
      const has = prev.includes(type);
      if (has && prev.length === 1) return prev; // always keep at least one
      return has ? prev.filter((t) => t !== type) : [...prev, type];
    });
  }

  // v3.0 projects already carry a system-generated number; legacy
  // projects (created before supabase_patch_9) have none and keep the
  // original free-text field — never force a migration of old data.
  const hasEcoMatrixNumber = !!project?.eco_matrix_number;

  return (
    <div className="max-w-xl mx-auto">
      <BackLink href="/projects" label="Back to Projects" />
      <motion.form
        action={action}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="glass-strong p-6 flex flex-col gap-4"
      >
        <h1 className="text-xl font-semibold mb-1">
          {project ? "Edit Project" : "New Project"}
        </h1>

      {hasEcoMatrixNumber ? (
        <div>
          <label className="text-sm text-muted mb-1 block">ECO Matrix Number</label>
          <div className="glass-input w-full px-3 py-2 text-muted flex items-center gap-2">
            <FaLock className="h-3 w-3 shrink-0" /> {project!.eco_matrix_number}
          </div>
          {/* Still sent so the action's normal project_number write is a no-op match. */}
          <input type="hidden" name="project_number" value={project?.project_number ?? ""} />
        </div>
      ) : (
        <div>
          <label className="text-sm text-muted mb-1 block">Project Number</label>
          <input
            name="project_number"
            defaultValue={project?.project_number ?? ""}
            className="glass-input w-full px-3 py-2"
          />
        </div>
      )}

      {v3 ? (
        <>
          <div>
            <label className="text-sm text-muted mb-1 block">Client</label>
            <input type="hidden" name="client_id" value={clientId} />
            <Select
              value={clientId}
              onChange={setClientId}
              placeholder="-- Select Client --"
              options={clients.map((c) => ({ value: c.id, label: `${c.short_code} — ${c.name}` }))}
            />
            {/* client_name stays in sync so every existing display/search
                code that reads it keeps working unchanged. */}
            <input
              type="hidden"
              name="client_name"
              value={clients.find((c) => c.id === clientId)?.name ?? project?.client_name ?? ""}
            />
          </div>
          <div>
            <label className="text-sm text-muted mb-1 block">Client&apos;s Own Project Number</label>
            <input
              name="client_project_number"
              defaultValue={project?.client_project_number ?? ""}
              placeholder="e.g. SMS 25-200-01"
              className="glass-input w-full px-3 py-2"
            />
          </div>
        </>
      ) : (
        <div>
          <label className="text-sm text-muted mb-1 block">Client Name *</label>
          <input
            name="client_name"
            required
            defaultValue={project?.client_name ?? ""}
            className="glass-input w-full px-3 py-2"
          />
        </div>
      )}

      <div>
        <label className="text-sm text-muted mb-1 block">Project Name *</label>
        <input
          name="name"
          required
          defaultValue={project?.name ?? ""}
          className="glass-input w-full px-3 py-2"
        />
      </div>

      <div>
        <label className="text-sm text-muted mb-1 block">Description</label>
        <textarea
          name="description"
          rows={3}
          defaultValue={project?.description ?? ""}
          className="glass-input w-full px-3 py-2"
        />
      </div>

      <div>
        <label className="text-sm text-muted mb-1 block">Project Type</label>
        {/* Splits the project into the Energy Modelling / BIM and AutoCad
            dropdown groups on the Timesheet page — matches v1's
            edit_project.html exactly, including the "Energy Modelling"
            default for a project with no type set yet. */}
        <input type="hidden" name="project_type" value={projectType} />
        <Select
          value={projectType}
          onChange={setProjectType}
          options={[
            { value: "Energy Modelling", label: "Energy Modelling" },
            { value: "BIM and AutoCad", label: "BIM and AutoCad" },
          ]}
        />
      </div>

      <div>
        <label className="text-sm text-muted mb-1 block">Status</label>
        {/* Fixed lowercase enum, not free text — prevents the case-mismatch
            bug from v1 where 'Active' (capitalized) could be saved and
            then silently mismatch lowercase comparisons elsewhere. */}
        <input type="hidden" name="status" value={status} />
        <Select value={status} onChange={setStatus} options={PROJECT_STATUSES.map((s) => ({ value: s, label: s }))} />
      </div>

      {billableSupported && (
        <div>
          <label className="text-sm text-muted mb-1 block">Billing</label>
          <input type="hidden" name="billable_submitted" value="1" />
          <input type="hidden" name="billable" value={billable ? "true" : "false"} />
          <Select
            value={billable ? "true" : "false"}
            onChange={(value) => setBillable(value === "true")}
            options={[
              { value: "true", label: "Billable" },
              { value: "false", label: "Non-billable" },
            ]}
          />
        </div>
      )}

      {visibilitySupported && (
        <div>
          <label className="text-sm text-muted mb-1 block">
            Visible To{" "}
            {visibleTypes.length === ALL_USER_TYPES.length && (
              <span className="font-normal text-muted">(everyone — default)</span>
            )}
          </label>
          <input type="hidden" name="visibility_submitted" value="1" />
          {visibleTypes.length < ALL_USER_TYPES.length &&
            visibleTypes.map((t) => <input key={t} type="hidden" name="visible_user_types" value={t} />)}
          <div className="flex flex-wrap gap-2">
            {USER_TYPE_OPTIONS.map((o) => {
              const checked = visibleTypes.includes(o.value);
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => toggleVisibleType(o.value)}
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
      )}

      {v3 && scopes.length > 0 && (
        <div>
          <label className="text-sm text-muted mb-1 block">
            Scopes (which tasks show on the timesheet)
          </label>
          <input type="hidden" name="scopes_submitted" value="1" />
          <div className="flex flex-wrap gap-2">
            {scopes.map((s) => {
              const checked = scopeIds.includes(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => toggleScope(s.id)}
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
          {scopeIds.map((id) => (
            <input key={id} type="hidden" name="scope_ids" value={id} />
          ))}
        </div>
      )}

      <motion.button
        whileTap={{ scale: 0.97 }}
        type="submit"
        className="btn-primary inline-flex items-center justify-center gap-2 py-2.5 mt-2"
      >
        <FaSave className="h-3.5 w-3.5" /> {project ? "Update Project" : "Create Project"}
      </motion.button>
      </motion.form>
    </div>
  );
}
