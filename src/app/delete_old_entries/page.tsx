import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import PageTransition from "@/components/PageTransition";
import DeleteOldEntriesClient from "./DeleteOldEntriesClient";

export const dynamic = "force-dynamic";

export default async function DeleteOldEntriesPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "admin") redirect("/login");

  const { count: totalEntries } = await supabaseAdmin
    .from("timesheet_entries")
    .select("*", { count: "exact", head: true });

  // Earliest/latest entry dates, so the admin can see the actual data
  // range before picking a month to delete.
  const [{ data: earliestRow }, { data: latestRow }] = await Promise.all([
    supabaseAdmin.from("timesheet_entries").select("entry_date").order("entry_date", { ascending: true }).limit(1),
    supabaseAdmin.from("timesheet_entries").select("entry_date").order("entry_date", { ascending: false }).limit(1),
  ]);
  const earliestDate = earliestRow?.[0]?.entry_date ?? null;
  const latestDate = latestRow?.[0]?.entry_date ?? null;

  // Per-month entry counts across the full data range — lets the admin see
  // exactly how much is in each month before deleting anything, instead of
  // guessing blind. Iterates from the EARLIEST to the LATEST real entry
  // date (not "today"), since employees can and do log entries for future
  // months (e.g. planning ahead) — anchoring this loop at today would
  // silently skip every month after today even though it has real data.
  // Capped at 36 months to keep this bounded.
  const monthCounts: { monthYear: string; count: number }[] = [];
  if (earliestDate && latestDate) {
    const [earliestY, earliestM] = earliestDate.split("-").map(Number);
    const [latestY, latestM] = latestDate.split("-").map(Number);
    const totalMonths = (latestY - earliestY) * 12 + (latestM - earliestM) + 1;
    const monthsToShow = Math.min(36, totalMonths);
    // Walk backward from the latest month so the most recent (including
    // future-dated) months are checked first, same ordering as before.
    for (let i = 0; i < monthsToShow; i++) {
      const d = new Date(latestY, latestM - 1 - i, 1);
      const y = d.getFullYear();
      const m = d.getMonth() + 1;
      const monthStr = String(m).padStart(2, "0");
      const startDate = `${y}-${monthStr}-01`;
      const lastDay = new Date(y, m, 0).getDate();
      const endDate = `${y}-${monthStr}-${String(lastDay).padStart(2, "0")}`;
      const { count } = await supabaseAdmin
        .from("timesheet_entries")
        .select("*", { count: "exact", head: true })
        .gte("entry_date", startDate)
        .lte("entry_date", endDate);
      if (count && count > 0) {
        monthCounts.push({ monthYear: `${y}-${monthStr}`, count });
      }
    }
  }

  return (
    <PageTransition>
      <DeleteOldEntriesClient
        totalEntries={totalEntries ?? 0}
        earliestDate={earliestDate}
        latestDate={latestDate}
        monthCounts={monthCounts}
      />
    </PageTransition>
  );
}
