"use client";

import { useCallback, useMemo, useState } from "react";
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
import { FaChartPie, FaUndo } from "react-icons/fa";
import Select from "@/components/Select";
import CompactDateRange from "./CompactDateRange";
import { getPresetDateRange, getDateBuckets, type DateRange } from "@/lib/dateRange";
import { SPECIAL_CATEGORIES } from "@/lib/constants";
import { TASK_NAME_TO_BUCKET } from "@/lib/taxonomy";
import type { Project } from "@/lib/types";

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

const STATUS_COLORS: Record<string, string> = {
  active: "#22c55e",
  completed: "#0ea5e9",
  "re-work": "#f59e0b",
  archived: "#94a3b8",
};

const PROJECT_TYPE_COLORS: Record<string, string> = {
  "Energy Modelling": "#8b5cf6",
  "BIM and AutoCad": "#14b8a6",
};

// Mirrors v1's energy_categories list, extended for v3.0: every category
// name in the shared TASK_NAME_TO_BUCKET map (both the original flat
// names like "BIM-CAD" and the per-scope task names that replaced them,
// e.g. "CAD drafting") plus "Other", so this chart keeps working for old
// AND new timesheet entries without drifting out of sync with the
// taxonomy elsewhere (see lib/taxonomy.ts).
const ENERGY_CATEGORIES = [...Object.keys(TASK_NAME_TO_BUCKET), "Other"];

interface RawEntry {
  project_id: string | null;
  category: string | null;
  employee_id: string;
  hours: number;
  comment: string | null;
  entry_date: string;
}

