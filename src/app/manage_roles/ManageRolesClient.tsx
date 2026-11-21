"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { useActionState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { PublicUser, AccessLevel, UserType } from "@/lib/types";
import { updateUserRoleAction } from "@/app/(actions)/roleActions";
import {
  createEmployeeAction,
  deleteEmployeeAction,
  resetUserPasswordAction,
  type CreateEmployeeState,
} from "@/app/(actions)/employeeActions";
import Select from "@/components/Select";
import Modal from "@/components/Modal";
import { toast } from "@/lib/toast";
import {
  FaUserShield,
  FaSave,
  FaFileAlt,
  FaUserPlus,
  FaTrash,
  FaSearch,
  FaTimes,
  FaKey,
  FaCopy,
  FaSync,
} from "react-icons/fa";

// No ambiguous characters (0/O, 1/l/I) — easier to read back over a call.
const PASSWORD_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
function generateRandomPassword(length = 10): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += PASSWORD_CHARS[Math.floor(Math.random() * PASSWORD_CHARS.length)];
  }
  return out;
}

const ACCESS_LEVEL_OPTIONS = [
  { value: "super_admin", label: "Super Admin" },
  { value: "admin", label: "Admin" },
  { value: "user", label: "User" },
];
const USER_TYPE_OPTIONS = [
  { value: "employee", label: "Employee" },
  { value: "intern", label: "Intern" },
  { value: "consultant", label: "Consultant" },
  { value: "accountant", label: "Accountant" },
  { value: "marketing_bd", label: "Marketing & BD" },
];

interface RowState {
  access_level: AccessLevel;
  user_type: UserType;
  email: string;
  job_title: string;
}

function toRowState(u: PublicUser): RowState {
  return {
    access_level: u.access_level ?? (u.role === "admin" ? "admin" : "user"),
    user_type: u.user_type ?? "employee",
    email: u.email ?? "",
    job_title: u.job_title ?? "",
  };
}

const initialCreateState: CreateEmployeeState = {};

function CreateEmployeeSubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      disabled={pending}
      className="btn-primary inline-flex items-center justify-center gap-2 py-2.5 mt-2"
    >
      <FaUserPlus className="h-3.5 w-3.5" /> {pending ? "Creating…" : "Create Employee"}
    </button>
  );
}

/**
 * Merged Employees & Roles page (Abeer, 2026-11-21): absorbs the old
 * standalone /create_employee page into one place — a "Create Employee"
 * button (top right) opens a modal with that same form, and every
 * existing employee is both role-editable AND deletable right here, no
 * second page needed.
 */
