"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";
import type { Project } from "@/lib/types";
import GlassCard from "@/components/GlassCard";
import Pagination from "@/components/Pagination";
import { PAGE_SIZE, PROJECT_STATUSES } from "@/lib/constants";
import {
  FaCog,
  FaFolderOpen,
  FaSearch,
  FaTimes,
  FaBuilding,
  FaHashtag,
  FaBolt,
  FaDraftingCompass,
  FaCheckCircle,
  FaSyncAlt,
  FaArchive,
  FaPlayCircle,
} from "react-icons/fa";

const STATUS_BADGE: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-700 border-emerald-200",
  completed: "bg-sky-100 text-sky-700 border-sky-200",
  "re-work": "bg-amber-100 text-amber-700 border-amber-200",
  archived: "bg-zinc-100 text-zinc-600 border-zinc-200",
};

const STATUS_ICON: Record<string, typeof FaPlayCircle> = {
  active: FaPlayCircle,
  completed: FaCheckCircle,
  "re-work": FaSyncAlt,
  archived: FaArchive,
};

const STATUS_ACCENT: Record<string, string> = {
  active: "#10b981",
  completed: "#0ea5e9",
  "re-work": "#f59e0b",
  archived: "#71717a",
};

const TYPE_ICON: Record<string, typeof FaBolt> = {
  "Energy Modelling": FaBolt,
  "BIM and AutoCad": FaDraftingCompass,
};

const PROJECT_TYPES = ["Energy Modelling", "BIM and AutoCad"];

