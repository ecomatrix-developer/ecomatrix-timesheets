import { redirect } from "next/navigation";
import { unstable_cache } from "next/cache";
import { getSession, isSuperAdminOnly } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAllProjects, getAllUsers } from "@/lib/data";
import PageTransition from "@/components/PageTransition";
import InsightsClient from "./InsightsClient";
import type { Project, PublicUser } from "@/lib/types";

export const dynamic = "force-dynamic";

const BATCH_SIZE = 1000;

/**
 * Fetches every timesheet_entries row (not date-scoped) in one parallel
 * batch of range() queries — PostgREST caps a single select at 1000 rows,
 * so a plain .select() here would silently truncate the real data. The
 * table is small at this company's scale (a few thousand rows), so
 * shipping the full history to the client and letting every chart filter
 * it in memory is both simpler and far more responsive than a server round
 * trip per filter tweak — it's what lets each chart card below carry its
 * own independent date-range override with zero network cost.
 */
async function getAllTimesheetEntriesForInsights() {
  const { count, error: countErr } = await supabaseAdmin
    .from("timesheet_entries")
    .select("*", { count: "exact", head: true });
  if (countErr) throw countErr;

  const total = count ?? 0;
  const batches = Math.max(1, Math.ceil(total / BATCH_SIZE));
  // .order("id") is required, not cosmetic: Postgres gives no row-order
  // guarantee across separate .range() calls without an explicit order, so
  // two batches of the same query can skip or duplicate rows at the
  // boundary once the table exceeds BATCH_SIZE rows (confirmed live — see
  // the identical fix in src/lib/ai/dataTools.ts).
  const results = await Promise.all(
    Array.from({ length: batches }, (_, i) =>
      supabaseAdmin
        .from("timesheet_entries")
        .select("project_id, category, employee_id, hours, comment, entry_date")
        .order("id")
        .range(i * BATCH_SIZE, i * BATCH_SIZE + BATCH_SIZE - 1)
    )
  );

  const entries: {
    project_id: string | null;
    category: string | null;
    employee_id: string;
    hours: number;
    comment: string | null;
    entry_date: string;
  }[] = [];
  for (const r of results) {
    if (r.error) throw r.error;
    entries.push(...(r.data ?? []));
  }
  return entries;
}

// Abeer, 2026-11-23: "add proper caching to these pages ... Insights ...
// only leave reports, timesheets as without caching." getAllProjects()/
// getAllUsers() themselves stay UNCACHED (Reports and the AI assistant's
// tools both depend on them staying live) — this wraps the RESULT of
// calling them, specific to this page, so Insights gets its own 60s-fresh
// cached snapshot without touching what those shared functions return
// anywhere else. No params, so there's exactly one cache entry.
const getInsightsDataUncached = async (): Promise<{
  projects: Project[];
  entries: Awaited<ReturnType<typeof getAllTimesheetEntriesForInsights>>;
  employees: { id: string; name: string }[];
}> => {
  const [projects, users, entries] = await Promise.all([
    getAllProjects(),
    getAllUsers(),
    getAllTimesheetEntriesForInsights(),
  ]);
  const employees = (users as PublicUser[])
    .filter((u) => u.role === "employee")
    .map((u) => ({ id: u.id, name: u.name }));
  return { projects, entries, employees };
};
const getInsightsData = unstable_cache(getInsightsDataUncached, ["insights-data"], {
  revalidate: 60,
  tags: ["insights"],
});

export default async function InsightsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!isSuperAdminOnly(session)) redirect("/login");

  const { projects, entries, employees } = await getInsightsData();

  return (
    <PageTransition>
      <InsightsClient entries={entries} projects={projects} employees={employees} />
    </PageTransition>
  );
}
