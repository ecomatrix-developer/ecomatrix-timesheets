"use server";

import { requireAdmin } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { revalidatePath } from "next/cache";

export interface DeleteOldEntriesResult {
  success: boolean;
  message: string;
}

/**
 * Mirrors v1's /delete_old_entries: bulk-deletes an entire month's worth of
 * timesheet entries across ALL employees. v1 had no confirmation step before
 * this destructive action; v2 requires the client to show a confirm dialog
 * before calling this (see DeleteOldEntriesClient.tsx).
 */
export async function deleteOldEntriesAction(monthYear: string): Promise<DeleteOldEntriesResult> {
  await requireAdmin();

  const match = /^(\d{4})-(\d{2})$/.exec(monthYear);
  if (!match) {
    return { success: false, message: "Invalid month format. Expected YYYY-MM." };
  }
  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);

  const startDate = `${match[1]}-${match[2]}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const endDate = `${match[1]}-${match[2]}-${String(lastDay).padStart(2, "0")}`;

  const { error, count } = await supabaseAdmin
    .from("timesheet_entries")
    .delete({ count: "exact" })
    .gte("entry_date", startDate)
    .lte("entry_date", endDate);

  if (error) {
    return { success: false, message: `Error: ${error.message}` };
  }

  revalidatePath("/timesheet");
  revalidatePath("/reports");
  return {
    success: true,
    message: `Successfully deleted ${count ?? 0} timesheet entries for ${monthYear}.`,
  };
}
