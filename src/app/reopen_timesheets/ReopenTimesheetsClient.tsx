"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { FaUndo, FaLockOpen, FaClipboardList, FaCalendarAlt, FaArrowLeft } from "react-icons/fa";
import Pagination from "@/components/Pagination";
import { reopenDayAction } from "@/app/(actions)/timesheetActions";
import { toast } from "@/lib/toast";
import { PAGE_SIZE } from "@/lib/constants";
import { MONTH_NAMES } from "@/lib/dateUtils";

interface Submission {
  employeeId: string;
  employeeName: string;
  date: string;
  totalHours: number;
  submittedAt: string;
}

interface MonthCount {
  monthYear: string; // "YYYY-MM"
  count: number;
}

function formatMonthYear(monthYear: string): string {
  const [y, m] = monthYear.split("-").map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

export default function ReopenTimesheetsClient(
  props:
    | { selectedMonth: null; monthCounts: MonthCount[] }
    | {
        selectedMonth: string;
        submissions: Submission[];
        page: number;
        totalPages: number;
        totalItems: number;
      }
) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function goToMonth(monthYear: string) {
    router.push(`/reopen_timesheets?month=${monthYear}`, { scroll: false });
  }

  function backToMonths() {
    router.push("/reopen_timesheets", { scroll: false });
  }

  function goToPage(nextPage: number, monthYear: string) {
    router.push(`/reopen_timesheets?month=${monthYear}&page=${nextPage}`, { scroll: false });
    router.refresh();
  }

  function handleReopen(employeeId: string, employeeName: string, dateStr: string) {
    startTransition(async () => {
      try {
        await reopenDayAction(employeeId, dateStr);
        toast.success(`${employeeName}'s ${dateStr} reopened for editing.`);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not reopen this day.");
      }
    });
  }

  const header = (
    <div className="mb-6 flex items-center gap-3 border-b border-gray-200 pb-4">
      <FaLockOpen className="h-5 w-5 text-accent" />
      <div>
        <h1 className="text-2xl font-semibold">Reopen Timesheets</h1>
        <p className="text-sm text-muted">
          {props.selectedMonth
            ? "Submitted days for this month — unlock one so it can be edited again."
            : "Pick a month to see its submitted timesheets."}
        </p>
      </div>
    </div>
  );

  if (props.selectedMonth === null) {
    const { monthCounts } = props;
    return (
      <div className="w-full">
        {header}
        {monthCounts.length === 0 ? (
          <div className="glass p-10 text-center text-muted">
            <FaClipboardList className="mx-auto mb-3 h-8 w-8 text-gray-300" />
            <p>No submitted timesheets yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {monthCounts.map((m, i) => (
              <motion.button
                key={m.monthYear}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                onClick={() => goToMonth(m.monthYear)}
                className="glass flex items-center justify-between gap-3 p-4 text-left transition-colors hover:bg-accent/5"
              >
                <div className="flex items-center gap-3">
                  <FaCalendarAlt className="h-4 w-4 text-accent shrink-0" />
                  <span className="font-medium">{formatMonthYear(m.monthYear)}</span>
                </div>
                <span className="shrink-0 rounded-full bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent">
                  {m.count} submitted
                </span>
              </motion.button>
            ))}
          </div>
        )}
      </div>
    );
  }

  const { selectedMonth, submissions, page, totalPages, totalItems } = props;

  return (
    <div className="w-full">
      {header}
      <button
        onClick={backToMonths}
        className="mb-4 inline-flex items-center gap-2 text-sm text-accent hover:underline"
      >
        <FaArrowLeft className="h-3 w-3" /> Back to months
      </button>

      <div className="glass p-4">
        <h2 className="mb-3 font-semibold">{formatMonthYear(selectedMonth)}</h2>
        {submissions.length === 0 ? (
          <div className="py-10 text-center text-muted">
            <FaClipboardList className="mx-auto mb-3 h-8 w-8 text-gray-300" />
            <p>No submitted timesheets for this month.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs text-muted">
                  <th className="py-2 pr-4 font-medium">Employee</th>
                  <th className="py-2 pr-4 font-medium">Date</th>
                  <th className="py-2 pr-4 font-medium">Total Hours</th>
                  <th className="py-2 pr-4 font-medium">Submitted At</th>
                  <th className="py-2 pr-0 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {submissions.map((s, i) => (
                  <motion.tr
                    key={`${s.employeeId}-${s.date}`}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.02 }}
                    className="border-b border-gray-100 last:border-0"
                  >
                    <td className="py-2.5 pr-4 font-medium">{s.employeeName}</td>
                    <td className="py-2.5 pr-4 text-muted">{s.date}</td>
                    <td className="py-2.5 pr-4">{s.totalHours.toFixed(2)}h</td>
                    <td className="py-2.5 pr-4 text-muted">{s.submittedAt.split("T")[0]}</td>
                    <td className="py-2.5 pr-0 text-right">
                      <button
                        disabled={pending}
                        onClick={() => handleReopen(s.employeeId, s.employeeName, s.date)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-100 disabled:opacity-50"
                      >
                        <FaUndo className="h-3 w-3" /> Reopen
                      </button>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination
          page={page}
          totalPages={totalPages}
          totalItems={totalItems}
          pageSize={PAGE_SIZE}
          onPageChange={(nextPage) => goToPage(nextPage, selectedMonth)}
        />
      </div>
    </div>
  );
}
