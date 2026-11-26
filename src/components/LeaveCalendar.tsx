"use client";

import { useMemo, useState } from "react";
import {
  addDays,
  addMonths,
  addWeeks,
  addYears,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  parseISO,
  startOfMonth,
  startOfWeek,
  startOfYear,
  subDays,
  subMonths,
  subWeeks,
  subYears,
} from "date-fns";
import { FaChevronLeft, FaChevronRight, FaCalendarAlt } from "react-icons/fa";
import Modal from "@/components/Modal";
import Select from "@/components/Select";
import { isWhollyHalfDayRow } from "@/lib/leavePolicy";
import type { LeaveRequest, LeaveType } from "@/lib/types";

type ViewMode = "day" | "week" | "month" | "year";

const LEAVE_TYPE_COLORS: Record<LeaveType, string> = {
  annual: "bg-blue-100 text-blue-700 border-blue-200",
  sick: "bg-rose-100 text-rose-700 border-rose-200",
  casual: "bg-purple-100 text-purple-700 border-purple-200",
  unpaid: "bg-gray-200 text-gray-700 border-gray-300",
  other: "bg-teal-100 text-teal-700 border-teal-200",
};

// Solid-color dots for the phone-width month grid (below) — named chips
// don't fit 7 columns on a real phone screen without forcing horizontal
// scroll, so narrow screens get a dot per entry instead; tapping the day
// still opens the full detail modal.
const LEAVE_TYPE_DOT: Record<LeaveType, string> = {
  annual: "bg-blue-500",
  sick: "bg-rose-500",
  casual: "bg-purple-500",
  unpaid: "bg-gray-500",
  other: "bg-teal-500",
};

interface DayEntry {
  request: LeaveRequest;
  date: string;
}

/**
 * Super-Admin-only "who's off when" calendar — Abeer, 2026-11-26: "one
 * more big good feature should be like for superadmins it will show the
 * calender view like google calender where we have option of monthly,
 * yearly, days, weeks." Abeer, 2026-11-27: "it should only appear in
 * calender... once its approved otherwise it wont show there, only
 * approved then only visible" — pending and rejected requests are both
 * excluded; a date only ever shows up here once a Super Admin has
 * approved it (matches the same "approved only" rule the balance/usage
 * math already used — see usageByEmployee in LeaveClient and
 * getLeaveSummaryForEmployee in data.ts).
 */
