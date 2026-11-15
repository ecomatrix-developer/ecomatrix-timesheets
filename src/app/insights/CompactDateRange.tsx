"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { format, parseISO } from "date-fns";
import { DayPicker, type DateRange as CalendarDateRange } from "react-day-picker";
import { getPresetDateRange, type DateRange, type DateRangePreset } from "@/lib/dateRange";
import { FaCalendarAlt, FaCheck, FaChevronDown } from "react-icons/fa";

const PRESET_OPTIONS: { value: DateRangePreset; label: string }[] = [
  { value: "7d", label: "Last 7 days" },
  { value: "14d", label: "Last 14 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "3m", label: "Last 3 months" },
  { value: "6m", label: "Last 6 months" },
  { value: "custom", label: "Custom range" },
];

function formatRangeDate(value: string): string {
  return format(parseISO(value), "LLL d, yyyy");
}

/**
 * A compact, fully client-side date-range control (no URL/router
 * involvement, unlike the top-level DateRangePicker) — used both for the
 * global filter bar and for each chart card's own independent range
 * override. Uses the same react-day-picker calendar as DateRangePicker
 * (not native <input type="date">, whose popup is the browser/OS's own
 * widget and looks inconsistent with the rest of the app) so picking a
 * custom range never triggers a server round trip or a jarring native UI.
 */
export default function CompactDateRange({
  value,
  onChange,
  className = "",
}: {
  value: DateRange;
  onChange: (next: DateRange) => void;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [panelRect, setPanelRect] = useState<{ top: number; left: number } | null>(null);
  const [draftFrom, setDraftFrom] = useState(value.from);
  const [draftTo, setDraftTo] = useState(value.to);
  const [calendarMonth, setCalendarMonth] = useState(() => parseISO(value.from));
  const [error, setError] = useState("");

  const updatePanelRect = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const panelWidth = Math.min(320, window.innerWidth - 16);
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - panelWidth - 8));
    setPanelRect({ top: rect.bottom + 6, left });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    updatePanelRect();
    window.addEventListener("scroll", updatePanelRect, true);
    window.addEventListener("resize", updatePanelRect);
    return () => {
      window.removeEventListener("scroll", updatePanelRect, true);
      window.removeEventListener("resize", updatePanelRect);
    };
  }, [open, updatePanelRect]);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (
        containerRef.current &&
        !containerRef.current.contains(target) &&
        panelRef.current &&
        !panelRef.current.contains(target)
      ) {
        setOpen(false);
      }
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

  function openPanel() {
    setDraftFrom(value.from);
    setDraftTo(value.to);
    setCalendarMonth(parseISO(value.from));
    setError("");
    setOpen(true);
  }

  function choosePreset(preset: DateRangePreset) {
    if (preset === "custom") return;
    onChange(getPresetDateRange(preset));
    setOpen(false);
  }

  function handleCalendarSelect(range: CalendarDateRange | undefined) {
    setError("");
    setDraftFrom(range?.from ? format(range.from, "yyyy-MM-dd") : "");
    setDraftTo(range?.to ? format(range.to, "yyyy-MM-dd") : "");
  }

  function applyCustomRange() {
    if (!draftFrom || !draftTo || draftFrom > draftTo) {
      setError("Choose a valid start and end date.");
      return;
    }
    onChange({ from: draftFrom, to: draftTo, preset: "custom" });
    setOpen(false);
  }

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : openPanel())}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-left shadow-sm transition-colors hover:bg-gray-50"
      >
        <FaCalendarAlt className="h-3 w-3 shrink-0 text-accent" />
        <span className="whitespace-nowrap font-medium text-foreground">
          {formatRangeDate(value.from)} – {formatRangeDate(value.to)}
        </span>
        <FaChevronDown className={`h-2.5 w-2.5 shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open &&
        panelRect &&
        createPortal(
          <div
            ref={panelRef}
            role="dialog"
            aria-label="Choose date range"
            style={{ position: "fixed", top: panelRect.top, left: panelRect.left, width: "min(320px, calc(100vw - 1rem))" }}
            className="z-[120] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl"
          >
            <div className="flex flex-wrap gap-1 border-b border-gray-100 p-2">
              {PRESET_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => choosePreset(option.value)}
                  className={`flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] transition-colors ${
                    value.preset === option.value
                      ? "bg-indigo-50 font-medium text-indigo-700"
                      : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                  }`}
                >
                  {option.label}
                  {value.preset === option.value && <FaCheck className="h-2.5 w-2.5" />}
                </button>
              ))}
            </div>

            <div className="p-2">
              <div className="mb-1.5 flex items-center justify-between gap-2 px-1 text-[11px] text-muted">
                <span>{draftFrom ? formatRangeDate(draftFrom) : "Start date"}</span>
                <span className="text-gray-300">to</span>
                <span>{draftTo ? formatRangeDate(draftTo) : "End date"}</span>
              </div>
              <DayPicker
                className="date-range-calendar"
                mode="range"
                selected={{ from: draftFrom ? parseISO(draftFrom) : undefined, to: draftTo ? parseISO(draftTo) : undefined }}
                onSelect={handleCalendarSelect}
                month={calendarMonth}
                onMonthChange={setCalendarMonth}
                numberOfMonths={1}
                weekStartsOn={1}
                showOutsideDays
              />
            </div>

            <div className="flex items-center justify-between gap-2 border-t border-gray-100 px-3 py-2">
              {error ? (
                <p role="alert" className="text-[11px] text-red-600">
                  {error}
                </p>
              ) : (
                <span className="text-[11px] text-muted">Pick a start and end date.</span>
              )}
              <div className="ml-auto flex items-center gap-2">
                <button type="button" onClick={() => setOpen(false)} className="btn-ghost px-2.5 py-1.5 text-[11px]">
                  Cancel
                </button>
                <button type="button" onClick={applyCustomRange} className="btn-primary px-2.5 py-1.5 text-[11px]">
                  Apply
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
