"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { PublicUser, Project } from "@/lib/types";
import { deleteEmployeeAction } from "@/app/(actions)/employeeActions";
import { toast, confirmToast } from "@/lib/toast";
import Pagination from "@/components/Pagination";
import { PAGE_SIZE } from "@/lib/constants";
import { FaTrash } from "react-icons/fa";

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
export default function DatabaseStatsClient({
  users,
  projects,
  usersPage,
  usersTotalPages,
  usersTotal,
  projectsPage,
  projectsTotalPages,
  projectsTotal,
}: {
  users: PublicUser[];
  projects: Project[];
  usersPage: number;
  usersTotalPages: number;
  usersTotal: number;
  projectsPage: number;
  projectsTotalPages: number;
  projectsTotal: number;
}) {
  const router = useRouter();
  const [localUsers, setLocalUsers] = useState(users);
  const [pending, startTransition] = useTransition();
  const [deletingUsername, setDeletingUsername] = useState<string | null>(null);

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
  );
}
