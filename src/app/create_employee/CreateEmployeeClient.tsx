"use client";

import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { useActionState, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { PublicUser } from "@/lib/types";
import {
  createEmployeeAction,
  deleteEmployeeAction,
  type CreateEmployeeState,
} from "@/app/(actions)/employeeActions";
import Modal from "@/components/Modal";
import { toast } from "@/lib/toast";
import { FaUserPlus, FaTrash, FaSearch, FaTimes } from "react-icons/fa";

const initialState: CreateEmployeeState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      disabled={pending}
      className="btn-primary inline-flex items-center justify-center gap-2 py-2.5 mt-2"
    >
      <FaUserPlus className="h-3.5 w-3.5" /> {pending ? "Creating…" : "Create Employee"}
    </motion.button>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function CreateEmployeeClient({ employees }: { employees: PublicUser[] }) {
  const router = useRouter();
  const [state, formAction] = useActionState(createEmployeeAction, initialState);
  const [toDelete, setToDelete] = useState<PublicUser | null>(null);
  const [pending, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const lastState = useRef<CreateEmployeeState>(initialState);

  useEffect(() => {
    if (state === lastState.current) return;
    lastState.current = state;
    if (state?.error) toast.error(state.error);
    else if (state?.success) toast.success("Employee created.");
  }, [state]);

  const filteredEmployees = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return employees;
    return employees.filter(
      (e) => e.name.toLowerCase().includes(term) || e.username.toLowerCase().includes(term)
    );
  }, [employees, search]);

  function confirmDelete() {
    if (!toDelete) return;
    startTransition(async () => {
      const result = await deleteEmployeeAction(toDelete.username);
      if (result.success) toast.success(result.message);
      else toast.error(result.message);
      setToDelete(null);
      router.refresh();
    });
  }

  return (
    <div className="max-w-5xl mx-auto">
      <h1 className="text-2xl font-semibold mb-6 flex items-center gap-2">
        <FaUserPlus className="text-accent" /> Create Employee
      </h1>

      <div className="grid grid-cols-1 lg:grid-cols-[22rem_1fr] gap-6 items-start">
        <motion.form
          action={formAction}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-strong p-6 flex flex-col gap-4"
        >
          <h2 className="text-lg font-semibold">New Employee</h2>
          <div>
            <label className="text-sm text-muted mb-1 block">Username</label>
            <input
              name="username"
              required
              placeholder="e.g. jane.doe@ecomatrix.com"
              className="glass-input w-full px-3 py-2.5"
            />
          </div>
          <div>
            <label className="text-sm text-muted mb-1 block">Full Name</label>
            <input name="name" required placeholder="Jane Doe" className="glass-input w-full px-3 py-2.5" />
          </div>
          <div>
            <label className="text-sm text-muted mb-1 block">Password</label>
            <input
              name="password"
              type="password"
              required
              placeholder="Choose a password"
              className="glass-input w-full px-3 py-2.5"
            />
          </div>
          <SubmitButton />
        </motion.form>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.06 }}
          className="glass !p-0 overflow-hidden flex flex-col"
        >
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3">
            <h2 className="font-semibold">Existing Employees</h2>
            <span className="text-xs text-muted">{filteredEmployees.length} of {employees.length}</span>
          </div>
          <div className="px-5 pt-4 pb-2">
            <div className="relative">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or username…"
                className="glass-input w-full pl-9 pr-8 py-2 text-sm"
              />
              <FaSearch className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted" />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-3 top-2.5 text-muted hover:text-foreground"
                >
                  <FaTimes className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
          <div className="p-5 pt-2 space-y-2 max-h-[28rem] overflow-y-auto scrollbar-thin">
            <AnimatePresence>
              {filteredEmployees.length === 0 && (
                <p className="text-sm text-muted text-center py-8">No employees match this search.</p>
              )}
              {filteredEmployees.map((e) => (
                <motion.div
                  key={e.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, x: -8 }}
                  className="flex items-center gap-3 text-sm border border-gray-100 rounded-xl px-3 py-2.5 hover:bg-gray-50 transition-colors"
                >
                  <div className="h-9 w-9 shrink-0 rounded-full bg-accent/10 text-accent font-semibold text-xs flex items-center justify-center">
                    {initials(e.name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{e.name}</p>
                    <p className="text-xs text-muted truncate">{e.username}</p>
                  </div>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${
                      e.role === "admin" ? "bg-violet-100 text-violet-700" : "bg-emerald-100 text-emerald-700"
                    }`}
                  >
                    {e.role}
                  </span>
                  {e.role !== "admin" && (
                    <button
                      onClick={() => setToDelete(e)}
                      title="Delete employee"
                      className="shrink-0 p-2 rounded-lg text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <FaTrash className="h-3.5 w-3.5" />
                    </button>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </motion.div>
      </div>

      <Modal open={!!toDelete} onClose={() => setToDelete(null)} title="Delete employee?">
        <p className="text-sm text-muted mb-4">
          This permanently deletes <strong>{toDelete?.name}</strong> and all of their
          timesheet entries and submissions. This cannot be undone.
        </p>
        <div className="flex justify-end gap-2">
          <button className="btn-ghost px-4 py-2 text-sm" onClick={() => setToDelete(null)}>
            Cancel
          </button>
          <button className="btn-danger px-4 py-2 text-sm" disabled={pending} onClick={confirmDelete}>
            {pending ? "Deleting…" : "Delete"}
          </button>
        </div>
      </Modal>
    </div>
  );
}
