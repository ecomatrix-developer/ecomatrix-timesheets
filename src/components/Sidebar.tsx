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
  FaUserPlus,
  FaDatabase,
  FaChartBar,
  FaChartPie,
  FaEnvelope,
  FaSignOutAlt,
  FaBars,
  FaTimes,
  FaTrashAlt,
} from "react-icons/fa";
import type { IconType } from "react-icons";
import type { SessionPayload } from "@/lib/types";
import { logoutAction } from "@/app/(actions)/authActions";

const employeeLinks: { href: string; label: string; Icon: IconType }[] = [
  { href: "/dashboard", label: "Dashboard", Icon: FaTachometerAlt },
  { href: "/timesheet", label: "Timesheet", Icon: FaClock },
  { href: "/projects", label: "Projects", Icon: FaProjectDiagram },
];

const adminLinks: { href: string; label: string; Icon: IconType }[] = [
  { href: "/dashboard", label: "Dashboard", Icon: FaTachometerAlt },
  { href: "/timesheet", label: "Timesheet", Icon: FaClock },
  { href: "/projects", label: "Projects", Icon: FaProjectDiagram },
  { href: "/create_employee", label: "Create Employee", Icon: FaUserPlus },
  { href: "/database_stats", label: "Database Stats", Icon: FaDatabase },
  { href: "/reports", label: "Reports", Icon: FaChartBar },
  { href: "/insights", label: "Insights", Icon: FaChartPie },
  { href: "/delete_old_entries", label: "Delete Old Entries", Icon: FaTrashAlt },
];

export default function Sidebar({ session }: { session: SessionPayload }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const links = session.role === "admin" ? adminLinks : employeeLinks;

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
              <span className="truncate opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap">
                {link.label}
              </span>
            </Link>
          </li>
        );
      })}
      <li className="mt-2 border-t border-white/10 pt-2">
        <Link
          href="/contact"
          onClick={() => setMobileOpen(false)}
          title="Contact Us"
          className="flex items-center gap-3.5 rounded-xl px-3 py-2.5 text-sm font-medium text-white/80 hover:bg-white/10 hover:text-white transition-colors"
        >
          <FaEnvelope className="h-5 w-5 shrink-0" />
          <span className="truncate opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap">
            Contact Us
          </span>
        </Link>
      </li>
      <li>
        <button
          onClick={handleLogout}
          title="Logout"
          className="w-full flex items-center gap-3.5 rounded-xl px-3 py-2.5 text-sm font-medium text-white/80 hover:bg-white/10 hover:text-white transition-colors text-left"
        >
          <FaSignOutAlt className="h-5 w-5 shrink-0" />
          <span className="truncate opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap">
            Logout
          </span>
        </button>
      </li>
    </ul>
  );

  return (
    <>
      {/* Desktop sidebar — collapsible on hover */}
      <aside
        className="hidden md:flex flex-col fixed left-0 top-0 bottom-0 z-40 w-16 hover:w-64 group transition-all duration-300 ease-in-out shadow-2xl overflow-hidden"
        style={{ background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)" }}
      >
        <div className="flex h-full flex-col pt-6">
          <div className="mb-6 px-2 overflow-hidden whitespace-nowrap">
            <div className="relative h-9 px-2">
              {/* Collapsed state: small dot-grid mark only */}
              <div className="absolute inset-y-0 left-2 w-9 opacity-100 group-hover:opacity-0 transition-opacity duration-200">
                <Image src="/icon.png" alt="Eco Matrix Engineering" fill className="object-contain" sizes="36px" priority />
              </div>
              {/* Expanded state: full wordmark (already includes the dot-grid mark) */}
              <div className="absolute inset-y-0 left-2 w-40 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                <Image
                  src="/logo-white.png"
                  alt="Eco Matrix Engineering"
                  fill
                  className="object-contain object-left"
                  sizes="160px"
                  priority
                />
              </div>
            </div>
            <p className="text-white/70 text-xs mt-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 truncate px-3 text-left">
              Welcome, {session.name}
            </p>
          </div>
          <nav className="flex-1 overflow-y-auto scrollbar-none">{NavList}</nav>
        </div>
      </aside>

      {/* Mobile top bar */}
      <div
        className="md:hidden fixed top-0 left-0 right-0 z-40 flex items-center justify-between px-4 py-3 shadow"
        style={{ background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)" }}
      >
        <div className="relative h-8 w-40">
          <Image src="/logo-white.png" alt="Eco Matrix Engineering" fill className="object-contain object-left" sizes="160px" priority />
        </div>
        <button
          className="text-white p-2"
          onClick={() => setMobileOpen((o) => !o)}
          aria-label="Toggle menu"
        >
          {mobileOpen ? <FaTimes className="h-5 w-5" /> : <FaBars className="h-5 w-5" />}
        </button>
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
                  <div className="relative h-9 w-44 mb-2">
                    <Image
                      src="/logo-white.png"
                      alt="Eco Matrix Engineering"
                      fill
                      className="object-contain object-left"
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
