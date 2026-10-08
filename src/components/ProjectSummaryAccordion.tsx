"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FaChevronDown,
  FaSyncAlt,
  FaFolderOpen,
  FaExpandAlt,
  FaCompressAlt,
  FaSearch,
  FaTimes,
} from "react-icons/fa";
import type { Project } from "@/lib/types";
import Pagination from "@/components/Pagination";
import { PAGE_SIZE, PROJECT_STATUSES } from "@/lib/constants";

const STATUS_BADGE: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-700",
  completed: "bg-sky-100 text-sky-700",
  "re-work": "bg-amber-100 text-amber-700",
  archived: "bg-zinc-100 text-zinc-600",
};

const STATUS_PILL_ACTIVE: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-700 border-emerald-200",
  completed: "bg-sky-100 text-sky-700 border-sky-200",
  "re-work": "bg-amber-100 text-amber-700 border-amber-200",
  archived: "bg-zinc-100 text-zinc-600 border-zinc-200",
};

interface DrillDownData {
  summary: {
    total_hours: number;
    unique_employees: number;
    total_entries: number;
    date_range: { start?: string; end?: string };
  };
  employee_summary: Record<string, { name: string; total_hours: number }>;
  entries: { employee: string; date: string; hours: number; comment: string | null }[];
}

/**
 * Mirrors v1's Reports page "Project Summary" accordion exactly: a
 * paginated list of every project, each expandable into its own
 * drill-down (fetched on demand from /api/reports/project/<id>) showing
 * summary stats and a pivoted employee×date hours grid.
 */
