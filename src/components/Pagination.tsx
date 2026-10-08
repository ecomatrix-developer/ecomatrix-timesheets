"use client";

import { motion } from "framer-motion";
import { FaChevronLeft, FaChevronRight } from "react-icons/fa";

/**
 * Shared pagination control, 10 rows/page by convention across the app
 * (PAGE_SIZE lives in lib/constants.ts). Purely presentational — the
 * parent decides how page changes are applied (URL navigation for
 * server-paginated lists, or local state for client-paginated ones).
 */
export default function Pagination({
  page,
  totalPages,
  onPageChange,
  totalItems,
  pageSize,
}: {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  totalItems: number;
  pageSize: number;
}) {
  if (totalPages <= 1) return null;

  const start = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalItems);

  // Compact page-number list: first, last, current +/-1, with ellipses.
  const pages: (number | "ellipsis")[] = [];
  for (let p = 1; p <= totalPages; p++) {
    if (p === 1 || p === totalPages || Math.abs(p - page) <= 1) {
      pages.push(p);
    } else if (pages[pages.length - 1] !== "ellipsis") {
      pages.push("ellipsis");
    }
  }

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-1 py-3">
      <p className="text-xs text-muted">
        Showing <span className="font-medium text-foreground">{start}</span>–
        <span className="font-medium text-foreground">{end}</span> of{" "}
        <span className="font-medium text-foreground">{totalItems}</span>
      </p>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="btn-ghost h-8 w-8 flex items-center justify-center p-0 disabled:opacity-40 disabled:cursor-not-allowed"
          aria-label="Previous page"
        >
          <FaChevronLeft className="h-3 w-3" />
        </button>
        {pages.map((p, i) =>
          p === "ellipsis" ? (
            <span key={`e${i}`} className="px-1.5 text-xs text-muted">
              …
            </span>
          ) : (
            <motion.button
              key={p}
              whileTap={{ scale: 0.92 }}
              onClick={() => onPageChange(p)}
              className={`h-8 min-w-[2rem] px-2 rounded-lg text-xs font-medium transition-colors ${
                p === page
                  ? "text-white"
                  : "text-muted hover:text-foreground hover:bg-gray-100"
              }`}
              style={
                p === page
                  ? { background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)" }
                  : undefined
              }
            >
              {p}
            </motion.button>
          )
        )}
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="btn-ghost h-8 w-8 flex items-center justify-center p-0 disabled:opacity-40 disabled:cursor-not-allowed"
          aria-label="Next page"
        >
          <FaChevronRight className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