export default function ManageRolesClient({ users }: { users: PublicUser[] }) {
  const router = useRouter();
  const [rows, setRows] = useState<Record<string, RowState>>(() =>
    Object.fromEntries(users.map((u) => [u.id, toRowState(u)]))
  );
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [toDelete, setToDelete] = useState<PublicUser | null>(null);
  const [deletePending, startDeleteTransition] = useTransition();
  const [resetTarget, setResetTarget] = useState<PublicUser | null>(null);
  const [resetValue, setResetValue] = useState("");
  const [resetResult, setResetResult] = useState<string | null>(null);
  const [resetPending, startResetTransition] = useTransition();

  const [createState, createFormAction] = useActionState(createEmployeeAction, initialCreateState);
  const lastCreateState = useRef<CreateEmployeeState>(initialCreateState);

  useEffect(() => {
    if (createState === lastCreateState.current) return;
    lastCreateState.current = createState;
    if (createState?.error) toast.error(createState.error);
    else if (createState?.success) {
      toast.success("Employee created.");
      setCreateOpen(false);
      router.refresh();
    }
  }, [createState, router]);

  function patch(id: string, partial: Partial<RowState>) {
    setRows((prev) => ({ ...prev, [id]: { ...prev[id], ...partial } }));
  }

  function save(id: string) {
    const row = rows[id];
    if (!row) return;
    setPendingId(id);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("access_level", row.access_level);
      fd.set("user_type", row.user_type);
      fd.set("email", row.email);
      fd.set("job_title", row.job_title);
      const result = await updateUserRoleAction(id, fd);
      setPendingId(null);
      if (result.error) toast.error(result.error);
      else toast.success("Role updated.");
    });
  }

  function confirmDelete() {
    if (!toDelete) return;
    startDeleteTransition(async () => {
      const result = await deleteEmployeeAction(toDelete.username);
      if (result.success) toast.success(result.message);
      else toast.error(result.message);
      setToDelete(null);
      router.refresh();
    });
  }

  function openReset(u: PublicUser) {
    setResetTarget(u);
    setResetValue(generateRandomPassword());
    setResetResult(null);
  }

  function closeReset() {
    setResetTarget(null);
    setResetValue("");
    setResetResult(null);
  }

  function submitReset() {
    if (!resetTarget || resetValue.length < 6) return;
    startResetTransition(async () => {
      const result = await resetUserPasswordAction(resetTarget.id, resetValue);
      if (result.success) {
        setResetResult(resetValue);
      } else {
        toast.error(result.error ?? "Could not reset password.");
      }
    });
  }

  async function copyResetResult() {
    if (!resetResult) return;
    try {
      await navigator.clipboard.writeText(resetResult);
      toast.success("Copied.");
    } catch {
      toast.error("Could not copy — select and copy manually.");
    }
  }

  const filteredUsers = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return users;
    return users.filter(
      (u) => u.name.toLowerCase().includes(term) || u.username.toLowerCase().includes(term)
    );
  }, [users, search]);

  return (
    <div className="w-full">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <FaUserShield className="text-accent" /> Employees &amp; Roles
        </h1>
        <button
          onClick={() => setCreateOpen(true)}
          className="btn-primary inline-flex items-center gap-2 px-4 py-2 text-sm"
        >
          <FaUserPlus className="h-3.5 w-3.5" /> Create Employee
        </button>
      </div>
      <p className="text-sm text-muted mb-6 max-w-3xl">
        Access level controls which screens a user gets (Super Admin / Admin / User). User type
        controls which portal modules apply to them (Employee / Intern / Consultant / Accountant —
        this is also what the Visible To field on a project checks). Job title is a display label
        only and never changes permissions. Changes here take effect the next time that person logs
        in.
      </p>

      <div className="relative mb-4 max-w-sm">
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

      <div className="glass !p-0 overflow-hidden">
        <div className="overflow-x-auto scrollbar-x-thin">
          <table className="w-full text-sm table-fixed">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-3 py-3 w-[15%]">Employee</th>
                <th className="px-3 py-3 w-[13%]">Access level</th>
                <th className="px-3 py-3 w-[13%]">User type</th>
                <th className="px-3 py-3 w-[20%]">Email</th>
                <th className="px-3 py-3 w-[17%]">Job title</th>
                <th className="px-3 py-3 w-[22%]">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredUsers.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted">
                    No employees match this search.
                  </td>
                </tr>
              )}
              {filteredUsers.map((u) => {
                const row = rows[u.id];
                if (!row) return null;
                return (
                  <tr key={u.id}>
                    <td className="px-3 py-2.5">
                      <p className="font-medium truncate" title={u.name}>{u.name}</p>
                      <p className="text-xs text-muted truncate" title={u.username}>{u.username}</p>
                    </td>
                    <td className="px-3 py-2.5">
                      <Select
                        value={row.access_level}
                        onChange={(v) => patch(u.id, { access_level: v as AccessLevel })}
                        options={ACCESS_LEVEL_OPTIONS}
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      <Select
                        value={row.user_type}
                        onChange={(v) => patch(u.id, { user_type: v as UserType })}
                        options={USER_TYPE_OPTIONS}
                        disabled={row.access_level !== "user"}
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      <input
                        value={row.email}
                        onChange={(e) => patch(u.id, { email: e.target.value })}
                        placeholder="name@ecomatrix.io"
                        className="glass-input w-full px-2.5 py-1.5 text-sm"
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      <input
                        value={row.job_title}
                        onChange={(e) => patch(u.id, { job_title: e.target.value })}
                        placeholder="e.g. Senior BIM Modeler"
                        className="glass-input w-full px-2.5 py-1.5 text-sm"
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1 flex-wrap">
                        <button
                          onClick={() => save(u.id)}
                          disabled={pendingId === u.id}
                          title="Save"
                          className="shrink-0 p-2 rounded-lg text-white bg-accent hover:bg-accent/90 transition-colors disabled:opacity-50"
                        >
                          <FaSave className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => openReset(u)}
                          title="Reset password"
                          className="shrink-0 p-2 rounded-lg text-amber-600 hover:bg-amber-50 transition-colors"
                        >
                          <FaKey className="h-3.5 w-3.5" />
                        </button>
                        <Link
                          href={`/manage_documents/${u.id}`}
                          title="View details & documents"
                          className="shrink-0 p-2 rounded-lg text-accent hover:bg-accent/10 transition-colors"
                        >
                          <FaFileAlt className="h-3.5 w-3.5" />
                        </Link>
                        {u.role !== "admin" && (
                          <button
                            onClick={() => setToDelete(u)}
                            title="Delete employee"
                            className="shrink-0 p-2 rounded-lg text-red-600 hover:bg-red-50 transition-colors"
                          >
                            <FaTrash className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Create Employee">
        <form action={createFormAction} className="flex flex-col gap-4">
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
          <CreateEmployeeSubmitButton />
        </form>
      </Modal>

      <Modal open={!!toDelete} onClose={() => setToDelete(null)} title="Delete employee?">
        <p className="text-sm text-muted mb-4">
          This permanently deletes <strong>{toDelete?.name}</strong> and all of their timesheet
          entries and submissions. This cannot be undone.
        </p>
        <div className="flex justify-end gap-2">
          <button className="btn-ghost px-4 py-2 text-sm" onClick={() => setToDelete(null)}>
            Cancel
          </button>
          <button
            className="btn-danger px-4 py-2 text-sm"
            disabled={deletePending}
            onClick={confirmDelete}
          >
            {deletePending ? "Deleting…" : "Delete"}
          </button>
        </div>
      </Modal>

      <Modal
        open={!!resetTarget}
        onClose={closeReset}
        title={`Reset password — ${resetTarget?.name ?? ""}`}
      >
        {resetResult ? (
          <>
            <p className="text-sm text-muted mb-2">
              New password for <strong>{resetTarget?.name}</strong> — this is shown once and isn&apos;t
              stored anywhere. Copy it and share it with them directly.
            </p>
            <div className="flex items-center gap-2 mb-4">
              <input
                readOnly
                value={resetResult}
                className="glass-input w-full px-3 py-2 font-mono text-sm"
                onFocus={(e) => e.target.select()}
              />
              <button
                onClick={copyResetResult}
                title="Copy"
                className="shrink-0 p-2.5 rounded-lg text-accent hover:bg-accent/10 transition-colors"
              >
                <FaCopy className="h-4 w-4" />
              </button>
            </div>
            <div className="flex justify-end">
              <button className="btn-primary px-4 py-2 text-sm" onClick={closeReset}>
                Done
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-muted mb-4">
              There is no way to view <strong>{resetTarget?.name}</strong>&apos;s current password —
              it&apos;s one-way encrypted and never recoverable, for anyone, by design. This sets a
              brand-new one instead.
            </p>
            <label className="text-sm text-muted mb-1 block">New password</label>
            <div className="flex items-center gap-2 mb-4">
              <input
                value={resetValue}
                onChange={(e) => setResetValue(e.target.value)}
                className="glass-input w-full px-3 py-2 font-mono text-sm"
                minLength={6}
              />
              <button
                type="button"
                onClick={() => setResetValue(generateRandomPassword())}
                title="Generate a new random password"
                className="shrink-0 p-2.5 rounded-lg text-accent hover:bg-accent/10 transition-colors"
              >
                <FaSync className="h-4 w-4" />
              </button>
            </div>
            <div className="flex justify-end gap-2">
              <button className="btn-ghost px-4 py-2 text-sm" onClick={closeReset}>
                Cancel
              </button>
              <button
                className="btn-primary px-4 py-2 text-sm"
                disabled={resetPending || resetValue.length < 6}
                onClick={submitReset}
              >
                {resetPending ? "Resetting…" : "Reset Password"}
              </button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
