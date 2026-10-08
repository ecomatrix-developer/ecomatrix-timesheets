"use client";

import { motion } from "framer-motion";
import { FaExclamationTriangle } from "react-icons/fa";

/**
 * The visual body of a confirm-style toast (see lib/toast.ts's
 * confirmToast helper) — replaces window.confirm() with something that
 * matches the app's design system instead of a native browser dialog.
 */
export default function ConfirmToast({
  visible,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -12, scale: 0.96 }}
      animate={{
        opacity: visible ? 1 : 0,
        y: visible ? 0 : -12,
        scale: visible ? 1 : 0.96,
      }}
      transition={{ duration: 0.2 }}
      className="bg-white rounded-xl shadow-lg border border-gray-200 px-4 py-3.5 max-w-sm w-full flex flex-col gap-3"
      style={{ borderLeft: "4px solid #f59e0b" }}
    >
      <div className="flex items-start gap-2.5">
        <FaExclamationTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
        <p className="text-sm text-gray-800">{message}</p>
      </div>
      <div className="flex justify-end gap-2">
        <button
          onClick={onCancel}
          className="btn-ghost px-3 py-1.5 text-xs"
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          className="btn-danger px-3 py-1.5 text-xs"
        >
          {confirmLabel}
        </button>
      </div>
    </motion.div>
  );
}
