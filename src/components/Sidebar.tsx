"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import {
  FaTachometerAlt,
  FaClock,
  FaProjectDiagram,
  FaDatabase,
  FaChartBar,
  FaChartPie,
  FaEnvelope,
  FaSignOutAlt,
  FaBars,
  FaTimes,
  FaFileExcel,
  FaLockOpen,
  FaUserShield,
  FaFileAlt,
  FaUpload,
  FaCalendarAlt,
  FaInbox,
  FaRobot,
  FaBuilding,
} from "react-icons/fa";
import type { IconType } from "react-icons";
import type { SessionPayload } from "@/lib/types";
import { logoutAction } from "@/app/(actions)/authActions";
import NotificationBell from "@/components/NotificationBell";

// No Projects here: /projects has always redirected non-admins straight to
// /dashboard (see src/app/projects/page.tsx), so an employee could never
// actually open it — the link was just dead weight in their nav.
const employeeLinks: { href: string; label: string; Icon: IconType }[] = [
  { href: "/dashboard", label: "Dashboard", Icon: FaTachometerAlt },
  { href: "/timesheet", label: "Timesheet", Icon: FaClock },
  { href: "/leave", label: "Leave", Icon: FaCalendarAlt },
];

// Today's full admin set == v3.0's Super Admin set (confirmed against the
// brief: Dashboard, Timesheets, Projects, Reopen Timesheets, Employees &
// Roles (formerly two separate Create Employee / Manage Roles links,
// merged 2026-11-21), Database Stats (now also where Delete Old Entries
// lives, merged in as its last section, 2026-11-21 — no separate link),
// Reports, Insights, Export Timesheets). Kept as one constant so the
// pre-migration fallback below and the explicit super_admin branch render
// byte-identical nav.
const superAdminLinks: { href: string; label: string; Icon: IconType }[] = [
  { href: "/dashboard", label: "Dashboard", Icon: FaTachometerAlt },
  { href: "/timesheet", label: "Timesheet", Icon: FaClock },
  { href: "/projects", label: "Projects", Icon: FaProjectDiagram },
  { href: "/clients", label: "Clients", Icon: FaBuilding },
  { href: "/leave", label: "Leave", Icon: FaCalendarAlt },
  { href: "/manage_roles", label: "Employees & Roles", Icon: FaUserShield },
  { href: "/contact_submissions", label: "Inbox", Icon: FaInbox },
  { href: "/database_stats", label: "Database Stats", Icon: FaDatabase },
  { href: "/reports", label: "Reports", Icon: FaChartBar },
  { href: "/reopen_timesheets", label: "Reopen Timesheets", Icon: FaLockOpen },
  { href: "/insights", label: "Insights", Icon: FaChartPie },
  { href: "/export_timesheet", label: "Export Timesheet", Icon: FaFileExcel },
  // Abeer, 2026-11-22: "Chats alag se karna h, jaha ai agent ki chats
  // dikhe create a new page only for super admins" — a standalone page
  // for every admin's AI assistant conversation history, Super-Admin-only
  // like Inbox/Database Stats/Reopen Timesheets above.
  { href: "/ai_chats", label: "AI Chats", Icon: FaRobot },
];

// Same as superAdminLinks, plus Upload Documents/My Documents — used only
// once a session genuinely has accessLevel === "super_admin" (i.e. after
// the migration + a fresh login), never for the pre-migration fallback,
// so nobody sees those two appear until they're actually usable.
const superAdminLinksV3: { href: string; label: string; Icon: IconType }[] = [
  ...superAdminLinks,
  { href: "/manage_documents", label: "Upload Documents", Icon: FaUpload },
  { href: "/my_documents", label: "My Documents", Icon: FaFileAlt },
];

// Abeer, 2026-11-21, while still building pre-migration: "remove create
// employee and database stats and Insights Export Timesheet Delete Old
// Entries from the admin logins no need of these there." Every current
// admin-role login renders THIS list (see the `!session.accessLevel`
// branch below) since access_level hasn't been assigned to anyone yet —
// superAdminLinks/superAdminLinksV3 above are untouched and still match
// the brief exactly, so a real Super Admin gets the full set back the
// moment patch_7b runs and assigns them that access level. No Inbox here
// (2026-11-22: "remove inbox from admins") — Super-Admin-only now.
const adminLinksPreMigration: { href: string; label: string; Icon: IconType }[] = [
  { href: "/dashboard", label: "Dashboard", Icon: FaTachometerAlt },
  { href: "/timesheet", label: "Timesheet", Icon: FaClock },
  { href: "/projects", label: "Projects", Icon: FaProjectDiagram },
  { href: "/leave", label: "Leave", Icon: FaCalendarAlt },
  { href: "/reports", label: "Reports", Icon: FaChartBar },
];

