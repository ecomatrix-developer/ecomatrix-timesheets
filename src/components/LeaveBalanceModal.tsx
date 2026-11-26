"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/Modal";
import DatePicker from "@/components/DatePicker";
import { toast } from "@/lib/toast";
import { upsertLeaveBalanceAction } from "@/app/(actions)/leaveBalanceActions";
import { DEFAULT_ANNUAL_LEAVE_DAYS, DEFAULT_SICK_LEAVE_DAYS, financialYearForDate } from "@/lib/leavePolicy";
import type { LeaveBalance } from "@/lib/types";
import { FaCalendarCheck } from "react-icons/fa";

/**
 * Shared Super-Admin-only "assign leave balance" modal — Abeer,
 * 2026-11-26: "superadmin will add the leaves from the manage roles ...
 * in the superadmin panel i want the leave page so that they have the
 * functionality to change the leaves from there as well." Used from both
 * ManageRolesClient (per-row button) and LeaveClient's admin balance
 * panel — identical form, identical action, so the two surfaces can never
 * drift apart.
 */
export default function LeaveBalanceModal({
  open,
  onClose,
  employee,
  initialBalance,
}: {
  open: boolean;
  onClose: () => void;
  employee: { id: string; name: string } | null;
  initialBalance?: LeaveBalance | null;
}) {
  const router = useRouter();
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [annualTotal, setAnnualTotal] = useState(String(DEFAULT_ANNUAL_LEAVE_DAYS));
  const [sickTotal, setSickTotal] = useState(String(DEFAULT_SICK_LEAVE_DAYS));
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    if (initialBalance) {
      setPeriodStart(initialBalance.period_start);
      setPeriodEnd(initialBalance.period_end);
      setAnnualTotal(String(initialBalance.annual_total));
      setSickTotal(String(initialBalance.sick_total));
    } else {
      const fy = financialYearForDate();
      setPeriodStart(fy.start);
      setPeriodEnd(fy.end);
      setAnnualTotal(String(DEFAULT_ANNUAL_LEAVE_DAYS));
      setSickTotal(String(DEFAULT_SICK_LEAVE_DAYS));
    }
  }, [open, initialBalance]);

  function save() {
    if (!employee) return;
    const annual = parseFloat(annualTotal);
    const sick = parseFloat(sickTotal);
    if (!periodStart || !periodEnd) {
      toast.error("Pick both a period start and end date.");
      return;
    }
    if (Number.isNaN(annual) || Number.isNaN(sick)) {
      toast.error("Annual and sick totals must be numbers.");
      return;
    }
    startTransition(async () => {
      const result = await upsertLeaveBalanceAction(employee.id, periodStart, periodEnd, annual, sick);
      if (result.success) {
        toast.success(result.message);
        onClose();
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  }

  return (
    <Modal open={open} onClose={onClose} title={`Leave balance — ${employee?.name ?? ""}`}>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted">
          Set this employee&apos;s annual/earned and sick leave totals for one financial-year
          period. Approved leave requests within this period are subtracted automatically.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm text-muted mb-1 block">Period start</label>
            <DatePicker value={periodStart} onChange={setPeriodStart} required placeholder="FY start date" />
          </div>
          <div>
            <label className="text-sm text-muted mb-1 block">Period end</label>
            <DatePicker
              value={periodEnd}
              onChange={setPeriodEnd}
              required
              placeholder="FY end date"
              minDate={periodStart || undefined}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm text-muted mb-1 block">Annual / Earned total</label>
            <input
              type="number"
              min={0}
              step={0.5}
              value={annualTotal}
              onChange={(e) => setAnnualTotal(e.target.value)}
              className="glass-input w-full px-3 py-2.5 text-sm"
            />
          </div>
          <div>
            <label className="text-sm text-muted mb-1 block">Sick total</label>
            <input
              type="number"
              min={0}
              step={0.5}
              value={sickTotal}
              onChange={(e) => setSickTotal(e.target.value)}
              className="glass-input w-full px-3 py-2.5 text-sm"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-ghost px-4 py-2 text-sm">
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={pending}
            className="btn-primary inline-flex items-center gap-2 px-4 py-2 text-sm"
          >
            <FaCalendarCheck className="h-3.5 w-3.5" /> {pending ? "Saving…" : "Save Balance"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
