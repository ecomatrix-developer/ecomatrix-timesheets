"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { format, parseISO } from "date-fns";
import { DayPicker, type DateRange as CalendarDateRange } from "react-day-picker";
import { getPresetDateRange, type DateRangePreset } from "@/lib/dateRange";
import { FaCalendarAlt, FaCheck, FaChevronDown } from "react-icons/fa";

const PRESET_OPTIONS: { value: DateRangePreset; label: string }[] = [
  { value: "7d", label: "Last 7 days" },
  { value: "14d", label: "Last 14 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "3m", label: "Last 3 months" },
  { value: "6m", label: "Last 6 months" },
  { value: "custom", label: "Custom range" },
];

const PAGINATION_PARAMS = ["page", "submissionsPage", "totalsPage", "psPage", "usersPage", "projectsPage"];

function presetLabel(preset: DateRangePreset): string {
  return PRESET_OPTIONS.find((option) => option.value === preset)?.label ?? "Choose dates";
}

function formatRangeDate(value: string): string {
  return format(parseISO(value), "LLL d, yyyy");
}

export default function DateRangePicker({
  from: initialFrom,
  to: initialTo,
  preset: initialPreset,
}: {
  from: string;
  to: string;
  preset: DateRangePreset;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const rootRef = useRef<HTMLDivElement>(null);
  const [preset, setPreset] = useState(initialPreset);
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [calendarMonth, setCalendarMonth] = useState(parseISO(initialFrom));
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setPreset(initialPreset);
    setFrom(initialFrom);
    setTo(initialTo);
    setCalendarMonth(parseISO(initialFrom));
  }, [initialFrom, initialTo, initialPreset]);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  function handlePresetChange(value: DateRangePreset) {
    setPreset(value);
    setError("");
    if (value !== "custom") {
      const range = getPresetDateRange(value);
      setFrom(range.from);
      setTo(range.to);
      setCalendarMonth(parseISO(range.from));
    }
  }

  function handleCalendarSelect(range: CalendarDateRange | undefined) {
    setPreset("custom");
    setError("");
    setFrom(range?.from ? format(range.from, "yyyy-MM-dd") : "");
    setTo(range?.to ? format(range.to, "yyyy-MM-dd") : "");
  }

  function applyRange() {
    if (!from || !to || from > to) {
      setError("Choose a valid start and end date.");
      return;
    }
    const params = new URLSearchParams(searchParams.toString());
    params.set("datePreset", preset);
    params.set("dateFrom", from);
    params.set("dateTo", to);
    for (const key of PAGINATION_PARAMS) params.delete(key);
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
    router.refresh();
    setOpen(false);
  }

  function cancelRange() {
    setPreset(initialPreset);
    setFrom(initialFrom);
    setTo(initialTo);
    setCalendarMonth(parseISO(initialFrom));
    setError("");
    setOpen(false);
  }

  return (
    <div ref={rootRef} className="relative flex justify-end">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Date range: ${presetLabel(initialPreset)}, ${formatRangeDate(initialFrom)} to ${formatRangeDate(initialTo)}`}
        className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-left shadow-sm transition-colors hover:bg-gray-50"
      >
        <FaCalendarAlt className="h-4 w-4 shrink-0 text-accent" />
        <span className="flex min-w-0 flex-col">
          <span className="text-[10px] leading-tight text-muted">{presetLabel(initialPreset)}</span>
          <span className="whitespace-nowrap text-xs font-medium text-foreground">
            {formatRangeDate(initialFrom)} - {formatRangeDate(initialTo)}
          </span>
        </span>
        <FaChevronDown className={`ml-1 h-3 w-3 shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Choose date range"
          className="absolute right-0 top-full z-[70] mt-2 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl"
          style={{ width: "min(740px, calc(100vw - 2rem))" }}
        >
          <div className="flex flex-col md:flex-row">
            <div className="w-full shrink-0 border-b border-gray-100 p-3 md:w-40 md:border-b-0 md:border-r">
              <p className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-wide text-muted">Quick ranges</p>
              <div className="flex flex-wrap gap-1 md:flex-col">
                {PRESET_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => handlePresetChange(option.value)}
                    className={`flex items-center justify-between gap-2 rounded-md px-2.5 py-2 text-left text-xs transition-colors ${
                      preset === option.value
                        ? "bg-indigo-50 font-medium text-indigo-700"
                        : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                    }`}
                  >
                    {option.label}
                    {preset === option.value && <FaCheck className="h-3 w-3 shrink-0" />}
                  </button>
                ))}
              </div>
            </div>

            <div className="min-w-0 flex-1 overflow-x-auto p-3 sm:p-4">
              <div className="mb-2 flex items-center justify-between gap-3 px-1 text-xs text-muted">
                <span>{from ? formatRangeDate(from) : "Start date"}</span>
                <span className="text-gray-300">to</span>
                <span>{to ? formatRangeDate(to) : "End date"}</span>
              </div>
              <DayPicker
                className="date-range-calendar"
                mode="range"
                selected={{ from: from ? parseISO(from) : undefined, to: to ? parseISO(to) : undefined }}
                onSelect={handleCalendarSelect}
                month={calendarMonth}
                onMonthChange={setCalendarMonth}
                numberOfMonths={2}
                weekStartsOn={1}
                showOutsideDays
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 px-4 py-3">
            {error ? <p role="alert" className="w-full text-xs text-red-600">{error}</p> : <span className="text-xs text-muted">Select a preset or choose dates on the calendar.</span>}
            <div className="ml-auto flex items-center gap-2">
              <button type="button" onClick={cancelRange} className="btn-ghost px-3 py-2 text-xs">Cancel</button>
              <button type="button" onClick={applyRange} className="btn-primary px-3 py-2 text-xs">Apply range</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}