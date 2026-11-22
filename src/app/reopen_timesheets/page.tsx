import { redirect } from "next/navigation";
import { unstable_cache } from "next/cache";
import { getSession, isSuperAdminOnly } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAllUsers } from "@/lib/data";
import { PAGE_SIZE } from "@/lib/constants";
import PageTransition from "@/components/PageTransition";
import ReopenTimesheetsClient from "./ReopenTimesheetsClient";

export const dynamic = "force-dynamic";

// Abeer, 2026-11-23: "add proper caching to these pages ... reopen
// timesheets ... only leave reports, timesheets as without caching." Both
// read paths below (the month overview, and one month's filtered/paged
// submission list) are cached — reopenDayAction busts the
// "reopen-timesheets" tag so a just-reopened day disappears from the list
// immediately instead of waiting out the TTL.
const getReopenMonthOverviewUncached = async (): Promise<{ monthCounts: { monthYear: string; count: number }[] }> => {
  const [{ data: earliestRow }, { data: latestRow }] = await Promise.all([
    supabaseAdmin.from("submitted_days").select("entry_date").order("entry_date", { ascending: true }).limit(1),
    supabaseAdmin.from("submitted_days").select("entry_date").order("entry_date", { ascending: false }).limit(1),
  ]);
  const earliestDate = earliestRow?.[0]?.entry_date ?? null;
  const latestDate = latestRow?.[0]?.entry_date ?? null;

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
  return { monthCounts };
};
const getReopenMonthOverview = unstable_cache(getReopenMonthOverviewUncached, ["reopen-month-overview"], {
  revalidate: 60,
  tags: ["reopen-timesheets"],
});

interface ReopenMonthSubmissionsParams {
  effectiveStart: string;
  effectiveEnd: string;
  matchingEmployeeIds: string[] | null;
  page: number;
}

const getReopenMonthSubmissionsUncached = async ({
  effectiveStart,
  effectiveEnd,
  matchingEmployeeIds,
  page,
}: ReopenMonthSubmissionsParams): Promise<{
  rows: { employee_id: string; entry_date: string; total_hours: number; submitted_at: string }[];
  totalItems: number;
}> => {
  let countQuery = supabaseAdmin
    .from("submitted_days")
    .select("*", { count: "exact", head: true })
    .gte("entry_date", effectiveStart)
    .lte("entry_date", effectiveEnd);
  if (matchingEmployeeIds) countQuery = countQuery.in("employee_id", matchingEmployeeIds);
  const { count, error: countErr } = await countQuery;
  if (countErr) throw countErr;

  const totalItems = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const from = (safePage - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let rowsQuery = supabaseAdmin
    .from("submitted_days")
    .select("employee_id, entry_date, total_hours, submitted_at")
    .gte("entry_date", effectiveStart)
    .lte("entry_date", effectiveEnd);
  if (matchingEmployeeIds) rowsQuery = rowsQuery.in("employee_id", matchingEmployeeIds);
  const { data: rows, error } = await rowsQuery.order("submitted_at", { ascending: false }).range(from, to);
  if (error) throw error;

  return { rows: rows ?? [], totalItems };
};
const getReopenMonthSubmissions = unstable_cache(getReopenMonthSubmissionsUncached, ["reopen-month-submissions"], {
  revalidate: 30,
  tags: ["reopen-timesheets"],
});

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
  searchParams: Promise<{ month?: string; page?: string; search?: string; date?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  // Abeer, 2026-11-21: "admin reopen option i dont want that" — moved from
  // plain-admin-reachable to Super-Admin-only, matching the other 6 pages
  // already gated this way (database_stats, create_employee, ...).
  if (!isSuperAdminOnly(session)) redirect("/login");

  const resolvedSearchParams = await searchParams;
  const selectedMonth = resolvedSearchParams.month ?? null; // "YYYY-MM"
  const page = Math.max(1, parseInt(resolvedSearchParams.page ?? "1", 10) || 1);
  // Abeer, 2026-11-22: "Reopen timesheets - filters name, date!" — an
  // employee-name search and an exact-date filter, both scoped within the
  // already-selected month (this page never lists across months at once).
  const search = (resolvedSearchParams.search ?? "").trim();
  const dateFilter = (resolvedSearchParams.date ?? "").trim();

  if (!selectedMonth) {
    const { monthCounts } = await getReopenMonthOverview();
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

  const users = await getAllUsers();
  const userById = new Map(users.map((u) => [u.id, u]));

  // A date filter narrows the range to that single day; an out-of-month
  // date is simply left out of the range below rather than ever throwing
  // (the query just comes back empty).
  const effectiveStart = dateFilter || startDate;
  const effectiveEnd = dateFilter || endDate;

  // Name search has no column on submitted_days to filter by directly —
  // resolve it to the matching employee ids first and filter with .in(),
  // same pattern as other pages' name/search filters.
  const matchingEmployeeIds = search
    ? users.filter((u) => u.name.toLowerCase().includes(search.toLowerCase())).map((u) => u.id)
    : null;

  if (matchingEmployeeIds && matchingEmployeeIds.length === 0) {
    return (
      <PageTransition>
        <ReopenTimesheetsClient
          selectedMonth={selectedMonth}
          submissions={[]}
          page={1}
          totalPages={1}
          totalItems={0}
          search={search}
          date={dateFilter}
        />
      </PageTransition>
    );
  }

  const { rows, totalItems } = await getReopenMonthSubmissions({
    effectiveStart,
    effectiveEnd,
    matchingEmployeeIds,
    page,
  });
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);

  const submissions = rows.map((row) => ({
    employeeId: row.employee_id,
    employeeName: userById.get(row.employee_id)?.name ?? row.employee_id,
    date: row.entry_date,
    totalHours: Number(row.total_hours),
    submittedAt: row.submitted_at,
  }));

  return (
    <PageTransition>
      <ReopenTimesheetsClient
        selectedMonth={selectedMonth}
        submissions={submissions}
        page={safePage}
        totalPages={totalPages}
        totalItems={totalItems}
        search={search}
        date={dateFilter}
      />
    </PageTransition>
  );
}