export default function ProjectSummaryAccordion({
  projects,
  projectTotals,
  page,
  totalPages,
  totalItems,
  onPageChange,
  selectedStatuses,
  onToggleStatus,
  search,
  onSearchChange,
}: {
  projects: Project[];
  projectTotals: Record<string, number>;
  page: number;
  totalPages: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  selectedStatuses: string[];
  onToggleStatus: (status: string) => void;
  search: string;
  onSearchChange: (value: string) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [dataByProject, setDataByProject] = useState<Record<string, DrillDownData | "loading" | "error">>({});

  // Live search: debounce keystrokes instead of waiting for a submit.
  const [searchDraft, setSearchDraft] = useState(search);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFirstRender = useRef(true);
  useEffect(() => {
    setSearchDraft(search);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      onSearchChange(searchDraft);
    }, 350);
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchDraft]);

  async function loadProjectDetails(projectId: string) {
    setDataByProject((prev) => ({ ...prev, [projectId]: "loading" }));
    try {
      const res = await fetch(`/api/reports/project/${projectId}`);
      const data = await res.json();
      if (data.error) {
        setDataByProject((prev) => ({ ...prev, [projectId]: "error" }));
        return;
      }
      setDataByProject((prev) => ({ ...prev, [projectId]: data }));
    } catch {
      setDataByProject((prev) => ({ ...prev, [projectId]: "error" }));
    }
  }

  function toggle(projectId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) {
        next.delete(projectId);
      } else {
        next.add(projectId);
        if (!dataByProject[projectId]) loadProjectDetails(projectId);
      }
      return next;
    });
  }

  function expandAll() {
    setExpanded(new Set(projects.map((p) => p.id)));
    projects.forEach((p) => {
      if (!dataByProject[p.id]) loadProjectDetails(p.id);
    });
  }

  function collapseAll() {
    setExpanded(new Set());
  }

  return (
    <div className="glass !p-0 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
        <h6 className="font-semibold text-accent text-sm">Project Summary</h6>
        <div className="flex gap-2">
          <button onClick={expandAll} className="btn-ghost text-xs px-3 py-1.5 inline-flex items-center gap-1.5">
            <FaExpandAlt className="h-3 w-3" /> Expand All
          </button>
          <button onClick={collapseAll} className="btn-ghost text-xs px-3 py-1.5 inline-flex items-center gap-1.5">
            <FaCompressAlt className="h-3 w-3" /> Collapse All
          </button>
        </div>
      </div>

      <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/50 flex flex-col gap-3">
        <div className="relative">
          <input
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
            placeholder="Search by project name, project #, or client…"
            className="glass-input w-full pl-9 pr-8 py-2 text-sm"
          />
          <FaSearch className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted" />
          {searchDraft && (
            <button
              type="button"
              onClick={() => setSearchDraft("")}
              className="absolute right-3 top-2.5 text-muted hover:text-foreground"
            >
              <FaTimes className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted font-medium mr-1">Status:</span>
          {PROJECT_STATUSES.map((status) => {
            const active = selectedStatuses.includes(status);
            return (
              <button
                key={status}
                type="button"
                onClick={() => onToggleStatus(status)}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                  active
                    ? STATUS_PILL_ACTIVE[status]
                    : "border-gray-200 text-muted hover:text-foreground bg-white"
                }`}
              >
                {status}
              </button>
            );
          })}
        </div>
      </div>

      <div className="p-4">
        {projects.length === 0 ? (
          <div className="text-center py-8 text-muted">
            <FaFolderOpen className="mx-auto mb-3 h-8 w-8 text-gray-300" />
            <p>No projects available.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {projects.map((project) => {
              const isOpen = expanded.has(project.id);
              const details = dataByProject[project.id];
              return (
                <div key={project.id} className="border border-gray-200 rounded-lg overflow-hidden">
                  <button
                    type="button"
                    onClick={() => toggle(project.id)}
                    className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">
                        {project.project_number} - {project.name}
                      </p>
                      {project.description && (
                        <p className="text-xs text-muted truncate">{project.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-3 shrink-0 ml-3">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${
                          STATUS_BADGE[project.status] ?? "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {project.status}
                      </span>
                      <span className="text-xs text-muted">
                        {(projectTotals[project.id] ?? 0).toFixed(1)}h
                      </span>
                      <motion.span animate={{ rotate: isOpen ? 180 : 0 }}>
                        <FaChevronDown className="h-3 w-3 text-muted" />
                      </motion.span>
                    </div>
                  </button>

                  <AnimatePresence>
                    {isOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden border-t border-gray-100"
                      >
                        <div className="p-4">
                          {details === "loading" || !details ? (
                            <p className="text-sm text-muted text-center py-4">Loading…</p>
                          ) : details === "error" ? (
                            <p className="text-sm text-red-600 text-center py-4">
                              Error loading project details.
                            </p>
                          ) : (
                            <>
                              <div className="flex items-center justify-between mb-3">
                                <div className="grid grid-cols-4 gap-4 flex-1">
                                  <div>
                                    <p className="text-xs text-muted">Total Hours</p>
                                    <p className="font-semibold">
                                      {details.summary.total_hours.toFixed(1)}
                                    </p>
                                  </div>
                                  <div>
                                    <p className="text-xs text-muted">Employees</p>
                                    <p className="font-semibold">{details.summary.unique_employees}</p>
                                  </div>
                                  <div>
                                    <p className="text-xs text-muted">Date Range</p>
                                    <p className="text-xs">
                                      {details.summary.date_range.start
                                        ? `${details.summary.date_range.start} to ${details.summary.date_range.end}`
                                        : "No entries"}
                                    </p>
                                  </div>
                                  <div>
                                    <p className="text-xs text-muted">Total Entries</p>
                                    <p className="font-semibold">{details.summary.total_entries}</p>
                                  </div>
                                </div>
                                <button
                                  onClick={() => loadProjectDetails(project.id)}
                                  className="btn-ghost text-xs px-3 py-1.5 inline-flex items-center gap-1.5 shrink-0"
                                >
                                  <FaSyncAlt className="h-3 w-3" /> Refresh
                                </button>
                              </div>

                              {details.entries.length === 0 ? (
                                <p className="text-sm text-muted text-center py-4">
                                  No time entries found for this project.
                                </p>
                              ) : (
                                <PivotedEmployeeGrid entries={details.entries} />
                              )}
                            </>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        )}

        <Pagination
          page={page}
          totalPages={totalPages}
          totalItems={totalItems}
          pageSize={PAGE_SIZE}
          onPageChange={onPageChange}
        />
      </div>
    </div>
  );
}

/** Pivots a flat entry list into an employee × date hours grid, matching
 * v1's updateEmployeeTable() exactly. */
function PivotedEmployeeGrid({
  entries,
}: {
  entries: { employee: string; date: string; hours: number }[];
}) {
  const employeeData: Record<string, { hoursByDate: Record<string, number>; total: number }> = {};
  const dateSet = new Set<string>();

  for (const e of entries) {
    employeeData[e.employee] ??= { hoursByDate: {}, total: 0 };
    employeeData[e.employee].hoursByDate[e.date] = e.hours;
    employeeData[e.employee].total += e.hours;
    dateSet.add(e.date);
  }

  const sortedDates = [...dateSet].sort();
  const sortedEmployees = Object.keys(employeeData).sort();

  return (
    <div className="overflow-x-auto scrollbar-thin">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="border-b border-gray-200">
            <th className="text-left py-1.5 pr-2">Employee</th>
            {sortedDates.map((d) => (
              <th key={d} className="py-1.5 px-1.5 text-center whitespace-nowrap">
                {d}
              </th>
            ))}
            <th className="py-1.5 pl-2 text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {sortedEmployees.map((emp) => (
            <tr key={emp} className="border-b border-gray-100">
              <td className="py-1.5 pr-2 font-medium whitespace-nowrap">{emp}</td>
              {sortedDates.map((d) => (
                <td key={d} className="py-1.5 px-1.5 text-center">
                  {employeeData[emp].hoursByDate[d]?.toFixed(2) ?? ""}
                </td>
              ))}
              <td className="py-1.5 pl-2 text-right font-semibold">
                {employeeData[emp].total.toFixed(2)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
