"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { format, parseISO, isValid } from "date-fns";
import { DayPicker } from "react-day-picker";
import { FaCalendarAlt, FaChevronDown } from "react-icons/fa";

/**
 * A single-date popover picker — replaces the native <input type="date">
 * (whose calendar popup is the browser/OS's own widget: looks dated,
 * inconsistent across machines, and doesn't match the rest of the app's
 * UI) with the same react-day-picker calendar already used by
 * DateRangePicker/CompactDateRange. Value/onChange both use plain
 * "yyyy-MM-dd" strings so it drops into a form's hidden input exactly
 * like a native date input would.
 */
export default function DatePicker({
  value,
  onChange,
  name,
  placeholder = "Select date",
  disabled,
  required,
  minDate,
  className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  name?: string;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  minDate?: string;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [panelRect, setPanelRect] = useState<{ top: number; left: number } | null>(null);
  const parsedValue = value ? parseISO(value) : undefined;
  const selected = parsedValue && isValid(parsedValue) ? parsedValue : undefined;
  const [calendarMonth, setCalendarMonth] = useState(() => selected ?? new Date());

  const updatePanelRect = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const panelWidth = Math.min(300, window.innerWidth - 16);
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - panelWidth - 8));
    setPanelRect({ top: rect.bottom + 6, left });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    setCalendarMonth(selected ?? new Date());
    updatePanelRect();
    window.addEventListener("scroll", updatePanelRect, true);
    window.addEventListener("resize", updatePanelRect);
    return () => {
      window.removeEventListener("scroll", updatePanelRect, true);
      window.removeEventListener("resize", updatePanelRect);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, updatePanelRect]);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: MouseEvent) {
      const target = e.target as Node;
      if (
        containerRef.current &&
        !containerRef.current.contains(target) &&
        panelRef.current &&
        !panelRef.current.contains(target)
      ) {
        setOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  function handleSelect(day: Date | undefined) {
    if (!day) return;
    onChange(format(day, "yyyy-MM-dd"));
    setOpen(false);
  }

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {name && <input type="hidden" name={name} value={value} required={required} />}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={`w-full flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl border bg-white text-sm font-medium text-left transition-all shadow-sm ${
          open ? "ring-2 ring-accent border-accent" : "border-gray-200 hover:border-gray-300"
        } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
      >
        <span className={`flex items-center gap-2 ${selected ? "text-foreground" : "text-gray-400 font-normal"}`}>
          <FaCalendarAlt className="h-3.5 w-3.5 shrink-0 text-accent" />
          {selected ? format(selected, "LLL d, yyyy") : placeholder}
        </span>
        <FaChevronDown className={`h-3 w-3 text-gray-400 transition-transform shrink-0 ${open ? "rotate-180 text-accent" : ""}`} />
      </button>

      {open &&
        panelRect &&
        createPortal(
          <div
            ref={panelRef}
            role="dialog"
            aria-label="Choose date"
            style={{ position: "fixed", top: panelRect.top, left: panelRect.left, width: "min(300px, calc(100vw - 1rem))" }}
            className="z-[140] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl p-2"
          >
            <DayPicker
              className="date-range-calendar"
              mode="single"
              selected={selected}
              onSelect={handleSelect}
              month={calendarMonth}
              onMonthChange={setCalendarMonth}
              weekStartsOn={1}
              showOutsideDays
              disabled={minDate ? { before: parseISO(minDate) } : undefined}
            />
          </div>,
          document.body
        )}
    </div>
  );
}
