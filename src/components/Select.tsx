"use client";

import { useEffect, useRef, useState, useLayoutEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { FaCheck, FaChevronDown } from "react-icons/fa";

export interface SelectOption {
  value: string;
  label: string;
}

/**
 * A fully custom, React-driven dropdown — replaces the native <select>
 * (which looks dated and inconsistent across browsers/OSes) everywhere in
 * the app. Keyboard-accessible (Enter/Space to open, Escape to close,
 * click-outside to close), animated open/close via Framer Motion, and
 * shows a checkmark next to the currently selected option.
 */
export default function Select({
  value,
  onChange,
  options,
  placeholder = "Select…",
  disabled,
  className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelRect, setPanelRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (
        containerRef.current &&
        !containerRef.current.contains(target) &&
        panelRef.current &&
        !panelRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Recompute the dropdown panel's screen position every time it opens — it
  // renders via a portal into document.body (see below) so it can't be
  // clipped by an ancestor's overflow:hidden/auto (e.g. a modal's scroll
  // container or a rounded table wrapper), which was cutting the panel off
  // or making it effectively unusable inside CommentModal's row table.
  const updatePanelRect = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    setPanelRect({ top: rect.bottom + 6, left: rect.left, width: rect.width });
  }, []);

  useLayoutEffect(() => {
    if (!isOpen) return;
    updatePanelRect();
    window.addEventListener("scroll", updatePanelRect, true);
    window.addEventListener("resize", updatePanelRect);
    return () => {
      window.removeEventListener("scroll", updatePanelRect, true);
      window.removeEventListener("resize", updatePanelRect);
    };
  }, [isOpen, updatePanelRect]);

  function handleSelect(optionValue: string) {
    onChange(optionValue);
    setIsOpen(false);
  }

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setIsOpen(false);
        }}
        className={`w-full flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl border bg-white text-sm font-medium text-left transition-all shadow-sm ${
          isOpen
            ? "ring-2 ring-accent border-accent"
            : "border-gray-200 hover:border-gray-300"
        } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
      >
        <span className={`truncate ${selected ? "text-foreground" : "text-gray-400 font-normal"}`}>
          {selected ? selected.label : placeholder}
        </span>
        <FaChevronDown
          className={`h-3 w-3 text-gray-400 transition-transform shrink-0 ${
            isOpen ? "rotate-180 text-accent" : ""
          }`}
        />
      </button>

      {isOpen &&
        panelRect &&
        createPortal(
          <AnimatePresence>
            <motion.div
              ref={panelRef}
              initial={{ opacity: 0, y: -4, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.98 }}
              transition={{ duration: 0.12 }}
              style={{
                position: "fixed",
                top: panelRect.top,
                left: panelRect.left,
                width: panelRect.width,
              }}
              className="z-[100] bg-white rounded-xl shadow-xl border border-gray-200 py-1.5 max-h-72 overflow-y-auto scrollbar-thin"
            >
              {options.length === 0 ? (
                <p className="px-3.5 py-2 text-sm text-muted">No options.</p>
              ) : (
                options.map((opt) => {
                  const isSelected = opt.value === value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => handleSelect(opt.value)}
                      className={`w-full flex items-center justify-between gap-2 px-3.5 py-2 text-sm text-left transition-colors ${
                        isSelected
                          ? "bg-accent/10 text-accent font-semibold"
                          : "text-foreground hover:bg-gray-50"
                      }`}
                    >
                      <span className="truncate">{opt.label}</span>
                      {isSelected && <FaCheck className="h-3 w-3 shrink-0" />}
                    </button>
                  );
                })
              )}
            </motion.div>
          </AnimatePresence>,
          document.body
        )}
    </div>
  );
}
