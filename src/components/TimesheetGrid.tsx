"use client";

import { useMemo, useState, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  FaChevronLeft,
  FaChevronRight,
  FaCalendarDay,
  FaCheck,
  FaTrash,
  FaUserAlt,
  FaUmbrella,
  FaPlane,
  FaPlusCircle,
} from "react-icons/fa";
import type { Project } from "@/lib/types";
import type { DateInfo } from "@/lib/dateUtils";
import { computeDailyOvertime, computeDailyRegular, hasRequiredComment, isWeekUnlocked } from "@/lib/timesheetMath";
import { isWeekend } from "@/lib/dateUtils";
import { FaLock } from "react-icons/fa";
import {
  updateTimesheetCellAction,
  submitDayAction,
  addProjectRowAction,
  deleteOwnProjectEntriesAction,
  updateRowCommentAction,
  type CellTarget,
} from "@/app/(actions)/timesheetActions";
import { MONTH_NAMES } from "@/lib/dateUtils";
import { toast, confirmToast } from "@/lib/toast";
import SearchableProjectSelect from "@/components/SearchableProjectSelect";
import CommentModal, { type CommentRow } from "@/components/CommentModal";
import { PTO_SINGLE_DAY_CAP, STANDARD_DAILY_HOURS } from "@/lib/constants";
import { FaCommentAlt } from "react-icons/fa";

export interface GridEntryValue {
  hours: number;
  comment: string;
}

interface RowDef {
  key: string; // 'p:<id>' or 'c:<category>'
  label: string;
  target: CellTarget;
}

/**
 * A project-row comment is stored as a JSON array of {hours, category,
 * detail?} breakdowns (written by CommentModal's structured form); a
 * category-row comment is plain free text. Render either as one readable
 * line for a tooltip/caption instead of showing raw JSON.
 */
function summarizeCommentForTooltip(comment: string | undefined): string {
  if (!comment) return "";
  const trimmed = comment.trim();
  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed
          .map((row: { hours?: number; category?: string; detail?: string }) => {
            const parts = [row.category, row.hours != null ? `${row.hours}h` : null, row.detail].filter(
              Boolean
            );
            return parts.join(" — ");
          })
          .join("; ");
      }
    } catch {
      // not valid JSON — fall through to showing it as plain text below
    }
  }
  return trimmed;
}

/**
 * Floating comment popover, rendered via a portal into document.body so it
 * can appear above the grid's horizontally-scrolling container instead of
 * being clipped by its `overflow-x-auto` — fixed-positioned from the
 * hovered icon's real screen coordinates, and flips to the right side of
 * the icon (instead of centering under it) whenever it would otherwise run
 * off the right edge of the viewport.
 */
function CommentHoverPopover({
  anchorRect,
  label,
  date,
  text,
}: {
  anchorRect: DOMRect;
  label: string;
  date: string;
  text: string;
}) {
  const POPOVER_WIDTH = 224; // matches w-56 below
  const MARGIN = 8;
  const wouldOverflowRight = anchorRect.left + POPOVER_WIDTH / 2 > window.innerWidth - MARGIN;
  const wouldOverflowLeft = anchorRect.left - POPOVER_WIDTH / 2 < MARGIN;

  let left: number;
  let translateX: string;
  if (wouldOverflowRight) {
    left = anchorRect.right;
    translateX = "-100%";
  } else if (wouldOverflowLeft) {
    left = anchorRect.left;
    translateX = "0%";
  } else {
    left = anchorRect.left + anchorRect.width / 2;
    translateX = "-50%";
  }

  const top = anchorRect.top - 8;

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 4, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 4, scale: 0.97 }}
        transition={{ duration: 0.12 }}
        style={{
          position: "fixed",
          top,
          left,
          transform: `translate(${translateX}, -100%)`,
          width: POPOVER_WIDTH,
        }}
        className="z-[100] rounded-lg bg-gray-900 text-white text-[11px] leading-snug px-2.5 py-2 shadow-lg pointer-events-none"
      >
        <p className="font-semibold mb-0.5">
          {label} — {date}
        </p>
        <p className="whitespace-pre-wrap text-gray-200">{text}</p>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}

