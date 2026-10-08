"use client";

import { useMemo, useState, useTransition } from "react";
import { motion } from "framer-motion";
import Modal from "@/components/Modal";
import { deleteOldEntriesAction } from "@/app/(actions)/adminActions";
import { toast } from "@/lib/toast";
import { FaExclamationTriangle, FaTrash, FaDatabase, FaCalendarAlt } from "react-icons/fa";

interface MonthCount {
  monthYear: string; // 'YYYY-MM'
  count: number;
}

export default function DeleteOldEntriesClient({
  totalEntries,
  earliestDate,
  latestDate,
  monthCounts,
}: {
  totalEntries: number;
  earliestDate: string | null;
  latestDate: string | null;
  monthCounts: MonthCount[];
}) {
  const [monthYear, setMonthYear] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [entryCount, setEntryCount] = useState(totalEntries);
  const [localMonthCounts, setLocalMonthCounts] = useState(monthCounts);

  const selectedCount = useMemo(
    () => localMonthCounts.find((m) => m.monthYear === monthYear)?.count ?? 0,
    [localMonthCounts, monthYear]
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!monthYear) return;
    setConfirmOpen(true);
  }

  function handleConfirm() {
    startTransition(async () => {
      const res = await deleteOldEntriesAction(monthYear);
      if (res.success) {
        toast.success(res.message);
        const match = /deleted (\d+)/.exec(res.message);
        const deleted = match ? parseInt(match[1], 10) : selectedCount;
        setEntryCount((prev) => Math.max(0, prev - deleted));
        setLocalMonthCounts((prev) => prev.filter((m) => m.monthYear !== monthYear));
        setMonthYear("");
      } else {
        toast.error(res.message);
      }
      setConfirmOpen(false);
    });
  }

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-2xl font-semibold mb-6 flex items-center gap-2 text-red-600">
        <FaExclamationTriangle /> Delete Old Timesheet Entries
      </h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-strong p-6 h-fit"
        >
          <div className="text-sm bg-amber-50 border border-amber-200 text-amber-900 rounded-lg px-3 py-2 mb-5 flex items-start gap-2">
            <FaExclamationTriangle className="mt-0.5 shrink-0" />
            <span>
              <strong>Warning:</strong> This permanently deletes every timesheet entry for
              a given month, across <strong>all</strong> employees. This action cannot be
              undone!
            </span>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="text-sm text-muted mb-1 block">Select Month and Year</label>
              <input
                type="month"
                required
                value={monthYear}
                onChange={(e) => setMonthYear(e.target.value)}
                min={earliestDate?.slice(0, 7)}
                max={latestDate?.slice(0, 7)}
                className="glass-input w-full px-3 py-2"
              />
            </div>

            {monthYear && (
              <div
                className={`text-sm rounded-lg px-3 py-2 border ${
                  selectedCount > 0
                    ? "bg-red-50 border-red-200 text-red-800"
                    : "bg-gray-50 border-gray-200 text-muted"
                }`}
              >
                {selectedCount > 0 ? (
                  <>
                    This will delete <strong>{selectedCount}</strong> entr
                    {selectedCount === 1 ? "y" : "ies"} logged in <strong>{monthYear}</strong>.
                  </>
                ) : (
                  <>No entries found for {monthYear} — nothing would be deleted.</>
                )}
              </div>
            )}

            <motion.button
              whileTap={{ scale: 0.97 }}
              type="submit"
              disabled={!monthYear || selectedCount === 0}
              className="btn-danger inline-flex items-center justify-center gap-2 py-2.5 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <FaTrash className="h-3.5 w-3.5" /> Delete Entries
            </motion.button>
          </form>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="glass !p-0 overflow-hidden flex flex-col"
        >
          <div className="px-5 py-3 border-b border-gray-100">
            <h2 className="font-semibold text-sm flex items-center gap-2">
              <FaDatabase className="text-accent" /> Database Overview
            </h2>
          </div>
          <div className="p-5">
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <p className="text-xs text-muted mb-1">Total Timesheet Entries</p>
                <p className="text-2xl font-bold text-accent">{entryCount}</p>
              </div>
              <div>
                <p className="text-xs text-muted mb-1 flex items-center gap-1">
                  <FaCalendarAlt className="h-3 w-3" /> Data Range
                </p>
                <p className="text-sm">
                  {earliestDate && latestDate ? (
                    <>
                      {earliestDate} <span className="text-muted">to</span> {latestDate}
                    </>
                  ) : (
                    "No entries yet"
                  )}
                </p>
              </div>
            </div>

            <p className="text-xs text-muted font-medium mb-2">Entries by Month</p>
            <div className="space-y-1.5 max-h-72 overflow-y-auto scrollbar-thin pr-1">
              {localMonthCounts.length === 0 ? (
                <p className="text-sm text-muted">No entries found.</p>
              ) : (
                localMonthCounts.map((m) => {
                  const maxCount = Math.max(...localMonthCounts.map((x) => x.count));
                  const pct = maxCount > 0 ? (m.count / maxCount) * 100 : 0;
                  return (
                    <button
                      key={m.monthYear}
                      type="button"
                      onClick={() => setMonthYear(m.monthYear)}
                      className={`w-full flex items-center gap-3 text-sm rounded-lg px-2 py-1.5 transition-colors ${
                        monthYear === m.monthYear ? "bg-accent/10" : "hover:bg-gray-50"
                      }`}
                    >
                      <span className="w-16 shrink-0 text-left">{m.monthYear}</span>
                      <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
                        <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(pct, 2)}%` }} />
                      </div>
                      <span className="w-10 shrink-0 text-right font-medium">{m.count}</span>
                    </button>
                  );
                })
              )}
            </div>

            <p className="text-xs text-muted mt-3">
              See{" "}
              <a href="/database_stats" className="text-accent hover:underline">
                Database Stats
              </a>{" "}
              for full row counts and storage size across every table.
            </p>
          </div>
        </motion.div>
      </div>

      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} title="Are you absolutely sure?">
        <p className="text-sm text-muted mb-4">
          This will permanently delete <strong>{selectedCount}</strong> timesheet entr
          {selectedCount === 1 ? "y" : "ies"} logged by <strong>any employee</strong> during{" "}
          <strong>{monthYear}</strong>. This action cannot be undone.
        </p>
        <div className="flex justify-end gap-2">
          <button className="btn-ghost px-4 py-2 text-sm" onClick={() => setConfirmOpen(false)}>
            Cancel
          </button>
          <button
            className="btn-danger px-4 py-2 text-sm"
            disabled={pending}
            onClick={handleConfirm}
          >
            {pending ? "Deleting…" : "Yes, delete everything"}
          </button>
        </div>
      </Modal>
    </div>
  );
}
