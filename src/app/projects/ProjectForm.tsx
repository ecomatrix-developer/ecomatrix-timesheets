"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { FaSave } from "react-icons/fa";
import { PROJECT_STATUSES } from "@/lib/constants";
import type { Project } from "@/lib/types";
import Select from "@/components/Select";

export default function ProjectForm({
  project,
  action,
}: {
  project?: Project;
  action: (formData: FormData) => void;
}) {
  // Select renders its own button/panel, not a native <select>, so its
  // value isn't picked up by FormData automatically — a hidden input
  // mirrors the controlled state into the form submission.
  const [projectType, setProjectType] = useState<string>(project?.project_type ?? "Energy Modelling");
  const [status, setStatus] = useState<string>(project?.status ?? "active");

  return (
    <motion.form
      action={action}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="glass-strong max-w-xl mx-auto p-6 flex flex-col gap-4"
    >
      <h1 className="text-xl font-semibold mb-1">
        {project ? "Edit Project" : "New Project"}
      </h1>

      <div>
        <label className="text-sm text-muted mb-1 block">Project Number</label>
        <input
          name="project_number"
          defaultValue={project?.project_number ?? ""}
          className="glass-input w-full px-3 py-2"
        />
      </div>

      <div>
        <label className="text-sm text-muted mb-1 block">Client Name *</label>
        <input
          name="client_name"
          required
          defaultValue={project?.client_name ?? ""}
          className="glass-input w-full px-3 py-2"
        />
      </div>

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

      <motion.button
        whileTap={{ scale: 0.97 }}
        type="submit"
        className="btn-primary inline-flex items-center justify-center gap-2 py-2.5 mt-2"
      >
        <FaSave className="h-3.5 w-3.5" /> {project ? "Update Project" : "Create Project"}
      </motion.button>
    </motion.form>
  );
}