// v3.0 Admin (flat tier, no team scoping): everything a User gets, plus
// project creation, org-wide — but NOT reopening timesheets (moved to
// Super-Admin-only, 2026-11-21), NOT Inbox (moved to Super-Admin-only,
// 2026-11-22: "remove inbox from admins"), and NOT the other
// Super-Admin-only screens (create employee, database stats, reports,
// insights, export, delete old entries) and NOT other people's documents
// (only Super Admin and the document's own employee can ever see those).
const adminLinksV3: { href: string; label: string; Icon: IconType }[] = [
  { href: "/dashboard", label: "Dashboard", Icon: FaTachometerAlt },
  { href: "/timesheet", label: "Timesheet", Icon: FaClock },
  { href: "/projects", label: "Projects", Icon: FaProjectDiagram },
  { href: "/leave", label: "Leave", Icon: FaCalendarAlt },
  { href: "/my_documents", label: "My Documents", Icon: FaFileAlt },
];

// v3.0 plain User tier (Employee/Intern/Accountant) — same pages as
// today's employee nav, plus My Documents. Kept separate from the
// pre-migration `employeeLinks` fallback below so that fallback stays
// byte-identical to today's actual rendered nav.
const userLinksV3: { href: string; label: string; Icon: IconType }[] = [
  ...employeeLinks,
  { href: "/my_documents", label: "My Documents", Icon: FaFileAlt },
];

// v3.0 Consultants: "timesheets only" per the brief — no project browsing
// (their timesheet's own project dropdown is scoped to assigned projects
// only, once that's built), plus My Documents (their own MSA/letters).
const consultantLinks: { href: string; label: string; Icon: IconType }[] = [
  { href: "/dashboard", label: "Dashboard", Icon: FaTachometerAlt },
  { href: "/timesheet", label: "Timesheet", Icon: FaClock },
  { href: "/my_documents", label: "My Documents", Icon: FaFileAlt },
];

// Abeer, 2026-11-27: "for the accountant login, make it like a custom
// dashboard... the pages options would be, dashboard, upload documents,
// all users doc view... and leaves view" — a deliberately different,
// smaller nav than every other User-tier type: no Timesheet/Projects,
// just the three things an Accountant actually needs. "Upload Documents"
// is the same /manage_documents flow Super Admin uses (pick an employee,
// then their folders) — now open to Accountant too (see
// isSuperAdminOrAccountant in session.ts).
const accountantLinks: { href: string; label: string; Icon: IconType }[] = [
  { href: "/dashboard", label: "Dashboard", Icon: FaTachometerAlt },
  { href: "/manage_documents", label: "Upload Documents", Icon: FaUpload },
  { href: "/leave_overview", label: "Leaves View", Icon: FaCalendarAlt },
];

