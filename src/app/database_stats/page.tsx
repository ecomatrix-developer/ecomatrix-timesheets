import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import PageTransition from "@/components/PageTransition";
import GlassCard from "@/components/GlassCard";
import CountUpStat from "@/components/CountUpStat";
import ReportTriggerPanel from "@/components/ReportTriggerPanel";
import DatabaseStatsClient from "./DatabaseStatsClient";
import { PAGE_SIZE } from "@/lib/constants";
import type { PublicUser, Project } from "@/lib/types";
import { FaDatabase } from "react-icons/fa";

export const dynamic = "force-dynamic";

async function countRows(table: string): Promise<number> {
  const { count, error } = await supabaseAdmin.from(table).select("*", { count: "exact", head: true });
  if (error) throw error;
  return count ?? 0;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = -1;
  do {
    value /= 1024;
    unitIndex++;
  } while (value >= 1024 && unitIndex < units.length - 1);
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

interface TableSizeRow {
  database_name: string;
  total_size_bytes: number;
  table_name: string;
  table_size_bytes: number;
}

export default async function DatabaseStatsPage({
  searchParams,
}: {
  searchParams: Promise<{ usersPage?: string; projectsPage?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "admin") redirect("/login");

  const resolvedSearchParams = await searchParams;
  const usersPage = Math.max(1, parseInt(resolvedSearchParams.usersPage ?? "1", 10) || 1);
  const projectsPage = Math.max(1, parseInt(resolvedSearchParams.projectsPage ?? "1", 10) || 1);

  const [users, projects, entries, submittedDays, submittedWeeks] = await Promise.all([
    countRows("users"),
    countRows("projects"),
    countRows("timesheet_entries"),
    countRows("submitted_days"),
    countRows("submitted_weeks"),
  ]);
  const totalRows = users + projects + entries + submittedDays + submittedWeeks;

  // Real on-disk size via the get_database_size_stats() RPC (see
  // supabase_patch_3_database_size_rpc.sql). Falls back gracefully to
  // row-count-only display if the function hasn't been created yet.
  const { data: sizeRows, error: sizeErr } = await supabaseAdmin.rpc("get_database_size_stats");
  const sizeStats: TableSizeRow[] | null = sizeErr ? null : (sizeRows as TableSizeRow[]);
  const totalSizeBytes = sizeStats?.[0]?.total_size_bytes ?? null;
  const tableSizes = sizeStats
    ? [...sizeStats]
        .filter((r) => !r.table_name.startsWith("staging_mongo_"))
        .sort((a, b) => b.table_size_bytes - a.table_size_bytes)
    : [];

  const usersFrom = (usersPage - 1) * PAGE_SIZE;
  const usersTo = usersFrom + PAGE_SIZE - 1;
  const { data: pagedUsers, count: usersCount, error: usersErr } = await supabaseAdmin
    .from("users")
    .select("id, mongo_id, username, name, role, created_at, updated_at", { count: "exact" })
    .order("username")
    .range(usersFrom, usersTo);
  if (usersErr) throw usersErr;

  const projectsFrom = (projectsPage - 1) * PAGE_SIZE;
  const projectsTo = projectsFrom + PAGE_SIZE - 1;
  const { data: pagedProjects, count: projectsCount, error: projectsErr } = await supabaseAdmin
    .from("projects")
    .select("*", { count: "exact" })
    .order("name")
    .range(projectsFrom, projectsTo);
  if (projectsErr) throw projectsErr;

  // Mirrors v1's "Monthly Entries (Last 6 Months)" breakdown — count
  // timesheet_entries whose entry_date falls in each of the last 6
  // calendar months, most recent first.
  const now = new Date();
  const monthlyStats: { label: string; count: number }[] = [];
  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    const monthStr = String(month).padStart(2, "0");
    const startDate = `${year}-${monthStr}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${year}-${monthStr}-${String(lastDay).padStart(2, "0")}`;
    const { count } = await supabaseAdmin
      .from("timesheet_entries")
      .select("*", { count: "exact", head: true })
      .gte("entry_date", startDate)
      .lte("entry_date", endDate);
    if (count && count > 0) {
      monthlyStats.push({ label: `${year}-${monthStr}`, count });
    }
  }

  return (
    <PageTransition>
      <div className="max-w-6xl mx-auto">
        <h1 className="text-2xl font-semibold mb-6 flex items-center gap-2">
          <FaDatabase className="text-accent" /> Database Statistics
        </h1>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
          <GlassCard>
            <CountUpStat value={users} label="Users" accent="#8b5cf6" />
          </GlassCard>
          <GlassCard>
            <CountUpStat value={projects} label="Projects" accent="#22d3ee" />
          </GlassCard>
          <GlassCard>
            <CountUpStat value={entries} label="Timesheet Entries" accent="#4ade80" />
          </GlassCard>
          <GlassCard>
            <CountUpStat value={submittedDays} label="Submitted Days" accent="#facc15" />
          </GlassCard>
          <GlassCard>
            <CountUpStat value={submittedWeeks} label="Submitted Weeks" accent="#fb923c" />
          </GlassCard>
          <GlassCard strong>
            <CountUpStat value={totalRows} label="Total Rows (all tables)" accent="#f472b6" />
          </GlassCard>
        </div>

        <GlassCard className="mb-6">
          <h2 className="font-semibold mb-3 text-sm">Database Storage</h2>
          {totalSizeBytes != null ? (
            <>
              <p className="text-2xl font-semibold mb-3">
                {formatBytes(totalSizeBytes)}{" "}
                <span className="text-sm font-normal text-muted">total on-disk size</span>
              </p>
              <div className="space-y-1.5">
                {tableSizes.map((t) => {
                  const pct = totalSizeBytes > 0 ? (t.table_size_bytes / totalSizeBytes) * 100 : 0;
                  return (
                    <div key={t.table_name} className="flex items-center gap-3 text-sm">
                      <span className="w-40 shrink-0 truncate text-muted">{t.table_name}</span>
                      <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-accent"
                          style={{ width: `${Math.max(pct, 1)}%` }}
                        />
                      </div>
                      <span className="w-20 shrink-0 text-right font-medium">
                        {formatBytes(t.table_size_bytes)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <p className="text-sm text-muted">
              Real on-disk size isn&apos;t available yet — run{" "}
              <code className="px-1 rounded bg-gray-100">supabase_patch_3_database_size_rpc.sql</code>{" "}
              in the Supabase SQL Editor once to enable this. Row counts above are still accurate.
            </p>
          )}
        </GlassCard>

        {monthlyStats.length > 0 && (
          <GlassCard className="mb-6">
            <h2 className="font-semibold mb-3 text-sm">Monthly Entries (Last 6 Months)</h2>
            <div className="flex flex-wrap gap-2">
              {monthlyStats.map((m) => (
                <div
                  key={m.label}
                  className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-sm"
                >
                  <span className="text-muted">{m.label}</span>
                  <span className="bg-accent text-white text-xs px-2 py-0.5 rounded-full">
                    {m.count}
                  </span>
                </div>
              ))}
            </div>
          </GlassCard>
        )}

        <div className="mb-6">
          <ReportTriggerPanel />
        </div>

        <DatabaseStatsClient
          users={(pagedUsers ?? []) as PublicUser[]}
          projects={(pagedProjects ?? []) as Project[]}
          usersPage={usersPage}
          usersTotalPages={Math.max(1, Math.ceil((usersCount ?? 0) / PAGE_SIZE))}
          usersTotal={usersCount ?? 0}
          projectsPage={projectsPage}
          projectsTotalPages={Math.max(1, Math.ceil((projectsCount ?? 0) / PAGE_SIZE))}
          projectsTotal={projectsCount ?? 0}
        />
      </div>
    </PageTransition>
  );
}
