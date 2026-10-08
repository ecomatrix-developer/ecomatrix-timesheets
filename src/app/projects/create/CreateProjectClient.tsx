"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { FaPlus, FaSave, FaTrash } from "react-icons/fa";
import { PROJECT_STATUSES } from "@/lib/constants";
import {
  createProjectsBulkAction,
  type NewProjectInput,
} from "@/app/(actions)/projectActions";
import { toast } from "@/lib/toast";
import Select from "@/components/Select";

let nextId = 0;
function blankRow(): NewProjectInput & { _id: number } {
  return {
    _id: nextId++,
    project_number: "",
    client_name: "",
    name: "",
    description: "",
    project_type: "Energy Modelling",
    status: "active",
  };
}

/**
 * Mirrors v1's real create_project.html: "Create New Project(s)" — a
 * stack of project forms with an "Add New" button, submitted together in
 * one bulk request. v2's original version only supported a single project
 * per submission; this restores the bulk-add behavior.
 */
export default function CreateProjectClient() {
  const router = useRouter();
  const [rows, setRows] = useState(() => [blankRow()]);
  const [pending, startTransition] = useTransition();

  function addRow() {
    setRows((prev) => [...prev, blankRow()]);
  }

  function removeRow(id: number) {
    setRows((prev) => (prev.length > 1 ? prev.filter((r) => r._id !== id) : prev));
  }

  function updateRow(id: number, patch: Partial<NewProjectInput>) {
    setRows((prev) => prev.map((r) => (r._id === id ? { ...r, ...patch } : r)));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await createProjectsBulkAction(
        rows.map((row) => {
          const { project_number, client_name, name, description, project_type, status } = row;
          return { project_number, client_name, name, description, project_type, status };
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
    <div className="max-w-3xl mx-auto">
      <h1 className="text-xl font-semibold mb-1">Create New Project(s)</h1>
      <p className="text-sm text-muted mb-6">
        Add one or more projects at once — use &quot;Add New&quot; to stack
        another row before saving.
      </p>

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