export default function Sidebar({
  session,
  notificationCounts = { contactUnread: 0, leavePending: 0 },
}: {
  session: SessionPayload;
  notificationCounts?: { contactUnread: number; leavePending: number };
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  // No accessLevel on the session yet (pre-migration, or logged in before
  // patch_7 landed) → render what this page has always rendered, PLUS "My
  // Documents" — the document portal (patch_8) is a separate migration
  // from the role columns and doesn't depend on accessLevel being set, so
  // it should show up for everyone the moment patch_8 has been run,
  // regardless of role-migration status. Everything else here stays
  // byte-for-byte what it always was.
  const links = (() => {
    if (!session.accessLevel) {
      const base = session.role === "admin" ? adminLinksPreMigration : employeeLinks;
      return [...base, { href: "/my_documents", label: "My Documents", Icon: FaFileAlt }];
    }
    if (session.accessLevel === "super_admin") return superAdminLinksV3;
    if (session.accessLevel === "admin") return adminLinksV3;
    if (session.userType === "consultant") return consultantLinks;
    if (session.userType === "accountant") return accountantLinks;
    return userLinksV3;
  })();

  // Abeer, 2026-11-21: "remove contact us from super admin." Mirrors
  // session.ts's isSuperAdminOnly() logic inline — that helper itself
  // can't be imported here, since its module is marked server-only and
  // this is a client component.
  const hideContactUs = session.accessLevel
    ? session.accessLevel === "super_admin"
    : session.role === "admin";

  // Strict Super-Admin-only (2026-11-22: "remove notifications icon from
  // admin panel") — no legacy-role fallback here, unlike most other
  // checks in this file: a plain Admin must never see this, migrated or
  // not, so this doesn't fall back to treating an unmigrated `role ===
  // "admin"` account as Super Admin the way isSuperAdminOnly() does
  // elsewhere. Both counts the bell shows (Inbox unread, pending leave)
  // are already Super-Admin-only server-side, so a plain Admin would only
  // ever see an empty bell anyway.
  const showNotificationBell = session.accessLevel === "super_admin";

  async function handleLogout() {
    await logoutAction();
    router.push("/login");
    router.refresh();
  }

  const NavList = (
    <ul className="flex flex-col gap-1.5 px-2">
      {links.map((link) => {
        const active = pathname === link.href || pathname.startsWith(link.href + "/");
        return (
          <li key={link.href}>
            <Link
              href={link.href}
              onClick={() => setMobileOpen(false)}
              title={link.label}
              className={`relative flex items-center gap-3.5 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
                active ? "bg-white/25 text-white shadow-xs" : "text-white/80 hover:bg-white/10 hover:text-white"
              }`}
            >
              <link.Icon className="h-5 w-5 shrink-0" />
              <span className="truncate whitespace-nowrap">
                {link.label}
              </span>
            </Link>
          </li>
        );
      })}
      {!hideContactUs && (
        <li className="mt-2 border-t border-white/10 pt-2">
          <Link
            href="/contact"
            onClick={() => setMobileOpen(false)}
            title="Contact Us"
            className="flex items-center gap-3.5 rounded-xl px-3 py-2.5 text-sm font-medium text-white/80 hover:bg-white/10 hover:text-white transition-colors"
          >
            <FaEnvelope className="h-5 w-5 shrink-0" />
            <span className="truncate whitespace-nowrap">
              Contact Us
            </span>
          </Link>
        </li>
      )}
      <li className={hideContactUs ? "mt-2 border-t border-white/10 pt-2" : undefined}>
        <button
          onClick={handleLogout}
          title="Logout"
          className="w-full flex items-center gap-3.5 rounded-xl px-3 py-2.5 text-sm font-medium text-white/80 hover:bg-white/10 hover:text-white transition-colors text-left"
        >
          <FaSignOutAlt className="h-5 w-5 shrink-0" />
          <span className="truncate whitespace-nowrap">
            Logout
          </span>
        </button>
      </li>
    </ul>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className="hidden md:flex flex-col fixed left-0 top-0 bottom-0 z-40 w-64 shadow-2xl overflow-y-auto scrollbar-none"
        style={{ background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)" }}
      >
        <div className="flex min-h-full flex-col pt-6">
          <div className="mb-6 px-4 whitespace-nowrap">
            <div className="relative h-11 w-full rounded bg-white p-1">
              <Image
                src="/logo.png"
                alt="Eco Matrix Engineering"
                fill
                className="object-contain object-left p-1"
                sizes="224px"
                priority
              />
            </div>
            <div className="flex items-center justify-between gap-2 mt-2 px-1">
              <p className="text-white/70 text-xs truncate text-left">
                Welcome, {session.name}
              </p>
              {showNotificationBell && (
                <NotificationBell initialCounts={notificationCounts} />
              )}
            </div>
          </div>
          <nav className="flex-1">{NavList}</nav>
        </div>
      </aside>

      {/* Mobile top bar */}
      <div
        className="md:hidden fixed top-0 left-0 right-0 z-40 flex items-center justify-between px-4 py-3 shadow"
        style={{ background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)" }}
      >
        <div className="relative h-8 w-40 rounded bg-white p-1">
          <Image src="/logo.png" alt="Eco Matrix Engineering" fill className="object-contain object-left p-1" sizes="160px" priority />
        </div>
        <div className="flex items-center gap-1">
          {showNotificationBell && <NotificationBell initialCounts={notificationCounts} />}
          <button
            className="text-white p-2"
            onClick={() => setMobileOpen((o) => !o)}
            aria-label="Toggle menu"
          >
            {mobileOpen ? <FaTimes className="h-5 w-5" /> : <FaBars className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="md:hidden fixed inset-0 z-30 bg-black/50"
              onClick={() => setMobileOpen(false)}
            />
            <motion.aside
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", stiffness: 320, damping: 34 }}
              className="md:hidden fixed left-0 top-0 bottom-0 z-40 w-72 group"
              style={{ background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)" }}
            >
              <div className="flex h-full flex-col pt-6">
                <div className="mb-6 px-4">
                  <div className="relative h-9 w-44 mb-2 rounded bg-white p-1">
                    <Image
                      src="/logo.png"
                      alt="Eco Matrix Engineering"
                      fill
                      className="object-contain object-left p-1"
                      sizes="176px"
                      priority
                    />
                  </div>
                  <p className="text-white/70 text-xs mt-1">Welcome, {session.name}</p>
                </div>
                <nav className="flex-1 overflow-y-auto scrollbar-thin">
                  <ul className="flex flex-col gap-1 px-3">
                    {links.map((link) => {
                      const active = pathname === link.href || pathname.startsWith(link.href + "/");
                      return (
                        <li key={link.href}>
                          <Link
                            href={link.href}
                            onClick={() => setMobileOpen(false)}
                            className={`relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                              active ? "bg-white/20 text-white" : "text-white/80 hover:bg-white/10 hover:text-white"
                            }`}
                          >
                            <link.Icon className="h-4 w-4 shrink-0" />
                            <span className="truncate">{link.label}</span>
                          </Link>
                        </li>
                      );
                    })}
                    {!hideContactUs && (
                      <li className="mt-2">
                        <Link
                          href="/contact"
                          onClick={() => setMobileOpen(false)}
                          className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-white/80 hover:bg-white/10 hover:text-white transition-colors"
                        >
                          <FaEnvelope className="h-4 w-4 shrink-0" />
                          <span>Contact Us</span>
                        </Link>
                      </li>
                    )}
                    <li>
                      <button
                        onClick={handleLogout}
                        className="w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-white/80 hover:bg-white/10 hover:text-white transition-colors text-left"
                      >
                        <FaSignOutAlt className="h-4 w-4 shrink-0" />
                        <span>Logout</span>
                      </button>
                    </li>
                  </ul>
                </nav>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