export default function DashboardProjectsTable({
  projects,
  page,
  totalPages,
  totalItems,
  isAdmin,
}: {
  projects: Project[];
  page: number;
  totalPages: number;
  totalItems: number;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [search, setSearch] = useState(searchParams.get("search_term") ?? "");
  const selectedStatuses = searchParams.getAll("status");
  const selectedTypes = searchParams.getAll("project_type");

  function updateParams(newSearch: string, newStatuses: string[], newTypes: string[]) {
    const params = new URLSearchParams();
    if (newSearch.trim()) params.set("search_term", newSearch.trim());
    newStatuses.forEach((s) => params.append("status", s));
    newTypes.forEach((t) => params.append("project_type", t));
    params.set("page", "1");
    router.push(`/dashboard?${params.toString()}`);
    router.refresh();
  }

  // Live search: debounce keystrokes instead of waiting for a full submit.
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      updateParams(search, selectedStatuses, selectedTypes);
    }, 350);
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    updateParams(search, selectedStatuses, selectedTypes);
  }

  function toggleStatus(status: string) {
    const next = selectedStatuses.includes(status)
      ? selectedStatuses.filter((s) => s !== status)
      : [...selectedStatuses, status];
    updateParams(search, next, selectedTypes);
  }

  function toggleType(type: string) {
    const next = selectedTypes.includes(type)
      ? selectedTypes.filter((t) => t !== type)
      : [...selectedTypes, type];
    updateParams(search, selectedStatuses, next);
  }

  function clearAll() {
    setSearch("");
    router.push("/dashboard");
    router.refresh();
  }

  function goToPage(next: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(next));
    router.push(`/dashboard?${params.toString()}`);
    router.refresh();
  }

  const hasFilters = search.trim() !== "" || selectedStatuses.length > 0 || selectedTypes.length > 0;

  return (
    <GlassCard
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
      className="mt-6 !p-0 overflow-hidden"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between px-5 py-3 border-b border-gray-100 gap-2">
        <div className="flex items-center gap-2">
          <h6 className="font-semibold text-accent text-sm">Your Projects</h6>
          <span className="text-xs text-muted">({totalItems} matching)</span>
        </div>
        {isAdmin && (
          <Link
            href="/projects"
            className="btn-primary inline-flex items-center gap-2 px-3 py-1.5 text-xs self-start sm:self-auto"
          >
            <FaCog className="h-3 w-3" /> Manage
          </Link>
        )}
      </div>

      <div className="p-4 border-b border-gray-100 bg-gray-50/50 flex flex-col gap-3">
        <form onSubmit={handleSearchSubmit} className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1 min-w-0">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search projects by name, project #, client, or type..."
              className="glass-input w-full pl-9 pr-8 py-1.5 text-xs"
            />
            <FaSearch className="absolute left-3 top-2.5 h-3 w-3 text-muted" />
            {search && (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  updateParams("", selectedStatuses, selectedTypes);
                }}
                className="absolute right-2.5 top-2.5 text-muted hover:text-foreground"
              >
                <FaTimes className="h-3 w-3" />
              </button>
            )}
          </div>
          <div className="flex gap-2 shrink-0">
            <button type="submit" className="btn-ghost px-3 py-1.5 text-xs inline-flex items-center justify-center gap-1.5 flex-1 sm:flex-initial">
              <FaSearch className="h-3 w-3" /> Search
            </button>
            {hasFilters && (
              <button
                type="button"
                onClick={clearAll}
                className="px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-red-200 shrink-0"
              >
                Clear
              </button>
            )}
          </div>
        </form>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted font-medium">Status:</span>
          {PROJECT_STATUSES.map((status) => {
            const active = selectedStatuses.includes(status);
            return (
              <button
                key={status}
                onClick={() => toggleStatus(status)}
                className={`px-2.5 py-1 rounded-full border transition-colors ${
                  active
                    ? "bg-accent text-white border-accent"
                    : "border-gray-200 text-muted hover:text-foreground bg-white"
                }`}
              >
                {status}
              </button>
            );
          })}

          <span className="text-muted font-medium ml-2">Type:</span>
          {PROJECT_TYPES.map((type) => {
            const active = selectedTypes.includes(type);
            return (
              <button
                key={type}
                onClick={() => toggleType(type)}
                className={`px-2.5 py-1 rounded-full border transition-colors ${
                  active
                    ? "bg-accent text-white border-accent"
                    : "border-gray-200 text-muted hover:text-foreground bg-white"
                }`}
              >
                {type}
              </button>
            );
          })}
        </div>
      </div>

      <div className="p-5">
        {projects.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((p, i) => {
              const StatusIcon = STATUS_ICON[p.status] ?? FaFolderOpen;
              const TypeIcon = TYPE_ICON[p.project_type] ?? FaFolderOpen;
              const accent = STATUS_ACCENT[p.status] ?? "#71717a";
              return (
                <motion.div
                  key={p.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i, 8) * 0.03 }}
                  whileHover={{ y: -3 }}
                  className="glass rounded-xl p-4 flex flex-col gap-3 border-l-[3px]"
                  style={{ borderLeftColor: accent }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-sm truncate" title={p.name}>
                        {p.name}
                      </p>
                      <p className="text-xs text-muted flex items-center gap-1 mt-0.5">
                        <FaBuilding className="h-2.5 w-2.5 shrink-0" />
                        <span className="truncate">{p.client_name}</span>
                      </p>
                    </div>
                    <span
                      className={`shrink-0 inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-full border font-medium ${
                        STATUS_BADGE[p.status] ?? "bg-gray-100 text-gray-600 border-gray-200"
                      }`}
                    >
                      <StatusIcon className="h-2.5 w-2.5" />
                      {p.status}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="inline-flex items-center gap-1 text-muted">
                      <FaHashtag className="h-2.5 w-2.5" />
                      {p.project_number ?? "No number"}
                    </span>
                    <span className="inline-flex items-center gap-1 bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full">
                      <TypeIcon className="h-2.5 w-2.5" />
                      {p.project_type}
                    </span>
                  </div>
                </motion.div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-8 text-muted">
            <FaFolderOpen className="mx-auto mb-3 h-8 w-8 text-gray-300" />
            <p>No projects match your search query or filters.</p>
          </div>
        )}

        <Pagination
          page={page}
          totalPages={totalPages}
          totalItems={totalItems}
          pageSize={PAGE_SIZE}
          onPageChange={goToPage}
        />
      </div>
    </GlassCard>
  );
}
