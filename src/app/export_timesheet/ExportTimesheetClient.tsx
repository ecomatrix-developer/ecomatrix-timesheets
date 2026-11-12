"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import GlassCard from "@/components/GlassCard";
import CountUpStat from "@/components/CountUpStat";
import Select from "@/components/Select";
import { MONTH_NAMES } from "@/lib/dateUtils";
import { FaFileExcel, FaCalendarAlt, FaCheckSquare, FaSquare } from "react-icons/fa";

type ExportMode = "consolidated" | "client";

export default function ExportTimesheetClient({
  year,
  month,
  employeeCount,
  projectCount,
  totalHours,
  clients,
}: {
  year: number;
  month: number;
  employeeCount: number;
  projectCount: number;
  totalHours: number;
  clients: string[];
}) {
  const router = useRouter();
  const [mode, setMode] = useState<ExportMode>("consolidated");
  const [selectedClients, setSelectedClients] = useState<string[]>([]);

  function updateParams(next: { month?: number; year?: number }) {
    const params = new URLSearchParams();
    params.set("month", String(next.month ?? month));
    params.set("year", String(next.year ?? year));
    router.push(`/export_timesheet?${params.toString()}`, { scroll: false });
    router.refresh();
  }

  function toggleClient(client: string) {
    setSelectedClients((prev) => (prev.includes(client) ? prev.filter((c) => c !== client) : [...prev, client]));
  }

  const downloadUrl = useMemo(() => {
    const params = new URLSearchParams({ year: String(year), month: String(month) });
    if (mode === "client") {
      for (const c of selectedClients) params.append("client", c);
    }
    return `/api/export/monthly-timesheet?${params.toString()}`;
  }, [year, month, mode, selectedClients]);

  const downloadDisabled = mode === "client" && selectedClients.length === 0;

  return (
    <div className="w-full">
      <div className="mb-6 flex flex-col gap-4 border-b border-gray-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <FaFileExcel className="text-accent" /> Export Monthly Timesheet
        </h1>
      </div>

      <GlassCard className="mb-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="sm:w-48">
            <label className="text-xs text-muted block mb-1">Month</label>
            <Select
              value={String(month)}
              onChange={(value) => updateParams({ month: parseInt(value, 10) })}
              options={MONTH_NAMES.map((name, index) => ({ value: String(index + 1), label: name }))}
            />
          </div>
          <div>
            <label className="text-xs text-muted block mb-1">Year</label>
            <input
              type="number"
              value={year}
              onChange={(event) => updateParams({ year: parseInt(event.target.value, 10) })}
              className="glass-input w-24 px-3 py-2.5 text-sm"
            />
          </div>
          {!downloadDisabled && (
            <a href={downloadUrl} className="btn-primary inline-flex items-center gap-2 px-4 py-2.5 text-sm">
              <FaFileExcel className="h-3.5 w-3.5" /> Download Excel
            </a>
          )}
          {downloadDisabled && (
            <button
              type="button"
              disabled
              className="btn-primary inline-flex items-center gap-2 px-4 py-2.5 text-sm opacity-50 cursor-not-allowed"
            >
              <FaFileExcel className="h-3.5 w-3.5" /> Download Excel
            </button>
          )}
        </div>

        <div className="mt-4 border-t border-gray-200 pt-4">
          <label className="text-xs text-muted block mb-2">Export type</label>
          <div className="inline-flex rounded-xl border border-gray-200 bg-white p-1 text-sm">
            <button
              type="button"
              onClick={() => setMode("consolidated")}
              className={`px-3.5 py-1.5 rounded-lg font-medium transition-colors ${
                mode === "consolidated" ? "bg-accent text-white" : "text-muted hover:text-foreground"
              }`}
            >
              Consolidated
            </button>
            <button
              type="button"
              onClick={() => setMode("client")}
              className={`px-3.5 py-1.5 rounded-lg font-medium transition-colors ${
                mode === "client" ? "bg-accent text-white" : "text-muted hover:text-foreground"
              }`}
            >
              Client-wise
            </button>
          </div>

          {mode === "consolidated" && (
            <p className="text-xs text-muted mt-3">
              One sheet with every client and project combined — the default export.
            </p>
          )}

          {mode === "client" && (
            <div className="mt-3">
              {clients.length === 0 ? (
                <p className="text-xs text-muted">No clients found on any project yet.</p>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs text-muted">
                      Pick one or more clients — each gets its own sheet in the same workbook.
                    </p>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => setSelectedClients(clients)}
                        className="text-xs text-accent hover:underline"
                      >
                        Select all
                      </button>
                      <span className="text-gray-300">|</span>
                      <button
                        type="button"
                        onClick={() => setSelectedClients([])}
                        className="text-xs text-accent hover:underline"
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                  <div className="max-h-56 overflow-y-auto scrollbar-thin rounded-xl border border-gray-200 bg-white p-2 grid grid-cols-1 sm:grid-cols-2 gap-1">
                    {clients.map((client) => {
                      const checked = selectedClients.includes(client);
                      return (
                        <button
                          key={client}
                          type="button"
                          onClick={() => toggleClient(client)}
                          className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-sm text-left transition-colors ${
                            checked ? "bg-accent/10 text-accent font-medium" : "text-foreground hover:bg-gray-50"
                          }`}
                        >
                          {checked ? (
                            <FaCheckSquare className="h-3.5 w-3.5 shrink-0" />
                          ) : (
                            <FaSquare className="h-3.5 w-3.5 shrink-0 text-gray-300" />
                          )}
                          <span className="truncate">{client}</span>
                        </button>
                      );
                    })}
                  </div>
                  {selectedClients.length > 0 && (
                    <p className="text-xs text-muted mt-2">
                      {selectedClients.length} client{selectedClients.length === 1 ? "" : "s"} selected —{" "}
                      {selectedClients.length} sheet{selectedClients.length === 1 ? "" : "s"} will be generated.
                    </p>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        <p className="text-xs text-muted mt-3 flex items-center gap-1.5">
          <FaCalendarAlt className="h-3 w-3" />
          Rebuilds the full Monthly Timesheet workbook — Category/Project summary with daily hours, plus a
          per-employee breakdown — straight from the logged entries for {MONTH_NAMES[month - 1]} {year}.
        </p>
      </GlassCard>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <GlassCard>
          <CountUpStat value={employeeCount} label="Employees with logged hours" accent="#8b5cf6" />
        </GlassCard>
        <GlassCard>
          <CountUpStat value={projectCount} label="Projects with logged hours" accent="#22d3ee" />
        </GlassCard>
        <GlassCard strong>
          <CountUpStat value={totalHours} label="Total hours logged" accent="#4ade80" decimals={2} />
        </GlassCard>
      </div>

      {employeeCount === 0 && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="glass p-6 text-center text-muted text-sm">
          No project hours were logged for {MONTH_NAMES[month - 1]} {year} — the exported workbook will still
          generate, but every section will be empty.
        </motion.div>
      )}

      <p className="text-xs text-muted">
        The &quot;Redn Factor&quot; column in the exported sheet always starts at 0% — it isn&apos;t tracked in
        the app, so adjust it directly in Excel afterward if hours need to be written down for billing. The
        summary section recalculates automatically from that column since it&apos;s formula-driven, exactly
        like the original hand-built sheet.
      </p>
    </div>
  );
}
