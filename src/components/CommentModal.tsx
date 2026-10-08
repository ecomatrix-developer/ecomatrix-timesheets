"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FaTimes, FaPlus, FaTrash } from "react-icons/fa";
import { COMMENT_CATEGORIES } from "@/lib/constants";
import Select from "@/components/Select";

export interface CommentRow {
  hours: number;
  category: string;
  detail?: string;
}

/**
 * Mirrors v1's two comment entry surfaces exactly:
 *  - Real project rows get the STRUCTURED modal (#commentModal): a table
 *    of {hours, category, detail?} rows. Saving replaces the grid cell's
 *    hours with the SUM of the modal's rows and stores the breakdown as a
 *    JSON string in the comment column (see saveCommentFromModal in v1).
 *  - Special-category rows (PTO, Vacation, etc.) get a plain free-text
 *    textarea instead (#simpleCommentModal) and do NOT touch the hours
 *    value — only the comment text changes.
 */
export default function CommentModal({
  open,
  onClose,
  isProject,
  initialComment,
  onSaveStructured,
  onSaveSimple,
}: {
  open: boolean;
  onClose: () => void;
  isProject: boolean;
  initialComment: string;
  onSaveStructured: (rows: CommentRow[], totalHours: number) => void;
  onSaveSimple: (text: string) => void;
}) {
  const [rows, setRows] = useState<CommentRow[]>([]);
  const [simpleText, setSimpleText] = useState("");

  useEffect(() => {
    if (!open) return;
    if (isProject) {
      try {
        const parsed = JSON.parse(initialComment);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setRows(parsed);
        } else {
          setRows([{ hours: 0, category: "" }]);
        }
      } catch {
        setRows([{ hours: 0, category: "" }]);
      }
    } else {
      setSimpleText(initialComment ?? "");
    }
  }, [open, isProject, initialComment]);

  function addRow() {
    setRows((prev) => [...prev, { hours: 0, category: "" }]);
  }

  function removeRow(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index));
  }

  function updateRow(index: number, patch: Partial<CommentRow>) {
    setRows((prev) =>
      prev.map((r, i) => {
        if (i !== index) return r;
        const next = { ...r, ...patch };
        // Matches v1's toggleOtherDetail(): switching away from "Other"
        // clears any detail text so it can't silently survive under a
        // different category.
        if (patch.category !== undefined && patch.category !== "Other") {
          next.detail = "";
        }
        return next;
      })
    );
  }

  function handleSaveStructured() {
    // Matches v1's saveCommentFromModal: only rows with hours > 0 are
    // kept, and the grid cell's new value is the sum of those hours.
    const kept = rows.filter((r) => r.hours > 0);
    const total = kept.reduce((s, r) => s + r.hours, 0);
    onSaveStructured(kept, total);
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ type: "spring", stiffness: 340, damping: 28 }}
            className={`relative glass-strong w-full ${
              isProject ? "max-w-2xl" : "max-w-md"
            } max-h-[85vh] overflow-y-auto scrollbar-thin text-foreground`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="font-semibold text-base">
                {isProject ? "Add Detailed Comment" : "Add Comment"}
              </h3>
              <button onClick={onClose} className="text-muted hover:text-foreground p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
                <FaTimes className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5">
              {isProject ? (
                <>
                  <p className="text-sm text-muted mb-4">
                    Log hours according to categories. The grid cell&apos;s total
                    will be updated to match the sum below.
                  </p>

                  <div className="rounded-xl border border-gray-200">
                    <div className="grid grid-cols-[88px_1fr_36px] sm:grid-cols-[96px_1fr_1fr_36px] gap-2 px-3 py-2 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-muted rounded-t-xl">
                      <span>Hours</span>
                      <span>Category</span>
                      <span className="hidden sm:block">Detail</span>
                      <span />
                    </div>
                    <div className="divide-y divide-gray-100">
                      {rows.map((row, i) => (
                        <div
                          key={i}
                          className={`grid grid-cols-[88px_1fr_36px] sm:grid-cols-[96px_1fr_1fr_36px] gap-2 px-3 py-2.5 items-start bg-white ${
                            i === rows.length - 1 ? "rounded-b-xl" : ""
                          }`}
                        >
                          <input
                            type="number"
                            min={0}
                            step={0.25}
                            value={row.hours || ""}
                            onChange={(e) =>
                              updateRow(i, { hours: parseFloat(e.target.value) || 0 })
                            }
                            placeholder="Hours"
                            className="glass-input w-full px-2 py-1.5 text-sm"
                          />
                          <Select
                            value={row.category}
                            onChange={(value) => updateRow(i, { category: value })}
                            placeholder="-- Select Category --"
                            options={COMMENT_CATEGORIES.map((c) => ({ value: c, label: c }))}
                          />
                          {row.category === "Other" ? (
                            <input
                              type="text"
                              value={row.detail ?? ""}
                              onChange={(e) => updateRow(i, { detail: e.target.value })}
                              placeholder="Specify details…"
                              className="glass-input col-span-2 sm:col-span-1 w-full px-2 py-1.5 text-sm"
                            />
                          ) : (
                            <div className="hidden sm:block" />
                          )}
                          <button
                            onClick={() => removeRow(i)}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50 p-1.5 rounded-lg transition-colors justify-self-end"
                            title="Remove row"
                          >
                            <FaTrash className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  <button
                    onClick={addRow}
                    className="btn-ghost inline-flex items-center gap-2 px-3 py-1.5 text-xs mt-3"
                  >
                    <FaPlus className="h-3 w-3" /> Add Row
                  </button>
                </>
              ) : (
                <textarea
                  value={simpleText}
                  onChange={(e) => setSimpleText(e.target.value)}
                  rows={5}
                  placeholder="Enter your comment here..."
                  className="glass-input w-full px-3 py-2 text-sm"
                />
              )}
            </div>

            <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-100">
              <button onClick={onClose} className="btn-ghost px-4 py-2 text-sm">
                Close
              </button>
              <button
                onClick={isProject ? handleSaveStructured : () => onSaveSimple(simpleText)}
                className="btn-primary px-4 py-2 text-sm"
              >
                Save Comment
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
