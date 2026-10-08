"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { toast } from "@/lib/toast";
import { FaPlay } from "react-icons/fa";

export default function ReportTriggerPanel() {
  const [busy, setBusy] = useState<string | null>(null);

  async function trigger(path: string, label: string) {
    setBusy(label);
    try {
      const res = await fetch(path, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        toast.error(`${label}: ${data?.error ?? data?.message ?? "failed"}`);
        return;
      }

      // The route always returns HTTP 200 even if every individual email
      // failed to send (e.g. SMTP/TLS issues) — the real per-recipient
      // outcome is only in data.results, so that must be checked here
      // rather than trusting res.ok alone.
      const results: { username?: string; emailed: boolean; reason?: string }[] | undefined = data?.results;
      if (Array.isArray(results) && results.length > 0) {
        const failed = results.filter((r) => !r.emailed);
        if (failed.length === results.length) {
          toast.error(`${label}: all ${failed.length} email(s) failed to send — ${failed[0].reason ?? "unknown error"}`);
        } else if (failed.length > 0) {
          toast.error(
            `${label}: ${results.length - failed.length}/${results.length} emails sent. Failed: ${failed
              .map((f) => f.username ?? "recipient")
              .join(", ")} (${failed[0].reason ?? "unknown error"})`
          );
        } else {
          toast.success(`${label}: completed — all ${results.length} email(s) sent.`);
        }
      } else if (data?.emailed === false) {
        toast.error(`${label}: email failed to send — ${data?.reason ?? "unknown error"}`);
      } else {
        toast.success(`${label}: completed.`);
      }
    } catch (err) {
      toast.error(`${label}: ${err instanceof Error ? err.message : "request failed"}`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="glass p-4">
      <h2 className="font-semibold mb-1">PDF Reports</h2>
      <p className="text-xs text-muted mb-4">
        Manually trigger the weekly per-employee backup emails or the owner&apos;s
        snapshot email. Both routes require an admin session (fixed vs v1, where
        these were open to any anonymous visitor).
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          disabled={!!busy}
          onClick={() => trigger("/api/reports/run-backup", "Run weekly backup")}
          className="btn-primary inline-flex items-center gap-2 text-sm px-4 py-2"
        >
          <FaPlay className="h-3 w-3" />
          {busy === "Run weekly backup" ? "Running…" : "Run Weekly Backup"}
        </button>
        <button
          disabled={!!busy}
          onClick={() => trigger("/api/reports/run-owner-report", "Run owner report")}
          className="btn-primary inline-flex items-center gap-2 text-sm px-4 py-2"
        >
          <FaPlay className="h-3 w-3" />
          {busy === "Run owner report" ? "Running…" : "Run Owner Report"}
        </button>
      </div>
    </motion.div>
  );
}