interface Point {
  name: string;
  hours: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function sumHours(points: Point[]): number {
  return round2(points.reduce((s, p) => s + p.hours, 0));
}

function buildHoursByProject(entries: RawEntry[], projectById: Map<string, Project>): Point[] {
  const totals = new Map<string, number>();
  for (const e of entries) {
    if (!e.project_id) continue; // matches v1: only real-project rows count here
    const name = projectById.get(e.project_id)?.name ?? "Unknown Project";
    totals.set(name, (totals.get(name) ?? 0) + Number(e.hours ?? 0));
  }
  return [...totals.entries()]
    .map(([name, hours]) => ({ name, hours: round2(hours) }))
    .sort((a, b) => b.hours - a.hours)
    .slice(0, 25);
}

function buildHoursByEmployee(entries: RawEntry[], employeeNameById: Map<string, string>): Point[] {
  const totals = new Map<string, number>();
  for (const e of entries) {
    // No project filter here, matching v1: every entry counts, project or category alike.
    const name = employeeNameById.get(e.employee_id) ?? e.employee_id;
    totals.set(name, (totals.get(name) ?? 0) + Number(e.hours ?? 0));
  }
  return [...totals.entries()]
    .map(([name, hours]) => ({ name, hours: round2(hours) }))
    .sort((a, b) => b.hours - a.hours);
}

function buildHoursByClient(entries: RawEntry[], projectById: Map<string, Project>): Point[] {
  const totals = new Map<string, number>();
  for (const e of entries) {
    if (!e.project_id) continue;
    const client = projectById.get(e.project_id)?.client_name ?? "Unknown";
    totals.set(client, (totals.get(client) ?? 0) + Number(e.hours ?? 0));
  }
  return [...totals.entries()]
    .map(([name, hours]) => ({ name, hours: round2(hours) }))
    .sort((a, b) => b.hours - a.hours);
}

function buildProjectTypeSplit(entries: RawEntry[], projectById: Map<string, Project>): Point[] {
  const totals = new Map<string, number>([
    ["Energy Modelling", 0],
    ["BIM and AutoCad", 0],
  ]);
  for (const e of entries) {
    if (!e.project_id) continue;
    const type = projectById.get(e.project_id)?.project_type ?? "Energy Modelling";
    totals.set(type, (totals.get(type) ?? 0) + Number(e.hours ?? 0));
  }
  return [...totals.entries()]
    .map(([name, hours]) => ({ name, hours: round2(hours) }))
    .filter((d) => d.hours > 0);
}

function buildEnergyCategoryBreakdown(entries: RawEntry[]): Point[] {
  const totals = new Map<string, number>();
  for (const e of entries) {
    const commentStr = (e.comment ?? "").trim();
    if (!commentStr.startsWith("[")) continue;
    try {
      const parsed = JSON.parse(commentStr);
      if (!Array.isArray(parsed)) continue;
      for (const item of parsed) {
        const category = item?.category ?? "Uncategorized";
        const hours = Number(item?.hours ?? 0);
        if (ENERGY_CATEGORIES.includes(category)) {
          totals.set(category, (totals.get(category) ?? 0) + hours);
        }
      }
    } catch {
      // not a structured comment — no category breakdown to extract
    }
  }
  return [...totals.entries()]
    .map(([name, hours]) => ({ name, hours: round2(hours) }))
    .sort((a, b) => b.hours - a.hours);
}

function buildLeaveBreakdown(entries: RawEntry[]): Point[] {
  const totals = new Map<string, number>();
  for (const e of entries) {
    if (e.project_id) continue; // leave/category rows only
    if (!e.category || !(SPECIAL_CATEGORIES as readonly string[]).includes(e.category)) continue;
    totals.set(e.category, (totals.get(e.category) ?? 0) + Number(e.hours ?? 0));
  }
  return [...totals.entries()]
    .map(([name, hours]) => ({ name, hours: round2(hours) }))
    .sort((a, b) => b.hours - a.hours);
}

function buildBillableSplit(entries: RawEntry[]): Point[] {
  let billable = 0;
  let nonBillable = 0;
  for (const e of entries) {
    const hours = Number(e.hours ?? 0);
    if (e.project_id) billable += hours;
    else nonBillable += hours;
  }
  return [
    { name: "Billable", hours: round2(billable) },
    { name: "Non-Billable", hours: round2(nonBillable) },
  ];
}

function buildTrend(entries: RawEntry[], range: DateRange): Point[] {
  return getDateBuckets(range.from, range.to).map((bucket) => {
    let hours = 0;
    for (const e of entries) {
      if (e.entry_date < bucket.from || e.entry_date > bucket.to) continue;
      hours += Number(e.hours ?? 0);
    }
    return { name: bucket.label, hours: round2(hours) };
  });
}

function buildProjectStatus(projects: Project[], projectId: string, clientName: string): Point[] {
  const totals = new Map<string, number>();
  for (const p of projects) {
    if (projectId !== "all" && p.id !== projectId) continue;
    if (clientName !== "all" && p.client_name !== clientName) continue;
    totals.set(p.status, (totals.get(p.status) ?? 0) + 1);
  }
  return [...totals.entries()].map(([name, value]) => ({ name, hours: value }));
}

type CardId = "project" | "employee" | "client" | "type" | "energy" | "leave" | "billable" | "trend";

function ChartCard({
  title,
  caption,
  range,
  onRangeChange,
  onReset,
  overridden,
  note,
  height = 320,
  children,
}: {
  title: string;
  caption?: string;
  range?: DateRange;
  onRangeChange?: (next: DateRange) => void;
  onReset?: () => void;
  overridden?: boolean;
  note?: string;
  height?: number;
  children: React.ReactNode;
}) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass p-4 flex flex-col">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold text-sm">{title}</h3>
          {caption && <p className="text-xs text-muted mt-0.5">{caption}</p>}
        </div>
        {range && onRangeChange && (
          <div className="flex items-center gap-1.5">
            <CompactDateRange value={range} onChange={onRangeChange} />
            {overridden && onReset && (
              <button
                type="button"
                onClick={onReset}
                title="Reset to the global date range"
                className="shrink-0 rounded-md p-1.5 text-muted hover:bg-gray-100 hover:text-accent"
              >
                <FaUndo className="h-3 w-3" />
              </button>
            )}
          </div>
        )}
      </div>
      {note && <p className="mb-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">{note}</p>}
      <div style={{ width: "100%", height }}>{children}</div>
    </motion.div>
  );
}

