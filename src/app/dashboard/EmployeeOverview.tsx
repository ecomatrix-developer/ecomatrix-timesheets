"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
} from "recharts";
import {
  FaClock,
  FaFireAlt,
  FaUmbrellaBeach,
  FaCheckCircle,
  FaHourglassHalf,
  FaFolderOpen,
  FaArrowRight,
  FaCalendarCheck,
  FaEnvelope,
} from "react-icons/fa";
import GlassCard from "@/components/GlassCard";
import CountUpStat from "@/components/CountUpStat";

const PROJECT_COLORS = [
  "#667eea",
  "#22d3ee",
  "#f472b6",
  "#facc15",
  "#4ade80",
  "#fb923c",
];

export interface EmployeeDayStatus {
  date: string; // YYYY-MM-DD
  dayLabel: string; // 'Mon 6'
  submitted: boolean;
  hours: number;
}

export interface EmployeeProjectHours {
  name: string;
  hours: number;
}

export default function EmployeeOverview({
  monthLabel,
  monthRegularHours,
  monthOvertimeHours,
  monthPtoHours,
  recentDays,
  projectHours,
}: {
  monthLabel: string;
  monthRegularHours: number;
  monthOvertimeHours: number;
  monthPtoHours: number;
  recentDays: EmployeeDayStatus[];
  projectHours: EmployeeProjectHours[];
}) {
  const monthTotal = monthRegularHours + monthOvertimeHours;
  const pendingDays = recentDays.filter((d) => !d.submitted && d.hours > 0);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <FaClock className="text-accent h-4 w-4" /> This Month ({monthLabel})
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          <GlassCard
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            whileHover={{ y: -4 }}
            className="relative overflow-hidden flex items-center justify-between gap-2 p-4"
          >
            <CountUpStat value={Math.round(monthTotal * 100) / 100} label="Total hours logged" accent="#667eea" decimals={2} />
            <FaHourglassHalf className="h-6 w-6 text-gray-300 shrink-0" />
          </GlassCard>
          <GlassCard
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            whileHover={{ y: -4 }}
            className="relative overflow-hidden flex items-center justify-between gap-2 p-4"
          >
            <CountUpStat value={Math.round(monthRegularHours * 100) / 100} label="Regular hours" accent="#22c55e" decimals={2} />
            <FaCheckCircle className="h-6 w-6 text-gray-300 shrink-0" />
          </GlassCard>
          <GlassCard
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            whileHover={{ y: -4 }}
            className="relative overflow-hidden flex items-center justify-between gap-2 p-4"
          >
            <CountUpStat value={Math.round(monthOvertimeHours * 100) / 100} label="Overtime hours" accent="#f59e0b" decimals={2} />
            <FaFireAlt className="h-6 w-6 text-gray-300 shrink-0" />
          </GlassCard>
          <GlassCard
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            whileHover={{ y: -4 }}
            className="relative overflow-hidden flex items-center justify-between gap-2 p-4"
          >
            <CountUpStat value={Math.round(monthPtoHours * 100) / 100} label="PTO used" accent="#8b5cf6" decimals={2} />
            <FaUmbrellaBeach className="h-6 w-6 text-gray-300 shrink-0" />
          </GlassCard>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="glass p-4">
            <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
              <h3 className="text-sm font-semibold flex items-center gap-1.5">
                <FaCalendarCheck className="h-3.5 w-3.5 text-accent shrink-0" /> Last 7 Days
              </h3>
              <Link href="/timesheet" className="text-xs text-accent hover:underline inline-flex items-center gap-1 shrink-0">
                Go to Timesheet <FaArrowRight className="h-2.5 w-2.5" />
              </Link>
            </div>
            <div className="space-y-1.5">
              {recentDays.length === 0 && <p className="text-sm text-muted">No recent entries.</p>}
              {recentDays.map((d) => (
                <div key={d.date} className="flex items-center justify-between gap-2 text-sm border-b border-gray-100 pb-1.5">
                  <span className="shrink-0">{d.dayLabel}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-muted">{d.hours > 0 ? `${d.hours.toFixed(2)}h` : "—"}</span>
                    {d.hours === 0 ? (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 whitespace-nowrap">No entry</span>
                    ) : d.submitted ? (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 whitespace-nowrap">Submitted</span>
                    ) : (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 whitespace-nowrap">Pending</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {pendingDays.length > 0 && (
              <div className="mt-3 text-xs px-3 py-2 rounded-lg bg-amber-50 text-amber-700 border border-amber-200">
                You have {pendingDays.length} day{pendingDays.length === 1 ? "" : "s"} with hours logged but not yet submitted.
              </div>
            )}
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="glass p-4"
          >
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-1.5">
              <FaFolderOpen className="h-3.5 w-3.5 text-accent" /> Your Projects This Month
            </h3>
            {projectHours.length === 0 ? (
              <p className="text-sm text-muted">No project hours logged yet this month.</p>
            ) : (
              <div className="flex flex-col sm:flex-row items-center gap-4">
                <div style={{ width: 120, height: 120 }} className="shrink-0">
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie data={projectHours} dataKey="hours" nameKey="name" innerRadius={34} outerRadius={56} paddingAngle={2}>
                        {projectHours.map((_, i) => (
                          <Cell key={i} fill={PROJECT_COLORS[i % PROJECT_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          background: "#181a2a",
                          border: "1px solid rgba(255,255,255,0.14)",
                          borderRadius: 8,
                          color: "#fff",
                          fontSize: 12,
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="w-full sm:flex-1 min-w-0 space-y-1.5 max-h-28 overflow-y-auto scrollbar-thin">
                  {projectHours.map((p, i) => (
                    <div key={p.name} className="flex items-center gap-2 text-sm min-w-0">
                      <span
                        className="h-2.5 w-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: PROJECT_COLORS[i % PROJECT_COLORS.length] }}
                      />
                      <span className="truncate flex-1 min-w-0">{p.name}</span>
                      <span className="font-medium shrink-0">{p.hours.toFixed(1)}h</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row flex-wrap gap-2">
        <Link
          href="/timesheet"
          className="btn-primary inline-flex items-center justify-center gap-2 px-3 py-1.5 text-sm"
        >
          <FaClock className="h-3 w-3" /> Fill Timesheet
        </Link>
        <Link
          href="/dashboard"
          className="inline-flex items-center justify-center gap-2 px-3 py-1.5 text-sm rounded-lg border border-gray-200 text-foreground hover:bg-gray-50 transition-colors"
        >
          <FaFolderOpen className="h-3 w-3" /> View Projects
        </Link>
        <Link
          href="/contact"
          className="inline-flex items-center justify-center gap-2 px-3 py-1.5 text-sm rounded-lg border border-gray-200 text-foreground hover:bg-gray-50 transition-colors"
        >
          <FaEnvelope className="h-3 w-3" /> Contact Admin/Owner
        </Link>
      </div>
    </div>
  );
}
