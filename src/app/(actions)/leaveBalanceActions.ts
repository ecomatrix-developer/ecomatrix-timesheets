"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { requireSuperAdminOnly } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { financialYearLabelForPeriodStart } from "@/lib/leavePolicy";

export interface LeaveBalanceActionResult {
  success: boolean;
  message: string;
}

/**
 * Super-Admin-only. Assigns (or edits) one employee's leave allocation for
 * one financial-year period — Abeer, 2026-11-26: "superadmin will add the
 * leaves from the manage roles ... give a proper option like start date
 * end date and it will be for financial year." Callable from both the
 * Manage Roles table and the Leave page's balance-editor panel (same
 * LeaveBalanceModal component, same action).
 *
 * financial_year is derived from periodStart, not user-typed, so two rows
 * for the same employee covering the same FY always collide on the
 * (employee_id, financial_year) unique constraint and upsert cleanly
 * instead of creating an overlapping duplicate period.
 */
export async function upsertLeaveBalanceAction(
  employeeId: string,
  periodStart: string,
  periodEnd: string,
  annualTotal: number,
  sickTotal: number
): Promise<LeaveBalanceActionResult> {
  const session = await requireSuperAdminOnly();

  if (!periodStart || !periodEnd) {
    return { success: false, message: "Pick both a period start and end date." };
  }
  if (periodEnd <= periodStart) {
    return { success: false, message: "Period end must be after the period start." };
  }
  if (!Number.isFinite(annualTotal) || annualTotal < 0 || !Number.isFinite(sickTotal) || sickTotal < 0) {
    return { success: false, message: "Annual and sick totals must be non-negative numbers." };
  }

  const financialYear = financialYearLabelForPeriodStart(periodStart);

  const { error } = await supabaseAdmin.from("leave_balances").upsert(
    {
      employee_id: employeeId,
      financial_year: financialYear,
      period_start: periodStart,
      period_end: periodEnd,
      annual_total: annualTotal,
      sick_total: sickTotal,
      created_by: session.userId,
      updated_by: session.userId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "employee_id,financial_year" }
  );
  if (error) {
    if (error.code === "PGRST205") {
      return {
        success: false,
        message: "The leave balances table hasn't been set up yet. Contact your developer, then try again.",
      };
    }
    return { success: false, message: error.message };
  }

  revalidatePath("/leave");
  revalidatePath("/manage_roles");
  revalidateTag("leave-balances");
  return { success: true, message: `Leave balance saved for FY ${financialYear}.` };
}