export default function InsightsClient({
  entries,
  projects,
  employees,
}: {
  entries: RawEntry[];
  projects: Project[];
  employees: { id: string; name: string }[];
}) {
  const projectById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  const employeeNameById = useMemo(() => new Map(employees.map((e) => [e.id, e.name])), [employees]);
  const clients = useMemo(
    () => [...new Set(projects.map((p) => p.client_name))].sort((a, b) => a.localeCompare(b)),
    [projects]
  );

  const [employeeId, setEmployeeId] = useState("all");
  const [projectId, setProjectId] = useState("all");
  const [clientName, setClientName] = useState("all");
  const [globalRange, setGlobalRange] = useState<DateRange>(() => getPresetDateRange("3m"));
  const [overrides, setOverrides] = useState<Partial<Record<CardId, DateRange>>>({});

  const scopeFiltersActive = projectId !== "all" || clientName !== "all";

  const filterByRange = useCallback(
    (range: DateRange) =>
      entries.filter((e) => {
        if (e.entry_date < range.from || e.entry_date > range.to) return false;
        if (employeeId !== "all" && e.employee_id !== employeeId) return false;
        if (projectId !== "all" && e.project_id !== projectId) return false;
        if (clientName !== "all") {
          if (!e.project_id) return false;
          if (projectById.get(e.project_id)?.client_name !== clientName) return false;
        }
        return true;
      }),
    [entries, employeeId, projectId, clientName, projectById]
  );

  const rangeFor = useCallback(
    (card: CardId): DateRange => overrides[card] ?? globalRange,
    [overrides, globalRange]
  );
  function setRangeFor(card: CardId, next: DateRange) {
    setOverrides((prev) => ({ ...prev, [card]: next }));
  }
  function resetRange(card: CardId) {
    setOverrides((prev) => {
      const next = { ...prev };
      delete next[card];
      return next;
    });
  }

  const projectEntries = useMemo(() => filterByRange(rangeFor("project")), [filterByRange, rangeFor]);
  const employeeEntries = useMemo(() => filterByRange(rangeFor("employee")), [filterByRange, rangeFor]);
  const clientEntries = useMemo(() => filterByRange(rangeFor("client")), [filterByRange, rangeFor]);
  const typeEntries = useMemo(() => filterByRange(rangeFor("type")), [filterByRange, rangeFor]);
  const energyEntries = useMemo(() => filterByRange(rangeFor("energy")), [filterByRange, rangeFor]);
  const leaveEntries = useMemo(() => filterByRange(rangeFor("leave")), [filterByRange, rangeFor]);
  const billableEntries = useMemo(() => filterByRange(rangeFor("billable")), [filterByRange, rangeFor]);
  const trendEntries = useMemo(() => filterByRange(rangeFor("trend")), [filterByRange, rangeFor]);

  const projectData = useMemo(() => buildHoursByProject(projectEntries, projectById), [projectEntries, projectById]);
  const employeeData = useMemo(() => buildHoursByEmployee(employeeEntries, employeeNameById), [employeeEntries, employeeNameById]);
  const clientData = useMemo(() => buildHoursByClient(clientEntries, projectById), [clientEntries, projectById]);
  const typeData = useMemo(() => buildProjectTypeSplit(typeEntries, projectById), [typeEntries, projectById]);
  const energyData = useMemo(() => buildEnergyCategoryBreakdown(energyEntries), [energyEntries]);
  const leaveData = useMemo(() => buildLeaveBreakdown(leaveEntries), [leaveEntries]);
  const billableData = useMemo(() => buildBillableSplit(billableEntries), [billableEntries]);
  const trendData = useMemo(() => buildTrend(trendEntries, rangeFor("trend")), [trendEntries, rangeFor]);
  const statusData = useMemo(() => buildProjectStatus(projects, projectId, clientName), [projects, projectId, clientName]);

  const tooltipStyleLight = {
    background: "#ffffff",
    border: "1px solid rgba(0,0,0,0.1)",
    borderRadius: 8,
    color: "#212529",
  };
  const tooltipStyleDark = {
    background: "#181a2a",
    border: "1px solid rgba(255,255,255,0.14)",
    borderRadius: 8,
    color: "#fff",
  };

  return (
    <div className="w-full">
      <div className="mb-6 flex flex-col gap-4 border-b border-gray-200 pb-4">
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <FaChartPie className="text-accent" /> Insights &amp; Visualizations
        </h1>

        <div className="glass p-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:flex-wrap">
          <div className="w-full sm:w-52">
            <label className="text-xs text-muted block mb-1">Employee</label>
            <Select
              value={employeeId}
              onChange={setEmployeeId}
              options={[{ value: "all", label: "All Employees" }, ...employees.map((e) => ({ value: e.id, label: e.name }))]}
            />
          </div>
          <div className="w-full sm:w-52">
            <label className="text-xs text-muted block mb-1">Project</label>
            <Select
              value={projectId}
              onChange={setProjectId}
              options={[{ value: "all", label: "All Projects" }, ...projects.map((p) => ({ value: p.id, label: p.name }))]}
            />
          </div>
          <div className="w-full sm:w-44">
            <label className="text-xs text-muted block mb-1">Client</label>
            <Select
              value={clientName}
              onChange={setClientName}
              options={[{ value: "all", label: "All Clients" }, ...clients.map((c) => ({ value: c, label: c }))]}
            />
          </div>
          <div className="w-full sm:w-auto">
            <label className="text-xs text-muted block mb-1">Default date range (each chart below can override this)</label>
            <CompactDateRange value={globalRange} onChange={setGlobalRange} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard
          title="Hours per Project"
          caption={`${sumHours(projectData)}h across ${projectData.length} project${projectData.length === 1 ? "" : "s"} (top 25)`}
          range={rangeFor("project")}
          onRangeChange={(r) => setRangeFor("project", r)}
          onReset={() => resetRange("project")}
          overridden={!!overrides.project}
        >
          {projectData.length > 0 ? (
            <ResponsiveContainer>
              <BarChart data={projectData} margin={{ top: 8, right: 16, left: 0, bottom: 90 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.08)" />
                <XAxis dataKey="name" angle={-45} textAnchor="end" interval={0} height={100} tick={{ fill: "#6c757d", fontSize: 10 }} />
                <YAxis tick={{ fill: "#6c757d", fontSize: 11 }} />
                <Tooltip contentStyle={tooltipStyleLight} />
                <Bar dataKey="hours" fill="#8b5cf6" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState />
          )}
        </ChartCard>

        <ChartCard
          title="Hours per Employee"
          caption={`${sumHours(employeeData)}h across ${employeeData.length} employee${employeeData.length === 1 ? "" : "s"}`}
          range={rangeFor("employee")}
          onRangeChange={(r) => setRangeFor("employee", r)}
          onReset={() => resetRange("employee")}
          overridden={!!overrides.employee}
        >
          {employeeData.length > 0 ? (
            <ResponsiveContainer>
              <PieChart>
                <Pie data={employeeData} dataKey="hours" nameKey="name" innerRadius={60} outerRadius={110} paddingAngle={2}>
                  {employeeData.map((_, i) => (
                    <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyleDark} />
                <Legend wrapperStyle={{ color: "#6c757d", fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState />
          )}
        </ChartCard>

        <ChartCard
          title="Hours per Client"
          caption={`${sumHours(clientData)}h across ${clientData.length} client${clientData.length === 1 ? "" : "s"}`}
          range={rangeFor("client")}
          onRangeChange={(r) => setRangeFor("client", r)}
          onReset={() => resetRange("client")}
          overridden={!!overrides.client}
        >
          {clientData.length > 0 ? (
            <ResponsiveContainer>
              <BarChart data={clientData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.08)" />
                <XAxis dataKey="name" tick={{ fill: "#6c757d", fontSize: 11 }} />
                <YAxis tick={{ fill: "#6c757d", fontSize: 11 }} />
                <Tooltip contentStyle={tooltipStyleLight} />
                <Bar dataKey="hours" fill="#22d3ee" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState />
          )}
        </ChartCard>

        <ChartCard
          title="Energy Modelling vs BIM and AutoCad"
          caption={`${sumHours(typeData)}h logged against real projects`}
          range={rangeFor("type")}
          onRangeChange={(r) => setRangeFor("type", r)}
          onReset={() => resetRange("type")}
          overridden={!!overrides.type}
        >
          {typeData.length > 0 ? (
            <ResponsiveContainer>
              <PieChart>
                <Pie data={typeData} dataKey="hours" nameKey="name" innerRadius={60} outerRadius={110} paddingAngle={2}>
                  {typeData.map((d) => (
                    <Cell key={d.name} fill={PROJECT_TYPE_COLORS[d.name] ?? "#ccc"} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyleDark} />
                <Legend wrapperStyle={{ color: "#6c757d", fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState />
          )}
        </ChartCard>

        <ChartCard
          title="Energy Modeling Category Hours"
          caption="From the timesheet's per-category comment breakdown"
          range={rangeFor("energy")}
          onRangeChange={(r) => setRangeFor("energy", r)}
          onReset={() => resetRange("energy")}
          overridden={!!overrides.energy}
        >
          {energyData.length > 0 ? (
            <ResponsiveContainer>
              <PieChart>
                <Pie data={energyData} dataKey="hours" nameKey="name" innerRadius={60} outerRadius={110} paddingAngle={2}>
                  {energyData.map((_, i) => (
                    <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyleDark} />
                <Legend wrapperStyle={{ color: "#6c757d", fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState text="No category-tagged hours for this selection. Hours logged with a category breakdown (via the timesheet's comment modal) will appear here." />
          )}
        </ChartCard>

        <ChartCard
          title="Leave &amp; Category Hours"
          caption="Statutory holiday, Vacation, PTO, Sicktime, etc."
          range={rangeFor("leave")}
          onRangeChange={(r) => setRangeFor("leave", r)}
          onReset={() => resetRange("leave")}
          overridden={!!overrides.leave}
          note={scopeFiltersActive ? "Leave categories aren't tied to a project or client — clear those filters to see this breakdown." : undefined}
        >
          {leaveData.length > 0 ? (
            <ResponsiveContainer>
              <BarChart data={leaveData} margin={{ top: 8, right: 16, left: 0, bottom: 60 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.08)" />
                <XAxis dataKey="name" angle={-30} textAnchor="end" interval={0} height={70} tick={{ fill: "#6c757d", fontSize: 10 }} />
                <YAxis tick={{ fill: "#6c757d", fontSize: 11 }} />
                <Tooltip contentStyle={tooltipStyleLight} />
                <Bar dataKey="hours" fill="#f59e0b" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState />
          )}
        </ChartCard>

        <ChartCard
          title="Billable vs Non-Billable"
          caption={`${sumHours(billableData)}h total`}
          range={rangeFor("billable")}
          onRangeChange={(r) => setRangeFor("billable", r)}
          onReset={() => resetRange("billable")}
          overridden={!!overrides.billable}
        >
          <ResponsiveContainer>
            <PieChart>
              <Pie data={billableData} dataKey="hours" nameKey="name" innerRadius={60} outerRadius={110} paddingAngle={2}>
                {billableData.map((_, i) => (
                  <Cell key={i} fill={["#667eea", "#f59e0b"][i % 2]} />
                ))}
              </Pie>
              <Tooltip contentStyle={tooltipStyleDark} />
              <Legend wrapperStyle={{ color: "#6c757d", fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Hours Trend"
          caption="Daily for ranges up to 31 days, weekly beyond that"
          range={rangeFor("trend")}
          onRangeChange={(r) => setRangeFor("trend", r)}
          onReset={() => resetRange("trend")}
          overridden={!!overrides.trend}
        >
          <ResponsiveContainer>
            <LineChart data={trendData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.08)" />
              <XAxis dataKey="name" tick={{ fill: "#6c757d", fontSize: 11 }} />
              <YAxis tick={{ fill: "#6c757d", fontSize: 11 }} />
              <Tooltip contentStyle={tooltipStyleLight} />
              <Line type="monotone" dataKey="hours" stroke="#8b5cf6" strokeWidth={2.5} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Project Status Breakdown"
          caption="Reflects current project data — not scoped to a date range"
        >
          <ResponsiveContainer>
            <PieChart>
              <Pie data={statusData} dataKey="hours" nameKey="name" innerRadius={60} outerRadius={110} paddingAngle={2}>
                {statusData.map((d) => (
                  <Cell key={d.name} fill={STATUS_COLORS[d.name] ?? "#ccc"} />
                ))}
              </Pie>
              <Tooltip contentStyle={tooltipStyleDark} />
              <Legend wrapperStyle={{ color: "#6c757d", fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
}

function EmptyState({ text = "No data available for the selected filters." }: { text?: string }) {
  return <p className="flex h-full items-center justify-center text-center text-sm text-muted px-6">{text}</p>;
}
