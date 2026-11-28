"use client";

import Link from "next/link";
import {
  FaUsers,
  FaFileAlt,
  FaFolder,
  FaUmbrellaBeach,
  FaUpload,
  FaCalendarAlt,
  FaArrowRight,
  FaFileInvoiceDollar,
} from "react-icons/fa";

interface OnLeaveEntry {
  name: string;
  leaveType: string;
  half: boolean;
}

function StatTile({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  accent: string;
}) {
  return (
    <div className="glass p-4 relative overflow-hidden">
      <div className={`absolute left-0 top-0 h-full w-1 ${accent}`} />
      <div className="flex items-center gap-2 mb-1.5">
        <span className={`text-sm ${accent.replace("bg-", "text-")}`}>{icon}</span>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
      </div>
      <p className="text-2xl font-bold leading-none">{value}</p>
    </div>
  );
}

function QuickLink({
  href,
  icon,
  title,
  description,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="glass p-5 flex items-center gap-4 hover:bg-accent/5 hover:border-accent/30 transition-colors group"
    >
      <div className="h-11 w-11 shrink-0 rounded-xl bg-accent/10 text-accent flex items-center justify-center text-lg">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-sm">{title}</p>
        <p className="text-xs text-muted mt-0.5">{description}</p>
      </div>
      <FaArrowRight className="h-3.5 w-3.5 text-gray-300 group-hover:text-accent transition-colors shrink-0" />
    </Link>
  );
}

// Abeer, 2026-11-27: "for accountant this dashboard wont work, make some
// other dashboard for accountant so that its relevant" — the normal
// /dashboard is built entirely around timesheets and the project
// portfolio, neither of which an Accountant ever touches (their whole job
// surface is Documents + the Leaves View). This replaces that with stat
// tiles + quick links for exactly those two things instead.
export default function AccountantDashboardClient({
  totalEmployees,
  totalDocuments,
  totalFolders,
  onLeaveToday,
}: {
  totalEmployees: number;
  totalDocuments: number;
  totalFolders: number;
  onLeaveToday: OnLeaveEntry[];
}) {
  return (
    <div className="w-full">
      <h1 className="text-2xl font-semibold mb-1">Dashboard</h1>
      <p className="text-sm text-muted mb-6">Document records and leave usage, at a glance.</p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <StatTile icon={<FaUsers />} label="Employees" value={totalEmployees} accent="bg-blue-500" />
        <StatTile icon={<FaFileAlt />} label="Documents on File" value={totalDocuments} accent="bg-accent" />
        <StatTile icon={<FaFolder />} label="Folders" value={totalFolders} accent="bg-amber-500" />
        <StatTile icon={<FaUmbrellaBeach />} label="On Leave Today" value={onLeaveToday.length} accent="bg-rose-500" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
        <QuickLink
          href="/manage_documents"
          icon={<FaUpload />}
          title="Upload Documents"
          description="Open an employee's folders to view or upload their files."
        />
        <QuickLink
          href="/salary_slips"
          icon={<FaFileInvoiceDollar />}
          title="Salary Slips"
          description="Fill in a slip, preview it live, and send the PDF to My Documents."
        />
        <QuickLink
          href="/leave_overview"
          icon={<FaCalendarAlt />}
          title="Leaves View"
          description="Annual/Sick year-by-month breakdown for every employee."
        />
      </div>

      <div className="glass !p-0 overflow-hidden flex flex-col">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold flex items-center gap-2">
            <FaUmbrellaBeach className="text-accent h-4 w-4" /> On Leave Today
          </h2>
        </div>
        <div className="divide-y divide-gray-100">
          {onLeaveToday.length === 0 ? (
            <p className="text-sm text-muted text-center py-8">Nobody is on approved leave today.</p>
          ) : (
            onLeaveToday.map((entry, i) => (
              <div key={i} className="flex items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm truncate">{entry.name}</p>
                  <p className="text-xs text-muted capitalize">
                    {entry.leaveType}
                    {entry.half ? " · Half day" : ""}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
