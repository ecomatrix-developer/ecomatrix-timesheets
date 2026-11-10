"use client";

import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import GlassCard from "@/components/GlassCard";
import CountUpStat from "@/components/CountUpStat";
import Select from "@/components/Select";
import { MONTH_NAMES } from "@/lib/dateUtils";
import { FaFileExcel, FaCalendarAlt } from "react-icons/fa";

export default function ExportTimesheetClient({
  year,
  month,
  employeeCount,
  projectCount,
  totalHours,
}: {
  year: number;
  month: number;
  employeeCount: number;
  projectCount: number;
  totalHours: number;
}) {
  const router = useRouter();

  function updateParams(next: { month?: number; year?: number }) {
    const params = new URLSearchParams();
    params.set("month", String(next.month ?? month));
    params.set("year", String(next.year ?? year));
    router.push(`/export_timesheet?${params.toString()}`, { scroll: false });
    router.refresh();
  }

  const downloadUrl = `/api/export/monthly-timesheet?${new URLSearchParams({
    year: String(year),
    month: String(month),
  }).toString()}`;

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
          <a href={downloadUrl} className="btn-primary inline-flex items-center gap-2 px-4 py-2.5 text-sm">
            <FaFileExcel className="h-3.5 w-3.5" /> Download Excel
          </a>
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
