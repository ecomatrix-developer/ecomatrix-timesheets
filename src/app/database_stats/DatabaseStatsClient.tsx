"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { PublicUser, Project } from "@/lib/types";
import { deleteEmployeeAction } from "@/app/(actions)/employeeActions";
import { deleteOldEntriesAction } from "@/app/(actions)/adminActions";
import Modal from "@/components/Modal";
import { toast, confirmToast } from "@/lib/toast";
import Pagination from "@/components/Pagination";
import { PAGE_SIZE } from "@/lib/constants";
import { FaTrash, FaExclamationTriangle } from "react-icons/fa";

const STATUS_BADGE: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-700",
  completed: "bg-sky-100 text-sky-700",
  "re-work": "bg-amber-100 text-amber-700",
  archived: "bg-zinc-100 text-zinc-600",
};

/**
 * Mirrors v1's database_stats.html: full users table (with a delete
 * button per non-admin user) and full projects table, alongside the
 * numeric stat tiles the page already had. v1 lets an admin delete a
 * user directly from this page, not just from Create Employee.
 *
 * Both tables are server-paginated (PAGE_SIZE rows per page) instead of
 * a fixed-height scrolling container — avoids an awkward nested scrollbar
 * and lets every row actually be reached via normal pagination controls.
 */
interface MonthCount {
  monthYear: string; // 'YYYY-MM'
  count: number;
}

