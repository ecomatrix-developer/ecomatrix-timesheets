import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAllUsers } from "@/lib/data";
import { PAGE_SIZE } from "@/lib/constants";
import PageTransition from "@/components/PageTransition";
import ReopenTimesheetsClient from "./ReopenTimesheetsClient";

export const dynamic = "force-dynamic";

/**
 * Admin-only, all-employees "unlock a submitted day" view — mirrors v1's
 * "All Submitted Timesheets" table on its Reports page, but month-gated:
 * with no `month` in the URL this only runs two cheap count-only queries
 * (earliest/latest submitted_days date) plus one parallel batch of
 * head-count queries per month (same pattern as /delete_old_entries) —
 * no submission rows are ever fetched for that view. Only once an admin
 * clicks a specific month does the page fetch and paginate that month's
 * actual submitted_days rows for reopening.
 */
export default async function ReopenTimesheetsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; page?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "admin") redirect("/dashboard");

  const resolvedSearchParams = await searchParams;
  const selectedMonth = resolvedSearchParams.month ?? null; // "YYYY-MM"
  const page = Math.max(1, parseInt(resolvedSearchParams.page ?? "1", 10) || 1);

  if (!selectedMonth) {
    const [{ data: earliestRow }, { data: latestRow }] = await Promise.all([
      supabaseAdmin.from("submitted_days").select("entry_date").order("entry_date", { ascending: true }).limit(1),
      supabaseAdmin.from("submitted_days").select("entry_date").order("entry_date", { ascending: false }).limit(1),
    ]);
    const earliestDate = earliestRow?.[0]?.entry_date ?? null;
    const latestDate = latestRow?.[0]?.entry_date ?? null;

    // Walk backward from the latest month so the most recent one shows
    // first, same approach as /delete_old_entries — issue every month's
    // count query in one parallel batch instead of a serial loop. Capped
    // at 36 months to keep this bounded.
    let monthCounts: { monthYear: string; count: number }[] = [];
    if (earliestDate && latestDate) {
      const [earliestY, earliestM] = earliestDate.split("-").map(Number);
      const [latestY, latestM] = latestDate.split("-").map(Number);
      const totalMonths = (latestY - earliestY) * 12 + (latestM - earliestM) + 1;
      const monthsToShow = Math.min(36, totalMonths);
      const monthDefs = Array.from({ length: monthsToShow }, (_, i) => {
        const d = new Date(latestY, latestM - 1 - i, 1);
        const y = d.getFullYear();
        const m = d.getMonth() + 1;
        const monthStr = String(m).padStart(2, "0");
        const startDate = `${y}-${monthStr}-01`;
        const lastDay = new Date(y, m, 0).getDate();
        const endDate = `${y}-${monthStr}-${String(lastDay).padStart(2, "0")}`;
        return { monthYear: `${y}-${monthStr}`, startDate, endDate };
      });
      const counts = await Promise.all(
        monthDefs.map(({ startDate, endDate }) =>
          supabaseAdmin
            .from("submitted_days")
            .select("*", { count: "exact", head: true })
            .gte("entry_date", startDate)
            .lte("entry_date", endDate)
        )
      );
      monthCounts = monthDefs
        .map(({ monthYear }, i) => ({ monthYear, count: counts[i].count ?? 0 }))
        .filter((m) => m.count > 0);
    }

    return (
      <PageTransition>
        <ReopenTimesheetsClient selectedMonth={null} monthCounts={monthCounts} />
      </PageTransition>
    );
  }

  const [y, m] = selectedMonth.split("-").map(Number);
  const monthStr = String(m).padStart(2, "0");
  const startDate = `${y}-${monthStr}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const endDate = `${y}-${monthStr}-${String(lastDay).padStart(2, "0")}`;

  const [users, { count, error: countErr }] = await Promise.all([
    getAllUsers(),
    supabaseAdmin
      .from("submitted_days")
      .select("*", { count: "exact", head: true })
      .gte("entry_date", startDate)
      .lte("entry_date", endDate),
  ]);
  if (countErr) throw countErr;

  const totalItems = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const from = (safePage - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const { data: rows, error } = await supabaseAdmin
    .from("submitted_days")
    .select("employee_id, entry_date, total_hours, submitted_at")
    .gte("entry_date", startDate)
    .lte("entry_date", endDate)
    .order("submitted_at", { ascending: false })
    .range(from, to);
  if (error) throw error;

  const userById = new Map(users.map((u) => [u.id, u]));
  const submissions = (rows ?? []).map((row) => ({
    employeeId: row.employee_id as string,
    employeeName: userById.get(row.employee_id)?.name ?? row.employee_id,
    date: row.entry_date as string,
    totalHours: Number(row.total_hours),
    submittedAt: row.submitted_at as string,
  }));

  return (
    <PageTransition>
      <ReopenTimesheetsClient
        selectedMonth={selectedMonth}
        submissions={submissions}
        page={safePage}
        totalPages={totalPages}
        totalItems={totalItems}
      />
    </PageTransition>
  );
}
