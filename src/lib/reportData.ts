import "server-only";
import { supabaseAdmin } from "./supabaseAdmin";
import { getAllProjects, getAllUsers, toProjectMap } from "./data";
import { CATEGORIES_FOR_GRID } from "./constants";
import { computeDailyOvertime, computeDailyRegular } from "./timesheetMath";
import type { Project, PublicUser, TimesheetEntry } from "./types";

export interface EmployeeGridRow {
  label: string;
  hoursByDate: Record<string, number>;
  total: number;
}

export interface EmployeeWeeklyGrid {
  employee: PublicUser;
  dates: string[]; // YYYY-MM-DD, Mon..Sun
  rows: EmployeeGridRow[];
  dailyTotals: Record<string, number>;
  dailyRegular: Record<string, number>;
  dailyOvertime: Record<string, number>;
  weekTotal: number;
  weekOvertime: number;
}

function weekDates(start: Date): string[] {
  const out: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

/** Monday..Sunday of the previous calendar week, relative to `today`. */
export function previousWeekRange(today: Date = new Date()): { start: Date; end: Date; dates: string[] } {
  const day = today.getUTCDay(); // 0=Sun..6=Sat
  const isoWeekday = day === 0 ? 7 : day; // 1=Mon..7=Sun
  const startOfThisWeek = new Date(today);
  startOfThisWeek.setUTCDate(today.getUTCDate() - (isoWeekday - 1));
  const startOfLastWeek = new Date(startOfThisWeek);
  startOfLastWeek.setUTCDate(startOfThisWeek.getUTCDate() - 7);
  const endOfLastWeek = new Date(startOfLastWeek);
  endOfLastWeek.setUTCDate(startOfLastWeek.getUTCDate() + 6);
  return { start: startOfLastWeek, end: endOfLastWeek, dates: weekDates(startOfLastWeek) };
}

export async function buildEmployeeWeeklyGrid(
  employee: PublicUser,
  dates: string[],
  projectMap: Record<string, Project>
): Promise<EmployeeWeeklyGrid> {
  const { data: entries, error } = await supabaseAdmin
    .from("timesheet_entries")
    .select("*")
    .eq("employee_id", employee.id)
    .gte("entry_date", dates[0])
    .lte("entry_date", dates[dates.length - 1]);
  if (error) throw error;

  const byDateRow: Record<string, Record<string, number>> = {};
  const projectIdsUsed = new Set<string>();
  for (const e of (entries ?? []) as TimesheetEntry[]) {
    const rowKey = e.project_id ? `p:${e.project_id}` : `c:${e.category}`;
    byDateRow[e.entry_date] ??= {};
    byDateRow[e.entry_date][rowKey] = (byDateRow[e.entry_date][rowKey] ?? 0) + Number(e.hours ?? 0);
    if (e.project_id) projectIdsUsed.add(e.project_id);
  }

  const rows: EmployeeGridRow[] = [];
  for (const pid of [...projectIdsUsed].sort()) {
    const p = projectMap[pid];
    const hoursByDate: Record<string, number> = {};
    let total = 0;
    for (const d of dates) {
      const h = byDateRow[d]?.[`p:${pid}`] ?? 0;
      hoursByDate[d] = h;
      total += h;
    }
    rows.push({ label: p ? p.name : "Unknown project", hoursByDate, total });
  }
  for (const cat of CATEGORIES_FOR_GRID) {
    const hoursByDate: Record<string, number> = {};
    let total = 0;
    for (const d of dates) {
      const h = byDateRow[d]?.[`c:${cat}`] ?? 0;
      hoursByDate[d] = h;
      total += h;
    }
    if (total > 0) rows.push({ label: cat, hoursByDate, total });
  }

  const dailyTotals: Record<string, number> = {};
  const dailyRegular: Record<string, number> = {};
  const dailyOvertime: Record<string, number> = {};
  let weekTotal = 0;
  let weekOvertime = 0;
  for (const d of dates) {
    const total = Object.values(byDateRow[d] ?? {}).reduce((s, v) => s + v, 0);
    dailyTotals[d] = total;
    dailyRegular[d] = computeDailyRegular(d, total);
    dailyOvertime[d] = computeDailyOvertime(d, total);
    weekTotal += total;
    weekOvertime += dailyOvertime[d];
  }

  return { employee, dates, rows, dailyTotals, dailyRegular, dailyOvertime, weekTotal, weekOvertime };
}

export interface OwnerReportData {
  start: Date;
  end: Date;
  dates: string[];
  billableHours: number;
  nonBillableHours: number;
  topProjects: { name: string; hours: number }[];
  // Per-employee billable/non-billable split — mirrors v1's "Billable vs
  // Non-Billable Hours per Employee" stacked bar chart.
  employeeBillableSplit: { name: string; billable: number; nonBillable: number }[];
  // Hours grouped by the structured comment-breakdown category (Geometry,
  // HVAC, etc.) — mirrors v1's "Energy Modeling Category Hours" pie chart.
  energyCategoryHours: { name: string; hours: number }[];
  compliantEmployees: string[];
  pendingSubmissions: { name: string; missingDays: string[] }[];
  redFlags: string[];
  employeeGrids: EmployeeWeeklyGrid[];
}

export async function buildOwnerReportData(today: Date = new Date()): Promise<OwnerReportData> {
  const { start, end, dates } = previousWeekRange(today);
  const projects = await getAllProjects();
  const projectMap = toProjectMap(projects);
  const users = await getAllUsers();
  const employees = users.filter((u) => u.role === "employee");

  const { data: weeklyEntries, error } = await supabaseAdmin
    .from("timesheet_entries")
    .select("*")
    .gte("entry_date", dates[0])
    .lte("entry_date", dates[dates.length - 1]);
  if (error) throw error;

  let billableHours = 0;
  let nonBillableHours = 0;
  const projectHours = new Map<string, number>();
  const empHours = new Map<string, number>();
  const empBillable = new Map<string, number>();
  const empNonBillable = new Map<string, number>();
  const energyCategoryTotals = new Map<string, number>();

  for (const e of (weeklyEntries ?? []) as TimesheetEntry[]) {
    const hours = Number(e.hours ?? 0);
    if (e.project_id) {
      billableHours += hours;
      const name = projectMap[e.project_id]?.name ?? "Unknown";
      projectHours.set(name, (projectHours.get(name) ?? 0) + hours);
      empBillable.set(e.employee_id, (empBillable.get(e.employee_id) ?? 0) + hours);
    } else {
      nonBillableHours += hours;
      empNonBillable.set(e.employee_id, (empNonBillable.get(e.employee_id) ?? 0) + hours);
    }
    empHours.set(e.employee_id, (empHours.get(e.employee_id) ?? 0) + hours);

    // Mirrors v1's energy_modeling_categories pie: pull per-category hours
    // out of a structured comment breakdown ({hours, category}[] JSON) —
    // the same breakdown the timesheet's comment modal writes. Entries
    // without a structured comment simply contribute nothing here, same
    // as v1 (it only has a category when a breakdown exists).
    const commentStr = (e.comment ?? "").trim();
    if (commentStr.startsWith("[")) {
      try {
        const parsed = JSON.parse(commentStr);
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            const category = item?.category;
            const itemHours = Number(item?.hours ?? 0);
            if (category && itemHours > 0) {
              energyCategoryTotals.set(category, (energyCategoryTotals.get(category) ?? 0) + itemHours);
            }
          }
        }
      } catch {
        // not a structured comment — ignore, matches v1's try/except
      }
    }
  }

  const topProjects = [...projectHours.entries()]
    .map(([name, hours]) => ({ name, hours }))
    .sort((a, b) => b.hours - a.hours)
    .slice(0, 5);

  const employeeBillableSplit = employees
    .map((emp) => ({
      name: emp.name,
      billable: empBillable.get(emp.id) ?? 0,
      nonBillable: empNonBillable.get(emp.id) ?? 0,
    }))
    .filter((e) => e.billable > 0 || e.nonBillable > 0)
    .sort((a, b) => a.name.localeCompare(b.name));

  const energyCategoryHours = [...energyCategoryTotals.entries()]
    .map(([name, hours]) => ({ name, hours }))
    .sort((a, b) => b.hours - a.hours);

  const weekdays = dates.slice(0, 5); // Mon..Fri
  const { data: submittedDocs, error: subErr } = await supabaseAdmin
    .from("submitted_days")
    .select("employee_id, entry_date")
    .gte("entry_date", dates[0])
    .lte("entry_date", dates[dates.length - 1]);
  if (subErr) throw subErr;

  const submittedByEmployee = new Map<string, Set<string>>();
  for (const s of submittedDocs ?? []) {
    if (!submittedByEmployee.has(s.employee_id)) submittedByEmployee.set(s.employee_id, new Set());
    submittedByEmployee.get(s.employee_id)!.add(s.entry_date);
  }

  const compliantEmployees: string[] = [];
  const pendingSubmissions: { name: string; missingDays: string[] }[] = [];
  const redFlags: string[] = [];

  for (const emp of employees) {
    const submittedDates = submittedByEmployee.get(emp.id) ?? new Set();
    const missing = weekdays.filter((d) => !submittedDates.has(d));
    if (missing.length === 0) {
      compliantEmployees.push(emp.name);
    } else {
      pendingSubmissions.push({
        name: emp.name,
        missingDays: missing.map((d) => new Date(d + "T00:00:00Z").toLocaleDateString("en-US", { weekday: "short" })),
      });
    }

    const totalEmpHours = empHours.get(emp.id) ?? 0;
    if (totalEmpHours > 60) redFlags.push(`High Overtime: ${emp.name} logged ${totalEmpHours.toFixed(1)} hours.`);
    if (totalEmpHours > 0 && totalEmpHours < 15) redFlags.push(`Low Logging: ${emp.name} logged only ${totalEmpHours.toFixed(1)} hours.`);
  }

  const employeeGrids: EmployeeWeeklyGrid[] = [];
  for (const emp of [...employees].sort((a, b) => a.name.localeCompare(b.name))) {
    employeeGrids.push(await buildEmployeeWeeklyGrid(emp, dates, projectMap));
  }

  return {
    start,
    end,
    dates,
    billableHours,
    nonBillableHours,
    topProjects,
    employeeBillableSplit,
    energyCategoryHours,
    compliantEmployees,
    pendingSubmissions,
    redFlags,
    employeeGrids,
  };
}
