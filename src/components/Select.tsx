"use client";

import { useEffect, useRef, useState } from "react";
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
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.12 }}
            className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-white rounded-xl shadow-xl border border-gray-200 py-1.5 max-h-72 overflow-y-auto scrollbar-thin"
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
        )}
      </AnimatePresence>
    </div>
  );
}
