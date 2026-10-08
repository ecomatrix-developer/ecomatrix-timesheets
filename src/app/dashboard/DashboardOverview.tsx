"use client";

import { motion } from "framer-motion";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import {
  FaClock,
  FaExclamationTriangle,
  FaCheckCircle,
  FaFolderOpen,
} from "react-icons/fa";
import GlassCard from "@/components/GlassCard";
import CountUpStat from "@/components/CountUpStat";

const STATUS_COLORS: Record<string, string> = {
  active: "#22c55e",
  completed: "#0ea5e9",
  "re-work": "#f59e0b",
  archived: "#94a3b8",
};

const TYPE_COLORS = ["#8b5cf6", "#22d3ee"];
const BILLABLE_COLORS = ["#667eea", "#f59e0b"];

export interface MonthlyHoursPoint {
  label: string; // 'Jan 2026'
  billable: number;
  nonBillable: number;
}

export interface ComplianceEmployee {
  name: string;
  compliant: boolean;
  missingDays: number;
}

export interface TopProjectHours {
  name: string;
  hours: number;
}

export default function DashboardOverview({
  monthlyHours,
  billableSplit,
  statusCounts,
  typeCounts,
  compliance,
  topProjects,
  overtimeFlags,
}: {
  monthlyHours: MonthlyHoursPoint[];
  billableSplit: { billable: number; nonBillable: number };
  statusCounts: Record<string, number>;
  typeCounts: { name: string; value: number }[];
  compliance: ComplianceEmployee[];
  topProjects: TopProjectHours[];
  overtimeFlags: { name: string; hours: number }[];
}) {
  const compliantCount = compliance.filter((c) => c.compliant).length;
  const totalEmployees = compliance.length;
  const billableData = [
    { name: "Billable", value: billableSplit.billable },
    { name: "Non-Billable", value: billableSplit.nonBillable },
  ];
  const statusData = Object.entries(statusCounts).map(([name, value]) => ({ name, value }));

  return (
    <div className="space-y-6">
      {/* --- Hours & Compliance section --- */}
      <div>
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <FaClock className="text-accent h-4 w-4" /> Hours &amp; Compliance
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          <GlassCard className="p-4">
            <CountUpStat
              value={compliantCount}
              label={`Compliant this week (of ${totalEmployees})`}
              accent="#22c55e"
            />
          </GlassCard>
          <GlassCard className="p-4">
            <CountUpStat value={overtimeFlags.length} label="Employees with high overtime" accent="#ef4444" />
          </GlassCard>
          <GlassCard className="p-4">
            <CountUpStat
              value={Math.round(monthlyHours.reduce((s, m) => s + m.billable + m.nonBillable, 0))}
              label="Total hours (last 6 months)"
              accent="#667eea"
            />
          </GlassCard>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass p-4 lg:col-span-2"
          >
            <h3 className="text-sm font-semibold mb-3">Monthly Hours Trend (Billable vs Non-Billable)</h3>
            <div style={{ width: "100%", height: 280 }}>
              <ResponsiveContainer>
                <BarChart data={monthlyHours} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.08)" />
                  <XAxis dataKey="label" tick={{ fill: "#6c757d", fontSize: 11 }} />
                  <YAxis tick={{ fill: "#6c757d", fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{
                      background: "#ffffff",
                      border: "1px solid rgba(0,0,0,0.1)",
                      borderRadius: 8,
                      color: "#212529",
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="billable" name="Billable" stackId="h" fill={BILLABLE_COLORS[0]} radius={[0, 0, 0, 0]} />
                  <Bar
                    dataKey="nonBillable"
                    name="Non-Billable"
                    stackId="h"
                    fill={BILLABLE_COLORS[1]}
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="glass p-4"
          >
            <h3 className="text-sm font-semibold mb-3">Billable vs Non-Billable (6mo)</h3>
            <div style={{ width: "100%", height: 220 }}>
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={billableData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2}>
                    {billableData.map((_, i) => (
                      <Cell key={i} fill={BILLABLE_COLORS[i % BILLABLE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: "#181a2a",
                      border: "1px solid rgba(255,255,255,0.14)",
                      borderRadius: 8,
                      color: "#fff",
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </motion.div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass p-4"
          >
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-1.5">
              <FaCheckCircle className="h-3.5 w-3.5 text-emerald-500" /> Submission Compliance (this week)
            </h3>
            <div className="space-y-1.5 max-h-56 overflow-y-auto scrollbar-thin">
              {compliance.length === 0 && <p className="text-sm text-muted">No employees found.</p>}
              {compliance.map((c) => (
                <div
                  key={c.name}
                  className="flex items-center justify-between text-sm border-b border-gray-100 pb-1.5"
                >
                  <span>{c.name}</span>
                  {c.compliant ? (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                      Up to date
                    </span>
                  ) : (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                      {c.missingDays} day{c.missingDays === 1 ? "" : "s"} missing
                    </span>
                  )}
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="glass p-4"
          >
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-1.5">
              <FaExclamationTriangle className="h-3.5 w-3.5 text-red-500" /> Overtime Flags (last 6 months)
            </h3>
            <div className="space-y-1.5 max-h-56 overflow-y-auto scrollbar-thin">
              {overtimeFlags.length === 0 ? (
                <p className="text-sm text-muted">No employees flagged for high overtime.</p>
              ) : (
                overtimeFlags.map((f) => (
                  <div key={f.name} className="flex items-center justify-between text-sm border-b border-gray-100 pb-1.5">
                    <span>{f.name}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                      {f.hours.toFixed(1)}h overtime
                    </span>
                  </div>
                ))
              )}
            </div>
          </motion.div>
        </div>
      </div>

      {/* --- Project Portfolio section --- */}
      <div>
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <FaFolderOpen className="text-accent h-4 w-4" /> Project Portfolio
        </h2>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="glass p-4">
            <h3 className="text-sm font-semibold mb-3">Status Distribution</h3>
            <div style={{ width: "100%", height: 220 }}>
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={statusData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={85} paddingAngle={2}>
                    {statusData.map((d) => (
                      <Cell key={d.name} fill={STATUS_COLORS[d.name] ?? "#ccc"} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: "#181a2a",
                      border: "1px solid rgba(255,255,255,0.14)",
                      borderRadius: 8,
                      color: "#fff",
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="glass p-4"
          >
            <h3 className="text-sm font-semibold mb-3">Category Distribution</h3>
            <div style={{ width: "100%", height: 220 }}>
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={typeCounts} dataKey="value" nameKey="name" innerRadius={50} outerRadius={85} paddingAngle={2}>
                    {typeCounts.map((_, i) => (
                      <Cell key={i} fill={TYPE_COLORS[i % TYPE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: "#181a2a",
                      border: "1px solid rgba(255,255,255,0.14)",
                      borderRadius: 8,
                      color: "#fff",
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="glass p-4"
          >
            <h3 className="text-sm font-semibold mb-3">Top 5 Projects by Hours</h3>
            <div className="space-y-2">
              {topProjects.length === 0 ? (
                <p className="text-sm text-muted">No hours logged yet.</p>
              ) : (
                topProjects.map((p, i) => (
                  <div key={p.name} className="flex items-center gap-2">
                    <span className="text-xs text-muted w-4 shrink-0">{i + 1}.</span>
                    <span className="text-sm truncate flex-1">{p.name}</span>
                    <span className="text-sm font-medium shrink-0">{p.hours.toFixed(1)}h</span>
                  </div>
                ))
              )}
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