export default function LeaveCalendar({ requests }: { requests: LeaveRequest[] }) {
  const [view, setView] = useState<ViewMode>("month");
  const [anchor, setAnchor] = useState(() => new Date());
  const [dayDetail, setDayDetail] = useState<Date | null>(null);

  const byDate = useMemo(() => {
    const map = new Map<string, DayEntry[]>();
    for (const r of requests) {
      if (r.status !== "approved") continue;
      let dates: Date[];
      try {
        dates = eachDayOfInterval({ start: parseISO(r.start_date), end: parseISO(r.end_date) });
      } catch {
        continue;
      }
      for (const d of dates) {
        const key = format(d, "yyyy-MM-dd");
        const list = map.get(key) ?? [];
        list.push({ request: r, date: key });
        map.set(key, list);
      }
    }
    return map;
  }, [requests]);

  function entriesFor(d: Date): DayEntry[] {
    return byDate.get(format(d, "yyyy-MM-dd")) ?? [];
  }

  function navigate(dir: 1 | -1) {
    setAnchor((prev) => {
      if (view === "day") return dir === 1 ? addDays(prev, 1) : subDays(prev, 1);
      if (view === "week") return dir === 1 ? addWeeks(prev, 1) : subWeeks(prev, 1);
      if (view === "year") return dir === 1 ? addYears(prev, 1) : subYears(prev, 1);
      return dir === 1 ? addMonths(prev, 1) : subMonths(prev, 1);
    });
  }

  // Abeer, 2026-11-27: "give an option for the month change so that if
  // needed user will change that" — prev/next arrows only ever move one
  // step at a time; these let you jump straight to any month/year instead
  // of clicking through a dozen times to get there.
  const MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 11 }, (_, i) => currentYear - 5 + i);
  function jumpToMonth(month: number) {
    setAnchor((prev) => new Date(prev.getFullYear(), month, 1));
  }
  function jumpToYear(year: number) {
    setAnchor((prev) => new Date(year, prev.getMonth(), 1));
  }

  const headerLabel =
    view === "day"
      ? format(anchor, "EEEE, MMM d, yyyy")
      : view === "week"
      ? `${format(startOfWeek(anchor), "MMM d")} – ${format(endOfWeek(anchor), "MMM d, yyyy")}`
      : view === "year"
      ? format(anchor, "yyyy")
      : format(anchor, "MMMM yyyy");

  function Chip({ entry, compact }: { entry: DayEntry; compact?: boolean }) {
    const r = entry.request;
    const half = isWhollyHalfDayRow(r.start_date, r.end_date, r.days_count);
    return (
      <div
        title={`${r.employee_name ?? "Employee"} · ${r.leave_type}`}
        className={`truncate rounded border px-1.5 py-0.5 text-[10px] font-medium ${LEAVE_TYPE_COLORS[r.leave_type]} ${
          compact ? "" : "mb-1"
        }`}
      >
        {r.employee_name ?? "Employee"}
        {half ? " (½d)" : ""}
      </div>
    );
  }

  function MonthGrid({ monthAnchor, mini }: { monthAnchor: Date; mini?: boolean }) {
    const gridStart = startOfWeek(startOfMonth(monthAnchor));
    const gridEnd = endOfWeek(endOfMonth(monthAnchor));
    const days = eachDayOfInterval({ start: gridStart, end: gridEnd });
    return (
      <div className="grid grid-cols-7 gap-px bg-gray-100 rounded-lg overflow-hidden border border-gray-100">
        {!mini &&
          ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d} className="bg-gray-50 text-center text-[10px] font-semibold uppercase text-muted py-1.5">
              {d}
            </div>
          ))}
        {days.map((d) => {
          const entries = entriesFor(d);
          const inMonth = isSameMonth(d, monthAnchor);
          return (
            <button
              key={d.toISOString()}
              onClick={() => (mini ? setDayDetail(d) : entries.length > 0 && setDayDetail(d))}
              className={`bg-white text-left align-top ${mini ? "h-8 p-0.5" : "min-h-[3.5rem] p-1 sm:min-h-[5.5rem]"} ${
                inMonth ? "" : "bg-gray-50/60 text-gray-300"
              } hover:bg-accent/5 transition-colors`}
            >
              <div className="flex items-center justify-between gap-1">
                <span
                  className={`text-[11px] ${mini ? "text-[9px]" : ""} ${
                    isToday(d) ? "flex items-center justify-center h-4 w-4 rounded-full bg-accent text-white font-semibold" : "text-muted"
                  }`}
                >
                  {format(d, "d")}
                </span>
                {mini && entries.length > 0 && <span className="h-1.5 w-1.5 rounded-full bg-accent" />}
              </div>
              {!mini && entries.length > 0 && (
                <div className="mt-0.5 flex flex-wrap gap-0.5 sm:hidden">
                  {entries.slice(0, 4).map((e, i) => (
                    <span key={`${e.request.id}-${i}`} className={`h-1.5 w-1.5 rounded-full ${LEAVE_TYPE_DOT[e.request.leave_type]}`} />
                  ))}
                  {entries.length > 4 && <span className="text-[9px] text-accent font-medium">+{entries.length - 4}</span>}
                </div>
              )}
              {!mini && (
                <div className="mt-0.5 hidden flex-col gap-0.5 sm:flex">
                  {entries.slice(0, 3).map((e, i) => (
                    <Chip key={`${e.request.id}-${i}`} entry={e} />
                  ))}
                  {entries.length > 3 && (
                    <span className="text-[10px] text-accent font-medium">+{entries.length - 3} more</span>
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>
    );
  }

  function WeekView() {
    const start = startOfWeek(anchor);
    const days = eachDayOfInterval({ start, end: endOfWeek(anchor) });
    return (
      <div className="grid grid-cols-7 gap-1 sm:gap-2">
        {days.map((d) => {
          const entries = entriesFor(d);
          return (
          <div
            key={d.toISOString()}
            onClick={() => entries.length > 0 && setDayDetail(d)}
            className="min-h-[4.5rem] rounded-lg border border-gray-100 bg-white p-1 sm:min-h-[10rem] sm:p-2"
          >
            <p className={`truncate text-[10px] font-semibold mb-1 sm:text-xs sm:mb-1.5 ${isToday(d) ? "text-accent" : "text-muted"}`}>
              {format(d, "EEE d")}
            </p>
            {/* Named chips are unreadably narrow at 7-per-row on a phone —
                dots below sm, same trade-off as MonthGrid above. */}
            <div className="flex flex-wrap gap-0.5 sm:hidden">
              {entries.slice(0, 6).map((e, i) => (
                <span key={`${e.request.id}-${i}`} className={`h-1.5 w-1.5 rounded-full ${LEAVE_TYPE_DOT[e.request.leave_type]}`} />
              ))}
            </div>
            <div className="hidden flex-col gap-1 sm:flex">
              {entries.map((e, i) => (
                <Chip key={`${e.request.id}-${i}`} entry={e} />
              ))}
              {entries.length === 0 && <p className="text-[11px] text-gray-300 italic">—</p>}
            </div>
          </div>
          );
        })}
      </div>
    );
  }

  function DayView() {
    const entries = entriesFor(anchor);
    return (
      <div className="rounded-lg border border-gray-100 bg-white p-4 min-h-[8rem]">
        {entries.length === 0 ? (
          <p className="text-sm text-muted text-center py-6">Nobody is on leave this day.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {entries.map((e, i) => (
              <div key={`${e.request.id}-${i}`} className={`rounded-lg border px-3 py-2 ${LEAVE_TYPE_COLORS[e.request.leave_type]}`}>
                <p className="text-sm font-medium">{e.request.employee_name ?? "Employee"}</p>
                <p className="text-xs capitalize opacity-80">
                  {e.request.leave_type} ·{" "}
                  {isWhollyHalfDayRow(e.request.start_date, e.request.end_date, e.request.days_count)
                    ? "Half day"
                    : "Full day"}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  function YearView() {
    const months = Array.from({ length: 12 }, (_, i) => addMonths(startOfYear(anchor), i));
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {months.map((m) => (
          <div key={m.toISOString()} className="rounded-lg border border-gray-100 bg-white p-2">
            <p className="text-xs font-semibold text-center mb-1">{format(m, "MMMM")}</p>
            <MonthGrid monthAnchor={m} mini />
          </div>
        ))}
      </div>
    );
  }

  const dayDetailEntries = dayDetail ? entriesFor(dayDetail) : [];

  return (
    <div className="glass !p-0 overflow-hidden flex flex-col">
      <div className="px-5 py-4 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold flex items-center gap-2">
          <FaCalendarAlt className="text-accent h-4 w-4" /> Leave Calendar
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-lg border border-gray-200 overflow-hidden">
            <button onClick={() => navigate(-1)} className="p-1.5 hover:bg-gray-50 text-muted">
              <FaChevronLeft className="h-3 w-3" />
            </button>
            <button
              onClick={() => setAnchor(new Date())}
              className="px-2 py-1 text-xs font-medium hover:bg-gray-50 text-muted"
            >
              Today
            </button>
            <button onClick={() => navigate(1)} className="p-1.5 hover:bg-gray-50 text-muted">
              <FaChevronRight className="h-3 w-3" />
            </button>
          </div>
          <div className="flex items-center rounded-lg border border-gray-200 overflow-hidden text-xs font-medium">
            {(["day", "week", "month", "year"] as ViewMode[]).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-2.5 py-1.5 capitalize transition-colors ${
                  view === v ? "bg-accent text-white" : "hover:bg-gray-50 text-muted"
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      </div>
      {/* Abeer, 2026-11-27: "add one identifier at the top that blue means
          annual, red means sick, grey means unpaid" — legend for every
          color a day's chip/dot can show (including casual/other, which
          can still appear on old historical rows even though neither is
          offered on the New Request form anymore). */}
      <div className="px-5 py-2.5 border-b border-gray-100 flex flex-wrap items-center gap-x-4 gap-y-1.5">
        {(["annual", "sick", "unpaid", "casual", "other"] as LeaveType[]).map((t) => (
          <span key={t} className="flex items-center gap-1.5 text-xs text-muted">
            <span className={`h-2.5 w-2.5 rounded-full ${LEAVE_TYPE_DOT[t]}`} />
            <span className="capitalize">{t}</span>
          </span>
        ))}
      </div>
      <div className="p-4">
        {/* Abeer, 2026-11-27: "fix the dropdown of the month" — showing
            "November 2026" as plain text right next to a Month/Year
            dropdown that says the exact same thing was redundant and
            cluttered. The dropdowns ARE the header for month/year view now;
            the plain-text label only earns its place for day/week, where
            it's a precise range the two dropdowns alone can't express.
            "this calender dropdown of month and year is not proper react
            one fix that" — now the same custom Select component used
            everywhere else in the app, not a native <select>. */}
        <div className="flex flex-wrap items-center gap-2 mb-3">
          {(view === "day" || view === "week") && <p className="text-sm font-semibold">{headerLabel}</p>}
          <div className="flex items-center gap-1.5">
            {view !== "year" && (
              <Select
                value={String(anchor.getMonth())}
                onChange={(v) => jumpToMonth(Number(v))}
                options={MONTH_NAMES.map((m, i) => ({ value: String(i), label: m }))}
                className="w-36"
              />
            )}
            <Select
              value={String(anchor.getFullYear())}
              onChange={(v) => jumpToYear(Number(v))}
              options={yearOptions.map((y) => ({ value: String(y), label: String(y) }))}
              className="w-24"
            />
          </div>
        </div>
        {/* Abeer, 2026-11-26: "proper calender view so that we can see the
            proper months" — this used to force a 540px-wide grid inside a
            horizontal scroller, which meant the whole month was never
            visible at once on a phone. The 7-column grid now shrinks to
            fit any width on its own (each day cell switches from named
            chips to small dots below the `sm` breakpoint instead). */}
        {view === "month" && <MonthGrid monthAnchor={anchor} />}
        {view === "week" && <WeekView />}
        {view === "day" && <DayView />}
        {view === "year" && <YearView />}
      </div>

      <Modal
        open={!!dayDetail}
        onClose={() => setDayDetail(null)}
        title={dayDetail ? format(dayDetail, "EEEE, MMM d, yyyy") : ""}
      >
        {dayDetailEntries.length === 0 ? (
          <p className="text-sm text-muted">Nobody is on leave this day.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {dayDetailEntries.map((e, i) => (
              <div key={`${e.request.id}-${i}`} className={`rounded-lg border px-3 py-2 ${LEAVE_TYPE_COLORS[e.request.leave_type]}`}>
                <p className="text-sm font-medium">{e.request.employee_name ?? "Employee"}</p>
                <p className="text-xs capitalize opacity-80">
                  {e.request.leave_type} ·{" "}
                  {isWhollyHalfDayRow(e.request.start_date, e.request.end_date, e.request.days_count)
                    ? "Half day"
                    : "Full day"}
                </p>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}