export default function TimesheetGrid({
  projects,
  categories,
  dateInfo,
  entriesByDate,
  submittedDates,
  year,
  month,
  readOnly,
  employeeLabel,
  specialVacationHoursYear,
  specialVacationBankedYear,
  onMonthChange,
  isAdminViewer,
}: {
  projects: Project[];
  categories: string[];
  dateInfo: DateInfo[];
  entriesByDate: Record<string, Record<string, GridEntryValue>>;
  submittedDates: string[];
  year: number;
  month: number;
  readOnly: boolean;
  employeeLabel?: string;
  // Mirrors v1's /timesheet route: "Special Vacation" hours on this card
  // are a YEAR-TO-DATE total (Jan 1 - Dec 31 of the viewed year), queried
  // server-side independent of the month being viewed — NOT derived from
  // entriesByDate, which only covers the current month. Optional because
  // the read-only grid embedded in Reports/admin views doesn't fetch this.
  specialVacationHoursYear?: number;
  specialVacationBankedYear?: number;
  // Lets the embedding page own month/year navigation instead of the grid
  // building its own URL from window.location — required wherever the page
  // has other state in the query string (e.g. Reports' ?employee=...) that
  // a bare `?month=&year=` URL would otherwise silently drop.
  onMonthChange?: (month: number, year: number) => void;
  // Mirrors v1's {% if session.role == 'admin' %} block on /timesheet: an
  // "Overtime Summary (This Month)" card only an admin viewer sees, even
  // when looking at their OWN editable grid (not just read-only views).
  isAdminViewer?: boolean;
}) {
  const router = useRouter();
  const [localData, setLocalData] = useState(entriesByDate);
  const [locked, setLocked] = useState(new Set(submittedDates));
  const [pendingCell, setPendingCell] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [addingProject, setAddingProject] = useState(false);
  const [rulesExpanded, setRulesExpanded] = useState(false);
  const [commentTarget, setCommentTarget] = useState<{
    rowKey: string;
    target: CellTarget;
    date: string;
  } | null>(null);
  // Read-only mode (Reports page) has no edit modal — hovering a cell's
  // comment icon shows a small floating popover with the saved text.
  // Rendered via a portal into document.body (see CommentHoverPopover
  // below) so it can float above the grid's horizontally-scrolling
  // container instead of being clipped by its overflow-x-auto — a plain
  // absolutely-positioned child was getting cut off for any cell near the
  // right edge of the scroll area.
  const [hoveredComment, setHoveredComment] = useState<{
    key: string;
    anchorRect: DOMRect;
    label: string;
    date: string;
    text: string;
  } | null>(null);

  const projectsById = useMemo(() => {
    const map: Record<string, Project> = {};
    for (const p of projects) map[p.id] = p;
    return map;
  }, [projects]);

  const [addedProjectIds, setAddedProjectIds] = useState<Set<string>>(() => {
    const ids = new Set<string>();
    for (const dayEntries of Object.values(entriesByDate)) {
      for (const key of Object.keys(dayEntries)) {
        if (key.startsWith("p:")) ids.add(key.slice(2));
      }
    }
    return ids;
  });

  const rows: RowDef[] = useMemo(() => {
    const projectRows: RowDef[] = [...addedProjectIds]
      .map((id) => projectsById[id])
      .filter((p): p is Project => !!p)
      .map((p) => ({
        key: `p:${p.id}`,
        label: `${p.client_name} — ${p.name}`,
        target: { projectId: p.id, category: null },
      }));
    const categoryRows: RowDef[] = categories.map((c) => ({
      key: `c:${c}`,
      label: c,
      target: { projectId: null, category: c },
    }));
    return [...projectRows, ...categoryRows];
  }, [addedProjectIds, projectsById, categories]);

  async function handleAddProject(projectId: string) {
    if (!projectId || addedProjectIds.has(projectId)) return;
    setAddingProject(true);
    setAddedProjectIds((prev) => new Set(prev).add(projectId));
    const firstDateOfMonth = dateInfo[0]?.date;
    if (firstDateOfMonth) {
      const result = await addProjectRowAction(projectId, firstDateOfMonth);
      if (!result.success) {
        toast.error(result.error ?? "Could not add project row.");
      } else {
        setLocalData((prev) => ({
          ...prev,
          [firstDateOfMonth]: {
            ...prev[firstDateOfMonth],
            [`p:${projectId}`]: prev[firstDateOfMonth]?.[`p:${projectId}`] ?? { hours: 0, comment: "" },
          },
        }));
      }
    }
    setAddingProject(false);
  }

  async function handleRemoveProject(projectId: string) {
    const confirmed = await confirmToast(
      "Are you sure you want to remove this project and all its hours for this month from your timesheet?",
      { confirmLabel: "Remove" }
    );
    if (!confirmed) return;
    await deleteOwnProjectEntriesAction({ projectId, category: null });
    toast.success("Project row removed.");
    setAddedProjectIds((prev) => {
      const next = new Set(prev);
      next.delete(projectId);
      return next;
    });
    setLocalData((prev) => {
      const next: typeof prev = {};
      const removedKey = `p:${projectId}`;
      for (const [date, dayEntries] of Object.entries(prev)) {
        const rest = Object.fromEntries(
          Object.entries(dayEntries).filter(([key]) => key !== removedKey)
        );
        next[date] = rest;
      }
      return next;
    });
  }

  const rowCommentTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  /**
   * Row-level "Add a comment for this project" input, matching v1's plain
   * text box at the end of each project row (separate from the per-day
   * "C" comment button). Unlike v1's version, this never touches an
   * entry's hours — it only ever updates the comment column server-side
   * (see updateRowCommentAction).
   */
  function handleRowCommentChange(projectId: string, comment: string) {
    if (rowCommentTimers.current[projectId]) {
      clearTimeout(rowCommentTimers.current[projectId]);
    }
    rowCommentTimers.current[projectId] = setTimeout(async () => {
      const firstDateOfMonth = dateInfo[0]?.date;
      if (!firstDateOfMonth) return;
      const result = await updateRowCommentAction(projectId, firstDateOfMonth, comment);
      if (!result.success) {
        toast.error(result.error ?? "Failed to save comment.");
      }
    }, 600);
  }

  const dailyTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const d of dateInfo) {
      const dayEntries = localData[d.date] ?? {};
      totals[d.date] = Object.values(dayEntries).reduce((s, v) => s + (v.hours || 0), 0);
    }
    return totals;
  }, [localData, dateInfo]);

  // v1's "Daily Total" row (and everything summed from it — Month Total,
  // Week Total, Avg Daily) displays the REGULAR-hours-only value
  // (min(total, 7.75) on weekdays, 0 on weekends) — not the raw sum.
  // Overtime is tracked entirely separately (see overtimeTotal below), so
  // summing the raw total here would double it into both figures and show
  // a different "Daily Total" number than v1 whenever someone logs
  // overtime. dailyTotals (raw) is still used for the submit-button gate
  // and row-level math below, which v1 computes from the raw total too.
  const dailyRegularTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const d of dateInfo) {
      totals[d.date] = computeDailyRegular(d.date, dailyTotals[d.date] ?? 0);
    }
    return totals;
  }, [dailyTotals, dateInfo]);

  // v1 genuinely shows TWO different "total" numbers on this page, and
  // they are not the same figure:
  //  - The grid's own "Daily Totals" row footer cell (#grand-total) is the
  //    RAW, uncapped sum of every hour logged all month (literally
  //    `project_totals.values()|sum` server-side, recomputed client-side
  //    from the raw .project-total row cells — never capped at 7.75).
  //  - The separate "Summary" card's "Month Total" (#month-total) IS
  //    capped — computed from the .daily-total cells, which cap each
  //    weekday at 7.75 and zero out weekends.
  // Conflating these into one number is what made the grid's total look
  // "wrong" compared to v1.
  const grandTotal = useMemo(
    () => Object.values(dailyTotals).reduce((s, v) => s + v, 0),
    [dailyTotals]
  );

  const monthlyTotal = useMemo(
    () => Object.values(dailyRegularTotals).reduce((s, v) => s + v, 0),
    [dailyRegularTotals]
  );

  const overtimeTotal = useMemo(() => {
    return dateInfo.reduce(
      (s, d) => s + computeDailyOvertime(d.date, dailyTotals[d.date] ?? 0),
      0
    );
  }, [dateInfo, dailyTotals]);

  // Category breakdown for Photo Metric Cards
  const categoryHours = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const dayEntries of Object.values(localData)) {
      for (const [key, val] of Object.entries(dayEntries)) {
        if (key.startsWith("c:")) {
          const cat = key.slice(2);
          totals[cat] = (totals[cat] ?? 0) + (val.hours || 0);
        }
      }
    }
    return totals;
  }, [localData]);

  const ptoHours = categoryHours["PTO"] ?? 0;
  const ptoBankedHours = categoryHours["PTO BANKING"] ?? 0;
  const ptoSum = ptoHours + ptoBankedHours;

  const vacationHours = categoryHours["Vacation"] ?? 0;

  // Prefer the server-supplied year-to-date totals (matches v1 exactly);
  // fall back to the month-scoped figure only when the caller didn't pass
  // them (the read-only grid embedded in Reports/admin views).
  const specialVacationHours = specialVacationHoursYear ?? categoryHours["Special Vacation"] ?? 0;
  const specialVacationBankedHours =
    specialVacationBankedYear ?? categoryHours["Special Vacation Banking"] ?? 0;
  const specialVacationTotal = specialVacationHours + specialVacationBankedHours;

  // Mirrors v1's updateSummary() exactly: "Week Total" is simply the sum
  // of the LAST 7 days in the currently-viewed month's grid (dailyTotals
  // .slice(-7)) — not a lookup of "this calendar week" by today's date.
  const currentWeekTotal = useMemo(() => {
    const dates = dateInfo.map((d) => d.date);
    const lastWeekDates = dates.slice(-7);
    return lastWeekDates.reduce((s, d) => s + (dailyRegularTotals[d] ?? 0), 0);
  }, [dateInfo, dailyRegularTotals]);

  // Mirrors v1 exactly: avgDaily = monthTotal / (total number of days in
  // the month, i.e. every day column) — not divided by only the days
  // that actually have hours logged.
  const avgDailyHours = useMemo(() => {
    return dateInfo.length > 0 ? monthlyTotal / dateInfo.length : 0;
  }, [monthlyTotal, dateInfo]);

  // "Finish last week before starting a new one": a weekday is editable
  // only once every weekday of the immediately preceding Mon-Fri week has
  // been submitted. submittedDates (the full set passed in, including the
  // page's lookback window before the visible month) is what makes this
  // correct even for the first week of a month, whose preceding week can
  // fall in the previous month.
  const weekUnlockedByDate = useMemo(() => {
    const map: Record<string, boolean> = {};
    for (const d of dateInfo) {
      map[d.date] = isWeekUnlocked(d.date, locked);
    }
    return map;
  }, [dateInfo, locked]);

  const rowTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const row of rows) {
      let sum = 0;
      for (const dayEntries of Object.values(localData)) {
        sum += dayEntries[row.key]?.hours ?? 0;
      }
      totals[row.key] = sum;
    }
    return totals;
  }, [rows, localData]);

  const handleCellChange = useCallback(
    (rowKey: string, target: CellTarget, date: string, hours: number, comment: string) => {
      setLocalData((prev) => ({
        ...prev,
        [date]: { ...prev[date], [rowKey]: { hours, comment } },
      }));

      const debounceKey = `${rowKey}|${date}`;
      if (debounceTimers.current[debounceKey]) {
        clearTimeout(debounceTimers.current[debounceKey]);
      }
      debounceTimers.current[debounceKey] = setTimeout(async () => {
        setPendingCell(debounceKey);
        const result = await updateTimesheetCellAction(target, date, hours, comment);
        setPendingCell(null);
        if (!result.success) {
          toast.error(result.error ?? "Failed to save cell.");
        }
      }, 600);
    },
    []
  );

  /**
   * Validates a raw hours input exactly like v1's updateTimesheet() before
   * any save happens:
   *  1. PTO / PTO BANKING cells are hard-capped at 4.00h — over that, the
   *     value is rejected (never saved) and the caller should restore the
   *     previous value.
   *  2. Every cell must be a multiple of 0.25 — anything else is rejected
   *     and the caller should clear the cell.
   * Returns null if the value is valid, otherwise a reason string the
   * caller uses to show the right toast.
   */
  function validateHoursInput(
    target: CellTarget,
    hours: number
  ): "pto-cap" | "quarter-hour" | null {
    const categoryKey = (target.category ?? "").trim().toUpperCase();
    if ((categoryKey === "PTO" || categoryKey === "PTO BANKING") && hours > PTO_SINGLE_DAY_CAP) {
      return "pto-cap";
    }
    // Guard against floating-point error the same way v1 does (0.001 tolerance).
    if (Math.abs(hours % 0.25) > 0.001 && Math.abs((hours % 0.25) - 0.25) > 0.001) {
      return "quarter-hour";
    }
    return null;
  }

  /**
   * Mirrors v1's updateSubmitButtons() exactly: the Submit button is only
   * shown (not just enabled) when the day genuinely qualifies —
   *  - Weekend: any hours logged at all (i.e. computed overtime > 0).
   *  - Weekday: daily total >= 7.75 hours AND every project row with
   *    hours > 0 that day has a saved, non-empty comment.
   * Already-submitted (locked) days never show the button.
   */
  function shouldShowSubmitButton(date: string): boolean {
    if (locked.has(date)) return false;
    if (!isWeekUnlocked(date, locked)) return false;
    const dailyTotal = dailyTotals[date] ?? 0;

    if (isWeekend(date)) {
      return computeDailyOvertime(date, dailyTotal) > 0;
    }

    if (dailyTotal < 7.75) return false;

    const dayEntries = localData[date] ?? {};
    for (const row of rows) {
      if (!row.target.projectId) continue; // categories never require a comment
      const entry = dayEntries[row.key];
      if (!entry || entry.hours <= 0) continue;
      if (!hasRequiredComment(entry.comment)) return false;
    }
    return true;
  }

  /**
   * Structured comment save for a REAL PROJECT row — mirrors v1's
   * saveCommentFromModal(): the grid cell's hours are REPLACED with the
   * sum of the modal's rows (not merged, not added), and the breakdown is
   * stored as a JSON string in the comment column.
   */
  async function handleSaveStructuredComment(rows: CommentRow[], totalHours: number) {
    if (!commentTarget) return;
    const { rowKey, target, date } = commentTarget;
    const commentJSON = JSON.stringify(rows);
    setLocalData((prev) => ({
      ...prev,
      [date]: { ...prev[date], [rowKey]: { hours: totalHours, comment: commentJSON } },
    }));
    const result = await updateTimesheetCellAction(target, date, totalHours, commentJSON);
    if (!result.success) {
      toast.error(result.error ?? "Failed to save comment.");
    } else {
      toast.success("Comment saved.");
    }
    setCommentTarget(null);
  }

  /**
   * Plain free-text comment save for a SPECIAL CATEGORY row — mirrors
   * v1's saveSimpleCommentFromModal(): only the comment text changes,
   * the cell's hours value is left exactly as it was.
   */
  async function handleSaveSimpleComment(text: string) {
    if (!commentTarget) return;
    const { rowKey, target, date } = commentTarget;
    const existingHours = localData[date]?.[rowKey]?.hours ?? 0;
    setLocalData((prev) => ({
      ...prev,
      [date]: { ...prev[date], [rowKey]: { hours: existingHours, comment: text } },
    }));
    const result = await updateTimesheetCellAction(target, date, existingHours, text);
    if (!result.success) {
      toast.error(result.error ?? "Failed to save comment.");
    } else {
      toast.success("Comment saved.");
    }
    setCommentTarget(null);
  }

  async function handleSubmitDay(date: string) {
    setSubmitting(date);
    const result = await submitDayAction(date);
    setSubmitting(null);
    if (result.success) {
      setLocked((prev) => new Set(prev).add(date));
      toast.success(`${date} submitted and locked.`);
    } else {
      toast.error(result.error ?? "Could not submit day.");
    }
  }

  function navigateMonth(delta: number) {
    let newMonth = month + delta;
    let newYear = year;
    if (newMonth > 12) {
      newMonth = 1;
      newYear++;
    } else if (newMonth < 1) {
      newMonth = 12;
      newYear--;
    }
    if (onMonthChange) {
      onMonthChange(newMonth, newYear);
      return;
    }
    // { scroll: false } + router.refresh(): same fix as Reports' month
    // navigation — without refresh(), Next's client router cache can serve
    // a stale RSC response for a month already visited this session (the
    // grid would show old/no data until a hard refresh); without
    // scroll:false, the page jumps back to the top on every click.
    router.push(`/timesheet?month=${newMonth}&year=${newYear}`, { scroll: false });
    router.refresh();
  }

  return (
    <div className="max-w-full space-y-6">
      {/* 1. Header Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">
            {employeeLabel ? `${employeeLabel}'s Timesheet` : "Timesheet"}
          </h1>
          <p className="text-muted text-sm">
            {MONTH_NAMES[month - 1]} {year}
            {readOnly && " · read-only"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="btn-ghost inline-flex items-center gap-1.5 px-3 py-1.5 text-sm"
            onClick={() => navigateMonth(-1)}
          >
            <FaChevronLeft className="h-3 w-3" /> Previous
          </button>
          <span className="glass px-4 py-1.5 text-sm font-medium">{MONTH_NAMES[month - 1]} {year}</span>
          <button
            className="btn-ghost inline-flex items-center gap-1.5 px-3 py-1.5 text-sm"
            onClick={() => navigateMonth(1)}
          >
            Next <FaChevronRight className="h-3 w-3" />
          </button>
          {!readOnly && (
            <button
              className="btn-ghost inline-flex items-center gap-1.5 px-3 py-1.5 text-sm"
              onClick={() => {
                const now = new Date();
                const nowMonth = now.getMonth() + 1;
                const nowYear = now.getFullYear();
                if (onMonthChange) {
                  onMonthChange(nowMonth, nowYear);
                  return;
                }
                router.push(`/timesheet?month=${nowMonth}&year=${nowYear}`, { scroll: false });
                router.refresh();
              }}
            >
              <FaCalendarDay className="h-3 w-3" /> Today
            </button>
          )}
        </div>
      </div>

      {/* 2. Timesheet Rules Box - Collapsible on Hover / Click at Top */}
      {!readOnly && (
        <div
          onMouseEnter={() => setRulesExpanded(true)}
          onMouseLeave={() => setRulesExpanded(false)}
          onClick={() => setRulesExpanded((prev) => !prev)}
          className="rounded-xl border border-sky-200 bg-sky-50/90 px-4 py-3 text-sky-900 shadow-xs cursor-pointer transition-all duration-300 hover:shadow-md"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-base">💡</span>
              <h6 className="font-semibold text-sm">Timesheet Rules</h6>
            </div>
            <span className="text-xs font-medium text-sky-700 bg-sky-100/80 px-2.5 py-1 rounded-full border border-sky-200 flex items-center gap-1">
              {rulesExpanded ? "Click/Hover to collapse ▲" : "Hover or click to view rules (7) ▼"}
            </span>
          </div>

          <div
            className={`transition-all duration-300 ease-in-out overflow-hidden ${
              rulesExpanded ? "max-h-96 opacity-100 mt-3 pt-2 border-t border-sky-200/60" : "max-h-0 opacity-0 mt-0"
            }`}
          >
            <ul className="text-xs space-y-1 list-disc pl-4 text-sky-950">
              <li>Each day should total to 7.75 hrs (excludes 45 minutes lunch break)</li>
              <li>If you are coming late or taking personal time off, input those hours for that day under &apos;PTO&apos;</li>
              <li>When you are banking that time on another day, put it as negative time under &apos;PTO BANKING&apos;</li>
              <li>PTO banking needs additional time to be spent on project, add that as overtime for the project you work on that day</li>
              <li>Overhead will only be filled for events like power cut off, birthday celebrations, any other similar event</li>
              <li>If working overtime for a project on a particular day, input your hours as 7.75 + additional hours</li>
              <li>Please add a comment for anything which should be commented</li>
            </ul>
          </div>
        </div>
      )}

      {/* 3. Single Row Metric Cards Panel (Shifted to Top) */}
      <div
        className={`grid grid-cols-1 sm:grid-cols-2 gap-4 ${
          isAdminViewer ? "xl:grid-cols-5" : "xl:grid-cols-4"
        }`}
      >
        {/* 1. PTO Summary */}
        <div className="bg-white rounded-xl border border-gray-200/80 p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center gap-2 text-blue-600 font-semibold text-sm pb-2.5 mb-2.5 border-b border-gray-100">
            <FaUserAlt className="h-4 w-4" />
            <span>PTO Summary</span>
          </div>
          <div className="grid grid-cols-3 text-center">
            <div>
              <p className="text-lg font-bold text-amber-500">{ptoHours.toFixed(2)}h</p>
              <p className="text-[11px] text-gray-500 mt-1">PTO</p>
            </div>
            <div>
              <p className="text-lg font-bold text-amber-500">{ptoBankedHours.toFixed(2)}h</p>
              <p className="text-[11px] text-gray-500 mt-1">PTO Banked</p>
            </div>
            <div>
              <p className="text-lg font-bold text-amber-500">{ptoSum.toFixed(2)}h</p>
              <p className="text-[11px] text-gray-500 mt-1">Total</p>
            </div>
          </div>
        </div>

        {/* 2. Vacation Summary */}
        <div className="bg-white rounded-xl border border-gray-200/80 p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center gap-2 text-blue-600 font-semibold text-sm pb-2.5 mb-2.5 border-b border-gray-100">
            <FaUmbrella className="h-4 w-4" />
            <span>Vacation Summary</span>
          </div>
          <div className="text-center py-1">
            <p className="text-2xl font-bold text-cyan-500">{vacationHours.toFixed(2)}h</p>
            <p className="text-[11px] text-gray-500 mt-1">Total Vacation Used</p>
          </div>
        </div>

        {/* 3. Special Vacation */}
        <div className="bg-white rounded-xl border border-gray-200/80 p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center gap-2 text-blue-600 font-semibold text-sm pb-2.5 mb-2.5 border-b border-gray-100">
            <FaPlane className="h-4 w-4" />
            <span>Special Vacation</span>
          </div>
          <div className="grid grid-cols-3 text-center gap-1">
            <div>
              <p className="text-base font-bold text-amber-500">{specialVacationHours.toFixed(2)}h</p>
              <p className="text-[10px] text-gray-500 mt-1 leading-tight">Special Vac. (Year)</p>
            </div>
            <div>
              <p className="text-base font-bold text-amber-500">{specialVacationBankedHours.toFixed(2)}h</p>
              <p className="text-[10px] text-gray-500 mt-1 leading-tight">Banked (Year)</p>
            </div>
            <div>
              <p className="text-base font-bold text-amber-500">{specialVacationTotal.toFixed(2)}h</p>
              <p className="text-[10px] text-gray-500 mt-1 leading-tight">Total (Year)</p>
            </div>
          </div>
        </div>

        {/* Admin-only: Overtime Summary (This Month) — mirrors v1's
            {% if session.role == 'admin' %} card exactly, even when the
            admin is viewing their own editable grid, not just read-only. */}
        {isAdminViewer && (
          <div className="bg-white rounded-xl border border-gray-200/80 p-4 shadow-sm flex flex-col justify-between">
            <div className="flex items-center gap-2 text-blue-600 font-semibold text-sm pb-2.5 mb-2.5 border-b border-gray-100">
              <FaPlusCircle className="h-4 w-4" />
              <span>Overtime Summary (This Month)</span>
            </div>
            <div className="text-center py-1">
              <p className="text-2xl font-bold text-red-600">{overtimeTotal.toFixed(2)}h</p>
              <p className="text-[11px] text-gray-500 mt-1">Total Overtime Logged</p>
            </div>
          </div>
        )}

        {/* 4. Summary */}
        <div className="bg-white rounded-xl border border-gray-200/80 p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-blue-600 font-semibold text-sm pb-2.5 mb-2.5 border-b border-gray-100">
            <span>Summary</span>
          </div>
          <div className="grid grid-cols-3 text-center">
            <div>
              <p className="text-lg font-bold text-blue-600">{monthlyTotal.toFixed(2)}</p>
              <p className="text-[11px] text-gray-500 mt-1">Month Total</p>
            </div>
            <div>
              <p className="text-lg font-bold text-emerald-600">{currentWeekTotal.toFixed(2)}</p>
              <p className="text-[11px] text-gray-500 mt-1">Week Total</p>
            </div>
            <div>
              <p className="text-lg font-bold text-cyan-500">{avgDailyHours.toFixed(2)}</p>
              <p className="text-[11px] text-gray-500 mt-1">Avg Daily</p>
            </div>
          </div>
        </div>
      </div>

      {/* 4. Project Selection Dropdown */}
      {!readOnly && (
        <div className="glass !p-0 overflow-visible rounded-xl">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
            <h6 className="font-semibold text-accent text-sm">Project Selection</h6>
            <span className="text-xs text-muted">
              Search by name, number, client, or category to add project row
            </span>
          </div>
          <div className="p-4">
            <SearchableProjectSelect
              projects={projects}
              onSelectProject={handleAddProject}
              disabled={addingProject}
              addedProjectIds={addedProjectIds}
            />
          </div>
        </div>
      )}

      {/* 5. Main Timesheet Grid Table */}
      <div className="glass overflow-x-auto scrollbar-thin rounded-xl">
        <table className="text-xs border-collapse min-w-max">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-[#212529] text-white px-3 py-2 text-left min-w-[220px] border-b border-gray-200">
                Project / Category
              </th>
              {dateInfo.map((d) => {
                const weekend = d.weekday >= 5;
                const dayTotal = dailyTotals[d.date] ?? 0;
                const isFullDay = !weekend && dayTotal >= STANDARD_DAILY_HOURS;
                const isLocked = locked.has(d.date);
                const weekGated = !readOnly && !isLocked && !weekUnlockedByDate[d.date];
                const showButton = !readOnly && shouldShowSubmitButton(d.date);
                return (
                  <th
                    key={d.date}
                    className={`px-2 py-2 text-center border-b border-gray-200 min-w-[64px] ${
                      weekend
                        ? "text-red-700 bg-red-50"
                        : isFullDay
                        ? "text-emerald-700 bg-emerald-50"
                        : "text-muted"
                    }`}
                  >
                    <div>{d.dayName}</div>
                    <div className="font-semibold text-foreground">{d.dayNumber}</div>
                    {/* Mirrors v1 exactly: the Submit button (or a "Locked"
                        badge once submitted) lives right under each day's
                        own date header — not in a separate row at the
                        bottom of the grid, which made it easy to miss on a
                        wide, horizontally-scrolling table. */}
                    {!readOnly && isLocked && (
                      <span className="mt-1 inline-block text-[9px] text-emerald-700 border border-emerald-200 rounded-full px-1.5 py-0.5 bg-emerald-50">
                        Locked
                      </span>
                    )}
                    {weekGated && (
                      <span
                        title="Submit every weekday of the previous week first to unlock this week."
                        className="mt-1 inline-flex items-center gap-1 text-[9px] text-amber-700 border border-amber-200 rounded-full px-1.5 py-0.5 bg-amber-50"
                      >
                        <FaLock className="h-2 w-2" /> Week locked
                      </span>
                    )}
                    {showButton && (
                      <motion.button
                        whileTap={{ scale: 0.9 }}
                        disabled={submitting === d.date}
                        onClick={() => handleSubmitDay(d.date)}
                        className="mt-1 text-[9px] btn-primary inline-flex items-center gap-1 px-1.5 py-0.5"
                      >
                        {submitting === d.date ? "…" : (<><FaCheck className="h-2 w-2" /> Submit</>)}
                      </motion.button>
                    )}
                  </th>
                );
              })}
              <th className="px-2 py-2 border-b border-gray-200 bg-sky-50 min-w-[70px]">Total</th>
              {!readOnly && (
                <>
                  <th className="px-2 py-2 border-b border-gray-200 min-w-[60px]"></th>
                  <th className="px-2 py-2 border-b border-gray-200 min-w-[180px] text-left">
                    Comment
                  </th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <motion.tr
                key={row.key}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: Math.min(ri * 0.01, 0.3) }}
                className="border-b border-gray-100 hover:bg-gray-50"
              >
                <td className="sticky left-0 z-10 bg-white px-3 py-1.5 whitespace-nowrap max-w-[260px] overflow-hidden text-ellipsis border-r border-gray-100">
                  {row.label}
                </td>
                {dateInfo.map((d) => {
                  const cellVal = localData[d.date]?.[row.key];
                  const isLocked = locked.has(d.date) || readOnly || !weekUnlockedByDate[d.date];
                  const debounceKey = `${row.key}|${d.date}`;
                  const commentPresent = hasRequiredComment(cellVal?.comment);
                  const weekend = d.weekday >= 5;
                  const dayTotal = dailyTotals[d.date] ?? 0;
                  const isFullDay = !weekend && dayTotal >= STANDARD_DAILY_HOURS;
                  // Structured (JSON-breakdown) comments aren't readable as
                  // a raw tooltip string — summarize them instead, matching
                  // the same shape CommentModal writes for project rows.
                  const commentTooltip = summarizeCommentForTooltip(cellVal?.comment);
                  return (
                    <td
                      key={d.date}
                      className={`px-1 py-1 text-center ${
                        weekend ? "bg-red-50" : isFullDay ? "bg-emerald-50" : ""
                      }`}
                    >
                      <div className="flex items-center justify-center gap-0.5">
                        <input
                          type="number"
                          step="0.25"
                          min={0}
                          disabled={isLocked}
                          defaultValue={cellVal?.hours ? cellVal.hours : ""}
                          title={commentTooltip}
                          onChange={(e) => {
                            const input = e.target;
                            const hours = parseFloat(input.value) || 0;
                            const problem = validateHoursInput(row.target, hours);
                            if (problem === "pto-cap") {
                              toast.error(
                                `You cannot enter more than ${PTO_SINGLE_DAY_CAP.toFixed(2)} hours for PTO or PTO BANKING. Please break the remainder into sicktime or vacation.`
                              );
                              input.value = cellVal?.hours ? String(cellVal.hours) : "";
                              return;
                            }
                            if (problem === "quarter-hour") {
                              toast.error(
                                "Invalid entry. Please enter hours in multiples of 0.25 (e.g., 1.25, 1.5, 1.75)."
                              );
                              input.value = "";
                              return;
                            }
                            handleCellChange(row.key, row.target, d.date, hours, cellVal?.comment ?? "");
                          }}
                          className={`w-12 text-center rounded-md px-1 py-1 text-xs glass-input ${
                            isLocked ? "opacity-50 cursor-not-allowed" : ""
                          } ${pendingCell === debounceKey ? "ring-1 ring-accent" : ""}`}
                        />
                        {!readOnly && (
                          <button
                            type="button"
                            disabled={isLocked}
                            title={commentPresent ? "Edit comment" : "Add comment"}
                            onClick={() =>
                              setCommentTarget({ rowKey: row.key, target: row.target, date: d.date })
                            }
                            className={`shrink-0 h-5 w-5 rounded flex items-center justify-center text-[9px] ${
                              commentPresent
                                ? "bg-sky-500 text-white"
                                : "bg-gray-200 text-gray-500 hover:bg-gray-300"
                            } ${isLocked ? "opacity-50 cursor-not-allowed" : ""}`}
                          >
                            <FaCommentAlt className="h-2 w-2" />
                          </button>
                        )}
                        {readOnly && commentPresent && (
                          <span
                            className="h-5 w-5 rounded flex items-center justify-center text-[9px] bg-sky-100 text-sky-600 cursor-default shrink-0"
                            onMouseEnter={(e) =>
                              setHoveredComment({
                                key: debounceKey,
                                anchorRect: e.currentTarget.getBoundingClientRect(),
                                label: row.label,
                                date: d.date,
                                text: commentTooltip,
                              })
                            }
                            onMouseLeave={() => setHoveredComment(null)}
                          >
                            <FaCommentAlt className="h-2 w-2" />
                          </span>
                        )}
                      </div>
                    </td>
                  );
                })}
                <td className="px-2 py-1 text-center font-medium">
                  {rowTotals[row.key] ? rowTotals[row.key].toFixed(2) : "—"}
                </td>
                {!readOnly && (
                  <>
                    <td className="px-2 py-1 text-center">
                      {row.target.projectId && (
                        <button
                          type="button"
                          title="Remove Project Row"
                          onClick={() => handleRemoveProject(row.target.projectId as string)}
                          className="text-red-600 hover:text-red-700 p-1.5 rounded-md hover:bg-red-50 transition-colors"
                        >
                          <FaTrash className="h-3 w-3" />
                        </button>
                      )}
                    </td>
                    <td className="px-1 py-1">
                      {row.target.projectId && (
                        <input
                          type="text"
                          placeholder="Add a comment for this project"
                          defaultValue=""
                          onChange={(e) =>
                            handleRowCommentChange(row.target.projectId as string, e.target.value)
                          }
                          className="glass-input w-full px-2 py-1 text-xs"
                        />
                      )}
                    </td>
                  </>
                )}
              </motion.tr>
            ))}

            <tr className="bg-amber-50 font-semibold">
              <td className="sticky left-0 z-10 bg-amber-50 px-3 py-1.5 border-r border-amber-100">Daily Total</td>
              {dateInfo.map((d) => (
                <td key={d.date} className="px-2 py-1.5 text-center">
                  {(dailyRegularTotals[d.date] ?? 0).toFixed(2)}
                </td>
              ))}
              {/* Matches v1 exactly: this footer cell (#grand-total) is the
                  RAW grand total of every hour logged, NOT the sum of the
                  capped per-day cells to its left — v1's own grid has this
                  same inconsistency between the row and its own total. */}
              <td className="px-2 py-1.5 text-center" title="Raw total of all hours logged this month (matches v1's grid footer)">
                {grandTotal.toFixed(2)}
              </td>
              {!readOnly && (
                <>
                  <td className="bg-amber-50" />
                  <td className="bg-amber-50" />
                </>
              )}
            </tr>
            <tr className="bg-red-50 font-semibold">
              <td className="sticky left-0 z-10 bg-red-50 px-3 py-1.5 border-r border-red-100 text-red-700">Overtime</td>
              {dateInfo.map((d) => (
                <td key={d.date} className="px-2 py-1.5 text-center">
                  {computeDailyOvertime(d.date, dailyTotals[d.date] ?? 0).toFixed(2)}
                </td>
              ))}
              <td className="px-2 py-1.5 text-center">{overtimeTotal.toFixed(2)}</td>
              {!readOnly && (
                <>
                  <td className="bg-red-50" />
                  <td className="bg-red-50" />
                </>
              )}
            </tr>
          </tbody>
        </table>
      </div>

      <CommentModal
        open={!!commentTarget}
        onClose={() => setCommentTarget(null)}
        isProject={!!commentTarget?.target.projectId}
        initialComment={
          commentTarget
            ? localData[commentTarget.date]?.[commentTarget.rowKey]?.comment ?? ""
            : ""
        }
        onSaveStructured={handleSaveStructuredComment}
        onSaveSimple={handleSaveSimpleComment}
      />

      {hoveredComment && (
        <CommentHoverPopover
          anchorRect={hoveredComment.anchorRect}
          label={hoveredComment.label}
          date={hoveredComment.date}
          text={hoveredComment.text}
        />
      )}
    </div>
  );
}
