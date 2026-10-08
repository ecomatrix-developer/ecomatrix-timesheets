"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { Project, ProjectType } from "@/lib/types";
import { PROJECT_STATUSES } from "@/lib/constants";
import { deleteProjectAction } from "@/app/(actions)/projectActions";
import Modal from "@/components/Modal";
import Pagination from "@/components/Pagination";
import { PAGE_SIZE } from "@/lib/constants";
import { toast } from "@/lib/toast";
import { FaPlus, FaSearch, FaTimes, FaEdit, FaTrash, FaFolderOpen } from "react-icons/fa";

const STATUS_COLORS: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-700 border-emerald-200",
  completed: "bg-sky-100 text-sky-700 border-sky-200",
  "re-work": "bg-amber-100 text-amber-700 border-amber-200",
  archived: "bg-zinc-100 text-zinc-600 border-zinc-200",
};

const PROJECT_TYPES: ProjectType[] = ["Energy Modelling", "BIM and AutoCad"];
const TYPE_COLORS: Record<string, string> = {
  "Energy Modelling": "bg-violet-100 text-violet-700 border-violet-200",
  "BIM and AutoCad": "bg-teal-100 text-teal-700 border-teal-200",
};

export default function ProjectsClient({
  projects,
  selectedStatuses,
  selectedTypes,
  searchTerm,
  page,
  totalPages,
  totalItems,
}: {
  projects: Project[];
  selectedStatuses: string[];
  selectedTypes: string[];
  searchTerm: string;
  page: number;
  totalPages: number;
  totalItems: number;
}) {
  const router = useRouter();
  const [search, setSearch] = useState(searchTerm);
  const [statuses, setStatuses] = useState<string[]>(selectedStatuses);
  const [types, setTypes] = useState<string[]>(selectedTypes);
  const [pending, startTransition] = useTransition();
  const [toDelete, setToDelete] = useState<Project | null>(null);

  // Changing filters always resets to page 1 — a filtered result set
  // rarely has as many pages as the unfiltered one, and staying on e.g.
  // page 5 could land past the end of the new results.
  // The server defaults to the "active" status filter only when `status`
  // is entirely absent from the URL — so once the user has touched the
  // status filter at all (even to clear every chip), we always include an
  // explicit (possibly empty) `status` marker to opt out of that default.
  function applyFilters(nextStatuses: string[], nextTypes: string[], nextSearch: string) {
    const params = new URLSearchParams();
    if (nextStatuses.length > 0) {
      nextStatuses.forEach((s) => params.append("status", s));
    } else {
      params.set("status", "");
    }
    nextTypes.forEach((t) => params.append("project_type", t));
    if (nextSearch) params.set("search_term", nextSearch);
    router.push(`/projects?${params.toString()}`);
    // Next's client router cache can otherwise serve a stale RSC response
    // for a (filters, page) combination visited earlier in this session.
    router.refresh();
  }

  function goToPage(nextPage: number) {
    const params = new URLSearchParams();
    if (statuses.length > 0) {
      statuses.forEach((s) => params.append("status", s));
    } else {
      params.set("status", "");
    }
    types.forEach((t) => params.append("project_type", t));
    if (search) params.set("search_term", search);
    params.set("page", String(nextPage));
    router.push(`/projects?${params.toString()}`);
    router.refresh();
  }

  function toggleStatus(status: string) {
    const next = statuses.includes(status)
      ? statuses.filter((s) => s !== status)
      : [...statuses, status];
    setStatuses(next);
    applyFilters(next, types, search);
  }

  function toggleType(type: string) {
    const next = types.includes(type) ? types.filter((t) => t !== type) : [...types, type];
    setTypes(next);
    applyFilters(statuses, next, search);
  }

  // Live search: debounce keystrokes instead of waiting for a full submit,
  // so results update shortly after the user stops typing rather than
  // requiring them to press Enter / click Search.
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      applyFilters(statuses, types, search);
    }, 350);
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    applyFilters(statuses, types, search);
  }

  async function confirmDelete() {
    if (!toDelete) return;
    const name = toDelete.name;
    startTransition(async () => {
      try {
        await deleteProjectAction(toDelete.id);
        toast.success(`"${name}" deleted.`);
        setToDelete(null);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not delete project.");
      }
    });
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Projects</h1>
          <p className="text-muted text-sm">{totalItems} matching projects</p>
        </div>
        <Link href="/projects/create">
          <motion.span
            whileTap={{ scale: 0.96 }}
            className="btn-primary inline-flex items-center gap-2 px-4 py-2 text-sm cursor-pointer"
          >
            <FaPlus className="h-3 w-3" /> Create Project
          </motion.span>
        </Link>
      </div>

      <div className="glass p-4 mb-6 flex flex-col gap-4">
        <form onSubmit={handleSearchSubmit} className="flex gap-2">
          <div className="relative flex-1">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by project name, project #, client, or category…"
              className="glass-input w-full pl-9 pr-8 py-2 text-sm"
            />
            <FaSearch className="absolute left-3 top-3 h-3.5 w-3.5 text-muted" />
            {search && (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  applyFilters(statuses, types, "");
                }}
                className="absolute right-3 top-3 text-muted hover:text-foreground"
              >
                <FaTimes className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <button type="submit" className="btn-ghost inline-flex items-center gap-2 px-4 py-2 text-sm">
            <FaSearch className="h-3 w-3" /> Search
          </button>
          {(search || statuses.length > 0 || types.length > 0) && (
            <button
              type="button"
              onClick={() => {
                if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
                setSearch("");
                setStatuses([]);
                setTypes([]);
                // Explicit empty `status` marker: "cleared", not "untouched"
                // — otherwise the page would fall back to its active-only
                // default instead of actually showing every status.
                router.push("/projects?status=");
                router.refresh();
              }}
              className="px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-red-200"
            >
              Clear Filters
            </button>
          )}
        </form>
        <div>
          <span className="text-xs text-muted font-medium mb-1.5 block">Filter by Status:</span>
          <div className="flex flex-wrap gap-2">
            {PROJECT_STATUSES.map((status) => {
              const active = statuses.includes(status);
              return (
                <button
                  key={status}
                  onClick={() => toggleStatus(status)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                    active
                      ? STATUS_COLORS[status]
                      : "border-gray-200 text-muted hover:text-foreground bg-white"
                  }`}
                >
                  {status}
                </button>
              );
            })}
          </div>
        </div>
        <div className="pt-2 border-t border-gray-100">
          <span className="text-xs text-muted font-medium mb-1.5 block">Filter by Category / Type:</span>
          <div className="flex flex-wrap gap-2">
            {PROJECT_TYPES.map((type) => {
              const active = types.includes(type);
              return (
                <button
                  key={type}
                  onClick={() => toggleType(type)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                    active
                      ? TYPE_COLORS[type]
                      : "border-gray-200 text-muted hover:text-foreground bg-white"
                  }`}
                >
                  {type}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="glass overflow-x-auto scrollbar-thin">
        <table className="w-full text-sm min-w-[720px]">
          <thead>
            <tr className="text-left text-muted border-b border-gray-100 bg-gray-50/60">
              <th className="px-4 py-3">Project #</th>
              <th className="px-4 py-3">Client</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            <AnimatePresence>
              {projects.map((p, i) => (
                <motion.tr
                  key={p.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ delay: Math.min(i * 0.02, 0.4) }}
                  className="border-b border-gray-100 hover:bg-gray-50"
                >
                  <td className="px-4 py-3 text-muted">{p.project_number ?? "—"}</td>
                  <td className="px-4 py-3">{p.client_name}</td>
                  <td className="px-4 py-3">{p.name}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-xs px-2 py-1 rounded-full border whitespace-nowrap ${
                        TYPE_COLORS[p.project_type] ?? ""
                      }`}
                    >
                      {p.project_type}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-xs px-2 py-1 rounded-full border ${
                        STATUS_COLORS[p.status] ?? ""
                      }`}
                    >
                      {p.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right space-x-2 whitespace-nowrap">
                    <Link
                      href={`/projects/${p.id}/edit`}
                      className="inline-flex items-center gap-1 text-accent hover:underline text-xs"
                    >
                      <FaEdit className="h-3 w-3" /> Edit
                    </Link>
                    <button
                      onClick={() => setToDelete(p)}
                      className="inline-flex items-center gap-1 text-red-600 hover:underline text-xs"
                    >
                      <FaTrash className="h-3 w-3" /> Delete
                    </button>
                  </td>
                </motion.tr>
              ))}
            </AnimatePresence>
            {projects.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted">
                  <FaFolderOpen className="mx-auto mb-3 h-8 w-8 text-gray-300" />
                  No projects match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Pagination
        page={page}
        totalPages={totalPages}
        totalItems={totalItems}
        pageSize={PAGE_SIZE}
        onPageChange={goToPage}
      />

      <Modal open={!!toDelete} onClose={() => setToDelete(null)} title="Delete project?">
        <p className="text-sm text-muted mb-4">
          This will permanently delete <strong>{toDelete?.name}</strong> and all
          timesheet entries logged against it. This cannot be undone.
        </p>
        <div className="flex justify-end gap-2">
          <button className="btn-ghost px-4 py-2 text-sm" onClick={() => setToDelete(null)}>
            Cancel
          </button>
          <button
            className="btn-danger px-4 py-2 text-sm"
            onClick={confirmDelete}
            disabled={pending}
          >
            {pending ? "Deleting…" : "Delete"}
          </button>
        </div>
      </Modal>
    </div>
  );
}
