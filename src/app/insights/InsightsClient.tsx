"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { FaChartPie } from "react-icons/fa";
import Select from "@/components/Select";
import DateRangePicker from "@/components/DateRangePicker";
import type { DateRange } from "@/lib/dateRange";

const PALETTE = [
  "#8b5cf6",
  "#22d3ee",
  "#f472b6",
  "#facc15",
  "#4ade80",
  "#fb923c",
  "#60a5fa",
  "#c084fc",
  "#34d399",
  "#f87171",
];

type Tab =
  | "hours_per_project"
  | "hours_per_employee"
  | "energy_modeling_hours"
  | "billable_split"
  | "monthly_trend"
  | "project_status";

const STATUS_COLORS: Record<string, string> = {
  active: "#22c55e",
  completed: "#0ea5e9",
  "re-work": "#f59e0b",
  archived: "#94a3b8",
};

export default function InsightsClient({
  projectData,
  employeeData,
  energyCategoryData,
  billableData,
  monthlyTrend,
  statusData,
  employees,
  projects,
  selectedEmployee,
  selectedProject,
  dateRange,
}: {
  projectData: { name: string; hours: number }[];
  employeeData: { name: string; hours: number }[];
  energyCategoryData: { name: string; hours: number }[];
  billableData: { name: string; hours: number }[];
  monthlyTrend: { name: string; hours: number }[];
  statusData: { name: string; hours: number }[];
  employees: { id: string; name: string }[];
  projects: { id: string; name: string }[];
  selectedEmployee: string;
  selectedProject: string;
  dateRange: DateRange;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<Tab>("hours_per_project");

  function updateEnergyFilter(next: { employee_filter?: string; project_filter?: string }) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("graph", "energy_modeling_hours");
    params.set("employee_filter", next.employee_filter ?? selectedEmployee);
    params.set("project_filter", next.project_filter ?? selectedProject);
    router.push(`/insights?${params.toString()}`);
    router.refresh();
  }

  return (
    <div className="w-full">
      <div className="mb-6 flex flex-col gap-4 border-b border-gray-200 pb-4 lg:flex-row lg:items-center lg:justify-between">
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <FaChartPie className="text-accent" /> Insights &amp; Visualizations
        </h1>
        <DateRangePicker from={dateRange.from} to={dateRange.to} preset={dateRange.preset} />
      </div>

      <div className="glass p-1.5 inline-flex flex-wrap gap-1 mb-6">
        {(
          [
            ["hours_per_project", "Hours per Project"],
            ["hours_per_employee", "Hours per Employee"],
            ["energy_modeling_hours", "Energy Modeling Category Hours"],
            ["billable_split", "Billable vs Non-Billable"],
            ["monthly_trend", "Hours Trend"],
            ["project_status", "Project Status Breakdown"],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`relative px-4 py-2 text-sm rounded-lg ${
              tab === key ? "text-white" : "text-muted hover:text-foreground"
            }`}
          >
            {tab === key && (
              <motion.span
                layoutId="insights-pill"
                className="absolute inset-0 rounded-lg"
                style={{ background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)" }}
              />
            )}
            <span className="relative z-10">{label}</span>
          </button>
        ))}
      </div>

      {tab === "energy_modeling_hours" && (
        <div className="glass p-4 mb-6 flex flex-wrap gap-3 items-end">
          <div className="w-48">
            <label className="text-xs text-muted block mb-1">Employee</label>
            <Select
              value={selectedEmployee}
              onChange={(value) => updateEnergyFilter({ employee_filter: value })}
              options={[{ value: "all", label: "All Employees" }, ...employees.map((e) => ({ value: e.id, label: e.name }))]}
            />
          </div>
          <div className="w-48">
            <label className="text-xs text-muted block mb-1">Project</label>
            <Select
              value={selectedProject}
              onChange={(value) => updateEnergyFilter({ project_filter: value })}
              options={[{ value: "all", label: "All Projects" }, ...projects.map((p) => ({ value: p.id, label: p.name }))]}
            />
          </div>
        </div>
      )}

      <motion.div
        key={tab}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="glass p-4"
      >
        {tab === "hours_per_project" ? (
          <div style={{ width: "100%", height: 480 }}>
            <ResponsiveContainer>
              <BarChart data={projectData} margin={{ top: 8, right: 16, left: 0, bottom: 90 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.08)" />
                <XAxis
                  dataKey="name"
                  angle={-45}
                  textAnchor="end"
                  interval={0}
                  height={100}
                  tick={{ fill: "#6c757d", fontSize: 11 }}
                />
                <YAxis tick={{ fill: "#6c757d", fontSize: 11 }} />
                <Tooltip
                  contentStyle={{
                    background: "#ffffff",
                    border: "1px solid rgba(0,0,0,0.1)",
                    borderRadius: 8,
                    color: "#212529",
                  }}
                />
                <Bar dataKey="hours" fill="#8b5cf6" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : tab === "hours_per_employee" ? (
          <div style={{ width: "100%", height: 480 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={employeeData}
                  dataKey="hours"
                  nameKey="name"
                  innerRadius={80}
                  outerRadius={160}
                  paddingAngle={2}
                >
                  {employeeData.map((_, i) => (
                    <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
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
                <Legend wrapperStyle={{ color: "#6c757d", fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        ) : energyCategoryData.length > 0 ? (
          <div style={{ width: "100%", height: 480 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={energyCategoryData}
                  dataKey="hours"
                  nameKey="name"
                  innerRadius={80}
                  outerRadius={160}
                  paddingAngle={2}
                >
                  {energyCategoryData.map((_, i) => (
                    <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
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
                <Legend wrapperStyle={{ color: "#6c757d", fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        ) : tab === "billable_split" ? (
          <div style={{ width: "100%", height: 480 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={billableData}
                  dataKey="hours"
                  nameKey="name"
                  innerRadius={80}
                  outerRadius={160}
                  paddingAngle={2}
                >
                  {billableData.map((_, i) => (
                    <Cell key={i} fill={["#667eea", "#f59e0b"][i % 2]} />
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
                <Legend wrapperStyle={{ color: "#6c757d", fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        ) : tab === "monthly_trend" ? (
          <div style={{ width: "100%", height: 480 }}>
            <ResponsiveContainer>
              <LineChart data={monthlyTrend} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.08)" />
                <XAxis dataKey="name" tick={{ fill: "#6c757d", fontSize: 11 }} />
                <YAxis tick={{ fill: "#6c757d", fontSize: 11 }} />
                <Tooltip
                  contentStyle={{
                    background: "#ffffff",
                    border: "1px solid rgba(0,0,0,0.1)",
                    borderRadius: 8,
                    color: "#212529",
                  }}
                />
                <Line type="monotone" dataKey="hours" stroke="#8b5cf6" strokeWidth={2.5} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : tab === "project_status" ? (
          <div style={{ width: "100%", height: 480 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={statusData}
                  dataKey="hours"
                  nameKey="name"
                  innerRadius={80}
                  outerRadius={160}
                  paddingAngle={2}
                >
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
                <Legend wrapperStyle={{ color: "#6c757d", fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="text-center text-muted py-16">
            No data available for the selected filters. Hours logged with a
            category breakdown (via the timesheet&apos;s comment modal) will
            appear here.
          </p>
        )}
      </motion.div>
    </div>
  );
}
