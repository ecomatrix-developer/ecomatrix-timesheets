"use client";

import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useTransition } from "react";
import type { PublicUser, Project } from "@/lib/types";
import type { DateInfo } from "@/lib/dateUtils";
import type { GridEntryValue } from "@/components/TimesheetGrid";
import TimesheetGrid from "@/components/TimesheetGrid";
import { CATEGORIES_FOR_GRID } from "@/lib/constants";
import { MONTH_NAMES } from "@/lib/dateUtils";
import { reopenDayAction } from "@/app/(actions)/timesheetActions";
import Pagination from "@/components/Pagination";
import ProjectSummaryAccordion from "@/components/ProjectSummaryAccordion";
import Select from "@/components/Select";
import { PAGE_SIZE } from "@/lib/constants";
import { toast } from "@/lib/toast";
import { FaDownload, FaUserCheck } from "react-icons/fa";

interface GridData {
  dateInfo: DateInfo[];
  entriesByDate: Record<string, Record<string, GridEntryValue>>;
  submittedDates: string[];
  monthlyTotal: number;
  ptoSummary: number;
  vacationSummary: number;
  specialVacationYear: number;
  specialVacationBankedYear: number;
  overtimeSummary: number;
  projectsWithEntries: Project[];
}

export default function ReportsClient({
  employees,
  selectedUsername,
  year,
  month,
  submissions,
  submissionsPage,
  submissionsTotalPages,
  submissionsTotal,
  projectTotals,
  totalsPage,
  totalsTotalPages,
  totalsTotal,
  paginatedProjects,
  projectTotalsById,
  psPage,
  psTotalPages,
  psTotal,
  psSelectedStatuses,
  psSearch,
  gridData,
}: {
  employees: PublicUser[];
  selectedUsername: string;
  year: number;
  month: number;
  submissions: { employeeName: string; date: string; totalHours: number; submittedAt: string }[];
  submissionsPage: number;
  submissionsTotalPages: number;
  submissionsTotal: number;
  projectTotals: { label: string; hours: number }[];
  totalsPage: number;
  totalsTotalPages: number;
  totalsTotal: number;
  paginatedProjects: Project[];
  projectTotalsById: Record<string, number>;
  psPage: number;
  psTotalPages: number;
  psTotal: number;
  psSelectedStatuses: string[];
  psSearch: string;
  gridData: GridData | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const selectedEmployee = employees.find((e) => e.username === selectedUsername);

  // Changing employee/month/year resets both lists back to page 1 — the
  // new filter combination may have far fewer pages than before.
  //
  // { scroll: false } stops Next from jumping back to the top of the page
  // on every navigation — without it, picking a new month felt like the
  // employee selection had been lost, because the viewport snapped away
  // from wherever you were (e.g. after scrolling down to the grid).
  //
  // router.refresh() after the push is required too: Next's client-side
  // router cache can otherwise serve a stale RSC response for a segment
  // that was already visited in this session (e.g. flipping back to a
  // month you viewed a minute ago shows the OLD employee's grid/data),
  // even though the page itself is `dynamic = "force-dynamic"` — that
  // setting only controls server-side rendering, not this client cache.
  function navigate(params: URLSearchParams) {
    router.push(`/reports?${params.toString()}`, { scroll: false });
    router.refresh();
  }

  function updateParams(next: { employee?: string; month?: number; year?: number }) {
    const params = new URLSearchParams();
    params.set("employee", next.employee ?? selectedUsername);
    params.set("month", String(next.month ?? month));
    params.set("year", String(next.year ?? year));
    navigate(params);
  }

  function goToSubmissionsPage(nextPage: number) {
    const params = new URLSearchParams();
    params.set("employee", selectedUsername);
    params.set("month", String(month));
    params.set("year", String(year));
    params.set("submissionsPage", String(nextPage));
    params.set("totalsPage", String(totalsPage));
    navigate(params);
  }

  function goToTotalsPage(nextPage: number) {
    const params = new URLSearchParams();
    params.set("employee", selectedUsername);
    params.set("month", String(month));
    params.set("year", String(year));
    params.set("submissionsPage", String(submissionsPage));
    params.set("totalsPage", String(nextPage));
    navigate(params);
  }

  // Project Summary's filter/search/pagination state lives entirely in the
  // URL (server-rendered), same pattern as the standalone Projects page.
  function psParams(overrides: Record<string, string | string[] | undefined>) {
    const params = new URLSearchParams();
    params.set("employee", selectedUsername);
    params.set("month", String(month));
    params.set("year", String(year));

    const statuses = overrides.psStatus !== undefined ? overrides.psStatus : psSelectedStatuses;
    const statusArr = Array.isArray(statuses) ? statuses : statuses ? [statuses] : [];
    if (statusArr.length > 0) {
      statusArr.forEach((s) => params.append("psStatus", s));
    } else {
      params.set("psStatus", "");
    }

    const search = overrides.psSearch !== undefined ? overrides.psSearch : psSearch;
    if (search) params.set("psSearch", String(search));

    const page = overrides.psPage !== undefined ? overrides.psPage : undefined;
    if (page) params.set("psPage", String(page));

    return params;
  }

  function togglePsStatus(status: string) {
    const next = psSelectedStatuses.includes(status)
      ? psSelectedStatuses.filter((s) => s !== status)
      : [...psSelectedStatuses, status];
    navigate(psParams({ psStatus: next }));
  }

  function goToPsPage(nextPage: number) {
    navigate(psParams({ psPage: String(nextPage) }));
  }

  function handleReopen(dateStr: string) {
    if (!selectedEmployee) return;
    startTransition(async () => {
      try {
        await reopenDayAction(selectedEmployee.id, dateStr);
        toast.success(`${dateStr} reopened for editing.`);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not reopen this day.");
      }
    });
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Reports &amp; Analytics</h1>
        <a
          href="/api/export/csv"
          className="btn-primary inline-flex items-center gap-2 px-4 py-2 text-sm"
        >
          <FaDownload className="h-3 w-3" /> Export CSV
        </a>
      </div>

      <div className="glass p-4 mb-6 flex flex-col sm:flex-row gap-3 sm:items-end">
        <div className="flex-1">
          <label className="text-xs text-muted block mb-1">Employee</label>
          <Select
            value={selectedUsername}
            onChange={(value) => updateParams({ employee: value })}
            placeholder="— Select employee —"
            options={employees.map((e) => ({ value: e.username, label: e.name }))}
          />
        </div>
        <div className="sm:w-48">
          <label className="text-xs text-muted block mb-1">Month</label>
          <Select
            value={String(month)}
            onChange={(value) => updateParams({ month: parseInt(value, 10) })}
            options={MONTH_NAMES.map((m, i) => ({ value: String(i + 1), label: m }))}
          />
        </div>
        <div>
          <label className="text-xs text-muted block mb-1">Year</label>
          <input
            type="number"
            value={year}
            onChange={(e) => updateParams({ year: parseInt(e.target.value, 10) })}
            className="glass-input w-24 px-3 py-2.5 text-sm"
          />
        </div>
      </div>

      {!selectedEmployee ? (
        <div className="glass p-10 text-center text-muted">
          <FaUserCheck className="mx-auto mb-3 h-8 w-8 text-gray-300" />
          <p className="font-medium text-foreground mb-1">Select an employee to view their reports</p>
          <p className="text-sm">
            Their monthly timesheet, Project Summary, and Submission Log will appear here
            once you pick someone from the dropdown above.
          </p>
        </div>
      ) : (
        <>
          {gridData && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4 mb-6">
                <div className="glass p-4">
                  <p className="text-xs text-muted">Monthly Total</p>
                  <p className="text-2xl font-semibold">{gridData.monthlyTotal.toFixed(2)}h</p>
                </div>
                <div className="glass p-4">
                  <p className="text-xs text-muted">PTO Summary</p>
                  <p className="text-2xl font-semibold text-amber-500">{gridData.ptoSummary.toFixed(2)}h</p>
                </div>
                {/* Matches v1's Reports page exactly: Vacation Summary is
                    month-scoped (same range as PTO above); Special Vacation is
                    a YEAR-TO-DATE figure, a separate query from everything
                    else on this card row. */}
                <div className="glass p-4">
                  <p className="text-xs text-muted">Vacation Summary</p>
                  <p className="text-2xl font-semibold text-cyan-500">{gridData.vacationSummary.toFixed(2)}h</p>
                </div>
                <div className="glass p-4">
                  <p className="text-xs text-muted">Special Vacation (Year)</p>
                  <p className="text-2xl font-semibold text-amber-500">
                    {(gridData.specialVacationYear + gridData.specialVacationBankedYear).toFixed(2)}h
                  </p>
                </div>
                <div className="glass p-4">
                  <p className="text-xs text-muted">Overtime Summary</p>
                  <p className="text-2xl font-semibold text-red-600">{gridData.overtimeSummary.toFixed(2)}h</p>
                </div>
              </div>

              <div className="mb-6">
                <TimesheetGrid
                  key={`${selectedEmployee.username}-${year}-${month}`}
                  projects={gridData.projectsWithEntries}
                  categories={[...CATEGORIES_FOR_GRID]}
                  dateInfo={gridData.dateInfo}
                  entriesByDate={gridData.entriesByDate}
                  submittedDates={gridData.submittedDates}
                  year={year}
                  month={month}
                  readOnly
                  employeeLabel={selectedEmployee.name}
                  onMonthChange={(nextMonth, nextYear) => updateParams({ month: nextMonth, year: nextYear })}
                />
              </div>
            </>
          )}

          <div className="mb-6">
            <ProjectSummaryAccordion
              projects={paginatedProjects}
              projectTotals={projectTotalsById}
              page={psPage}
              totalPages={psTotalPages}
              totalItems={psTotal}
              onPageChange={goToPsPage}
              selectedStatuses={psSelectedStatuses}
              onToggleStatus={togglePsStatus}
              search={psSearch}
              onSearchChange={(value) => navigate(psParams({ psSearch: value, psPage: undefined }))}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass p-4"
            >
              <h2 className="font-semibold mb-3">Submission Log</h2>
              <div className="space-y-2">
                {submissions.length === 0 && <p className="text-sm text-muted">No submissions found.</p>}
                {submissions.map((s, i) => (
                  <div
                    key={i}
                    className="flex justify-between items-center text-sm border-b border-gray-100 pb-2"
                  >
                    <div>
                      <p className="font-medium">{s.employeeName}</p>
                      <p className="text-xs text-muted">{s.date}</p>
                    </div>
                    <div className="text-right">
                      <p>{s.totalHours.toFixed(2)}h</p>
                      <button
                        disabled={pending}
                        onClick={() => handleReopen(s.date)}
                        className="text-xs text-accent hover:underline"
                      >
                        Reopen
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <Pagination
                page={submissionsPage}
                totalPages={submissionsTotalPages}
                totalItems={submissionsTotal}
                pageSize={PAGE_SIZE}
                onPageChange={goToSubmissionsPage}
              />
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className="glass p-4"
            >
              <h2 className="font-semibold mb-3">Project Totals</h2>
              <div className="space-y-2">
                {projectTotals.length === 0 && <p className="text-sm text-muted">No entries found.</p>}
                {projectTotals.map((p, i) => (
                  <div key={i} className="flex justify-between text-sm border-b border-gray-100 pb-2">
                    <span className="truncate pr-2">{p.label}</span>
                    <span className="font-medium">{p.hours.toFixed(2)}h</span>
                  </div>
                ))}
              </div>
              <Pagination
                page={totalsPage}
                totalPages={totalsTotalPages}
                totalItems={totalsTotal}
                pageSize={PAGE_SIZE}
                onPageChange={goToTotalsPage}
              />
            </motion.div>
          </div>
        </>
      )}
    </div>
  );
}
