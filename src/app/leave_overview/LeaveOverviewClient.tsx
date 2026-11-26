"use client";

import { useMemo, useState } from "react";
import { FaCalendarAlt, FaUmbrellaBeach, FaThermometerHalf } from "react-icons/fa";
import Select from "@/components/Select";
import { DEFAULT_ANNUAL_LEAVE_DAYS, DEFAULT_SICK_LEAVE_DAYS } from "@/lib/leavePolicy";
import type { LeaveRequest, PublicUser, LeaveBalance } from "@/lib/types";

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

type Tab = "annual" | "sick";

export default function LeaveOverviewClient({
  allUsers,
  allRequests,
  leaveBalances,
}: {
  allUsers: PublicUser[];
  allRequests: LeaveRequest[];
  leaveBalances: Record<string, LeaveBalance>;
}) {
  const [tab, setTab] = useState<Tab>("annual");
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const yearOptions = Array.from({ length: 11 }, (_, i) => currentYear - 5 + i);

  // One row per employee: 12 month totals for the selected leave type +
  // year, plus a Total column. Abeer, 2026-11-27: "not showing proper
  // total... check both annual and sick the total count and outof count"
  // — this used to show the employee's CURRENT financial-year balance
  // usage instead, which (being Apr-Mar, not Jan-Dec) never lined up with
  // the 12 months actually displayed and looked plain wrong (e.g. a month
  // with "3" in it but "0/8" in Total). Total is now just the sum of the
  // 12 months in this exact row, so it always reconciles with what's on
  // screen. The "/total" denominator is still the employee's assigned (or
  // default) annual/sick allocation, for the same at-a-glance "used of
  // how many" read as the main Leave page's insight table.
  const rows = useMemo(() => {
    return allUsers.map((u) => {
      const months = MONTH_LABELS.map((_, monthIndex) => {
        const prefix = `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
        let total = 0;
        for (const r of allRequests) {
          if (r.employee_id !== u.id || r.status !== "approved" || r.leave_type !== tab) continue;
          if (!r.start_date.startsWith(prefix)) continue;
          total += r.days_count;
        }
        return total;
      });

      const used = months.reduce((sum, m) => sum + m, 0);
      const bal = leaveBalances[u.id];
      const total = bal ? (tab === "annual" ? bal.annual_total : bal.sick_total) : tab === "annual" ? DEFAULT_ANNUAL_LEAVE_DAYS : DEFAULT_SICK_LEAVE_DAYS;

      return { user: u, months, used, total };
    });
  }, [allUsers, allRequests, leaveBalances, tab, year]);

  return (
    <div className="w-full">
      <h1 className="text-xl font-semibold mb-1 flex items-center gap-2">
        <FaCalendarAlt className="text-accent" /> Leaves View
      </h1>
      <p className="text-sm text-muted mb-4">
        Every employee&apos;s leave usage, month by month, for the selected year. Total is the sum
        of the 12 months in this row, out of their assigned annual/sick allocation.
      </p>

      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center rounded-lg border border-gray-200 overflow-hidden text-sm font-medium">
          <button
            onClick={() => setTab("annual")}
            className={`inline-flex items-center gap-2 px-4 py-2 transition-colors ${
              tab === "annual" ? "bg-accent text-white" : "hover:bg-gray-50 text-muted"
            }`}
          >
            <FaUmbrellaBeach className="h-3.5 w-3.5" /> Annual Leave
          </button>
          <button
            onClick={() => setTab("sick")}
            className={`inline-flex items-center gap-2 px-4 py-2 transition-colors ${
              tab === "sick" ? "bg-accent text-white" : "hover:bg-gray-50 text-muted"
            }`}
          >
            <FaThermometerHalf className="h-3.5 w-3.5" /> Sick Leave
          </button>
        </div>
        {/* Abeer, 2026-11-27: "fix this react dropdown for accountant year
            selection" — same fix as LeaveCalendar.tsx's Month/Year jump:
            the app's own custom Select component, not a native <select>. */}
        <Select
          value={String(year)}
          onChange={(v) => setYear(Number(v))}
          options={yearOptions.map((y) => ({ value: String(y), label: String(y) }))}
          className="w-24"
        />
      </div>

      <div className="glass !p-0 overflow-hidden">
        <div className="overflow-x-auto scrollbar-x-thin">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-2.5 sticky left-0 bg-gray-50 z-10">Employee</th>
                {MONTH_LABELS.map((m) => (
                  <th key={m} className="px-3 py-2.5 text-center">
                    {m}
                  </th>
                ))}
                <th className="px-4 py-2.5 text-center">Total (used/total)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map(({ user, months, used, total }) => (
                <tr key={user.id}>
                  <td className="px-4 py-2.5 font-medium whitespace-nowrap sticky left-0 bg-white z-10">{user.name}</td>
                  {months.map((v, i) => (
                    <td key={i} className="px-3 py-2.5 text-center text-muted">
                      {v > 0 ? v : <span className="text-gray-300">–</span>}
                    </td>
                  ))}
                  <td className="px-4 py-2.5 text-center font-medium">
                    <span className={used > total ? "font-semibold text-red-600" : ""}>{used}</span>
                    <span className="text-muted">/{total}</span>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={14} className="px-4 py-10 text-center text-muted">
                    No employees found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