export default function DatabaseStatsClient({
  users,
  projects,
  usersPage,
  usersTotalPages,
  usersTotal,
  projectsPage,
  projectsTotalPages,
  projectsTotal,
  totalEntries,
  earliestDate,
  latestDate,
  monthCounts,
}: {
  users: PublicUser[];
  projects: Project[];
  usersPage: number;
  usersTotalPages: number;
  usersTotal: number;
  projectsPage: number;
  projectsTotalPages: number;
  projectsTotal: number;
  totalEntries: number;
  earliestDate: string | null;
  latestDate: string | null;
  monthCounts: MonthCount[];
}) {
  const router = useRouter();
  const [localUsers, setLocalUsers] = useState(users);
  const [pending, startTransition] = useTransition();
  const [deletingUsername, setDeletingUsername] = useState<string | null>(null);

  // --- Delete Old Entries (merged in 2026-11-21 from the old standalone
  // /delete_old_entries page) ---
  const [monthYear, setMonthYear] = useState("");
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deletePending, startDeleteTransition] = useTransition();
  const [localMonthCounts, setLocalMonthCounts] = useState(monthCounts);

  const selectedCount = useMemo(
    () => localMonthCounts.find((m) => m.monthYear === monthYear)?.count ?? 0,
    [localMonthCounts, monthYear]
  );

  function handleDeleteSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!monthYear) return;
    setConfirmDeleteOpen(true);
  }

  function handleDeleteConfirm() {
    startDeleteTransition(async () => {
      const res = await deleteOldEntriesAction(monthYear);
      if (res.success) {
        toast.success(res.message);
        setLocalMonthCounts((prev) => prev.filter((m) => m.monthYear !== monthYear));
        setMonthYear("");
      } else {
        toast.error(res.message);
      }
      setConfirmDeleteOpen(false);
    });
  }

  // `users` is a NEW array every time the server re-renders this page with
  // different `usersPage` data — without this, `useState(users)` only ever
  // used its very first value, so paging never changed what was shown
  // (the local delete-mutation above needs its own client state, but that
  // state has to track the server's current page, not freeze on page 1).
  useEffect(() => {
    setLocalUsers(users);
  }, [users]);

  // router.refresh() is required on top of the push: Next's client router
  // cache can otherwise serve a stale RSC response for a (usersPage,
  // projectsPage) combination already visited this session, so clicking
  // "page 2" could silently re-show page 1's rows.
  function goToUsersPage(page: number) {
    const params = new URLSearchParams(window.location.search);
    params.set("usersPage", String(page));
    router.push(`/database_stats?${params.toString()}`, { scroll: false });
    router.refresh();
  }

  function goToProjectsPage(page: number) {
    const params = new URLSearchParams(window.location.search);
    params.set("projectsPage", String(page));
    router.push(`/database_stats?${params.toString()}`, { scroll: false });
    router.refresh();
  }

  async function handleDelete(username: string) {
    const confirmed = await confirmToast(
      `Are you sure you want to delete user '${username}'? This will also delete all their data. This action cannot be undone.`,
      { confirmLabel: "Delete" }
    );
    if (!confirmed) return;
    setDeletingUsername(username);
    startTransition(async () => {
      const result = await deleteEmployeeAction(username);
      if (result.success) {
        toast.success(result.message);
        setLocalUsers((prev) => prev.filter((u) => u.username !== username));
        router.refresh();
      } else {
        toast.error(result.message);
      }
      setDeletingUsername(null);
    });
  }

  return (
    <>
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass !p-0 overflow-hidden flex flex-col"
      >
        <div className="px-5 py-3 border-b border-gray-100">
          <h6 className="font-semibold text-accent text-sm">All Users in Database</h6>
        </div>
        <div className="p-4 overflow-x-auto scrollbar-thin flex-1">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b border-gray-200">
                <th className="py-2 pr-2">Username</th>
                <th className="py-2 pr-2">Name</th>
                <th className="py-2 pr-2">Role</th>
                <th className="py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence>
                {localUsers.map((u) => (
                  <motion.tr
                    key={u.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, x: -8 }}
                    className="border-b border-gray-100"
                  >
                    <td className="py-2 pr-2">{u.username}</td>
                    <td className="py-2 pr-2">{u.name}</td>
                    <td className="py-2 pr-2">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${
                          u.role === "admin"
                            ? "bg-violet-100 text-violet-700"
                            : "bg-emerald-100 text-emerald-700"
                        }`}
                      >
                        {u.role}
                      </span>
                    </td>
                    <td className="py-2 text-right">
                      {u.role !== "admin" && (
                        <button
                          onClick={() => handleDelete(u.username)}
                          disabled={pending && deletingUsername === u.username}
                          title="Delete User"
                          className="inline-flex items-center gap-1 text-xs text-red-600 hover:underline disabled:opacity-50"
                        >
                          <FaTrash className="h-3 w-3" />
                          {pending && deletingUsername === u.username ? "Deleting…" : "Delete"}
                        </button>
                      )}
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
        <div className="px-4 pb-4">
          <Pagination
            page={usersPage}
            totalPages={usersTotalPages}
            totalItems={usersTotal}
            pageSize={PAGE_SIZE}
            onPageChange={goToUsersPage}
          />
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="glass !p-0 overflow-hidden flex flex-col"
      >
        <div className="px-5 py-3 border-b border-gray-100">
          <h6 className="font-semibold text-accent text-sm">All Projects in Database</h6>
        </div>
        <div className="p-4 overflow-x-auto scrollbar-thin flex-1">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b border-gray-200">
                <th className="py-2 pr-2">Project #</th>
                <th className="py-2 pr-2">Name</th>
                <th className="py-2 pr-2">Client</th>
                <th className="py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => (
                <tr key={p.id} className="border-b border-gray-100">
                  <td className="py-2 pr-2 text-muted">{p.project_number ?? "—"}</td>
                  <td className="py-2 pr-2">{p.name}</td>
                  <td className="py-2 pr-2">{p.client_name}</td>
                  <td className="py-2">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        STATUS_BADGE[p.status] ?? "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {p.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 pb-4">
          <Pagination
            page={projectsPage}
            totalPages={projectsTotalPages}
            totalItems={projectsTotal}
            pageSize={PAGE_SIZE}
            onPageChange={goToProjectsPage}
          />
        </div>
      </motion.div>
    </div>

    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className="glass-strong p-6 mt-6"
    >
      <h2 className="text-lg font-semibold mb-4 flex items-center gap-2 text-red-600">
        <FaExclamationTriangle /> Delete Old Timesheet Entries
      </h2>

      <div className="text-sm bg-amber-50 border border-amber-200 text-amber-900 rounded-lg px-3 py-2 mb-5 flex items-start gap-2">
        <FaExclamationTriangle className="mt-0.5 shrink-0" />
        <span>
          <strong>Warning:</strong> This permanently deletes every timesheet entry for a
          given month, across <strong>all</strong> employees. This action cannot be undone!
          {totalEntries > 0 && earliestDate && latestDate && (
            <>
              {" "}Currently {totalEntries} entries on file, {earliestDate} to {latestDate}.
            </>
          )}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <form onSubmit={handleDeleteSubmit} className="flex flex-col gap-4">
          <div>
            <label className="text-sm text-muted mb-1 block">Select Month and Year</label>
            <input
              type="month"
              required
              value={monthYear}
              onChange={(e) => setMonthYear(e.target.value)}
              min={earliestDate?.slice(0, 7)}
              max={latestDate?.slice(0, 7)}
              className="glass-input w-full px-3 py-2"
            />
          </div>

          {monthYear && (
            <div
              className={`text-sm rounded-lg px-3 py-2 border ${
                selectedCount > 0
                  ? "bg-red-50 border-red-200 text-red-800"
                  : "bg-gray-50 border-gray-200 text-muted"
              }`}
            >
              {selectedCount > 0 ? (
                <>
                  This will delete <strong>{selectedCount}</strong> entr
                  {selectedCount === 1 ? "y" : "ies"} logged in <strong>{monthYear}</strong>.
                </>
              ) : (
                <>No entries found for {monthYear} — nothing would be deleted.</>
              )}
            </div>
          )}

          <motion.button
            whileTap={{ scale: 0.97 }}
            type="submit"
            disabled={!monthYear || selectedCount === 0}
            className="btn-danger inline-flex items-center justify-center gap-2 py-2.5 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <FaTrash className="h-3.5 w-3.5" /> Delete Entries
          </motion.button>
        </form>

        <div>
          <p className="text-xs text-muted font-medium mb-2">Entries by Month</p>
          <div className="space-y-1.5 max-h-72 overflow-y-auto scrollbar-x-thin pr-1">
            {localMonthCounts.length === 0 ? (
              <p className="text-sm text-muted">No entries found.</p>
            ) : (
              localMonthCounts.map((m) => {
                const maxCount = Math.max(...localMonthCounts.map((x) => x.count));
                const pct = maxCount > 0 ? (m.count / maxCount) * 100 : 0;
                return (
                  <button
                    key={m.monthYear}
                    type="button"
                    onClick={() => setMonthYear(m.monthYear)}
                    className={`w-full flex items-center gap-3 text-sm rounded-lg px-2 py-1.5 transition-colors ${
                      monthYear === m.monthYear ? "bg-accent/10" : "hover:bg-gray-50"
                    }`}
                  >
                    <span className="w-16 shrink-0 text-left">{m.monthYear}</span>
                    <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
                      <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(pct, 2)}%` }} />
                    </div>
                    <span className="w-10 shrink-0 text-right font-medium">{m.count}</span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>
    </motion.div>

    <Modal open={confirmDeleteOpen} onClose={() => setConfirmDeleteOpen(false)} title="Are you absolutely sure?">
      <p className="text-sm text-muted mb-4">
        This will permanently delete <strong>{selectedCount}</strong> timesheet entr
        {selectedCount === 1 ? "y" : "ies"} logged by <strong>any employee</strong> during{" "}
        <strong>{monthYear}</strong>. This action cannot be undone.
      </p>
      <div className="flex justify-end gap-2">
        <button className="btn-ghost px-4 py-2 text-sm" onClick={() => setConfirmDeleteOpen(false)}>
          Cancel
        </button>
        <button
          className="btn-danger px-4 py-2 text-sm"
          disabled={deletePending}
          onClick={handleDeleteConfirm}
        >
          {deletePending ? "Deleting…" : "Yes, delete everything"}
        </button>
      </div>
    </Modal>
    </>
  );
}
