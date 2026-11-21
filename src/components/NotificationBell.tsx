"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { FaBell, FaEnvelope, FaCalendarAlt } from "react-icons/fa";

interface Counts {
  contactUnread: number;
  leavePending: number;
}

/**
 * Admin/Super Admin only (Abeer, 2026-11-21: "notification bar on super
 * admins and admins"). Polls /api/notifications/count every 60s so new
 * Contact Us submissions, password-reset requests, and pending leave
 * requests show up without a page navigation. Rendered inside Sidebar.
 */
export default function NotificationBell({ initialCounts }: { initialCounts: Counts }) {
  const [counts, setCounts] = useState(initialCounts);
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelRect, setPanelRect] = useState<{ top: number; left: number } | null>(null);

  const total = counts.contactUnread + counts.leavePending;

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications/count", { cache: "no-store" });
      if (res.ok) setCounts(await res.json());
    } catch {
      // silent — next poll tries again
    }
  }, []);

  useEffect(() => {
    const interval = setInterval(refresh, 60_000);
    return () => clearInterval(interval);
  }, [refresh]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (
        buttonRef.current &&
        !buttonRef.current.contains(target) &&
        panelRef.current &&
        !panelRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleToggle() {
    if (!isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setPanelRect({ top: rect.bottom + 6, left: rect.left });
      refresh();
    }
    setIsOpen((o) => !o);
  }

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={handleToggle}
        title="Notifications"
        className="relative flex items-center justify-center rounded-xl p-2.5 text-white/80 hover:bg-white/10 hover:text-white transition-colors"
      >
        <FaBell className="h-5 w-5" />
        {total > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
            {total > 99 ? "99+" : total}
          </span>
        )}
      </button>

      {isOpen &&
        panelRect &&
        createPortal(
          <div
            ref={panelRef}
            style={{ position: "fixed", top: panelRect.top, left: panelRect.left }}
            className="z-[150] w-72 bg-white rounded-xl shadow-xl border border-gray-200 py-2 text-foreground"
          >
            <p className="px-3.5 pb-2 text-xs font-semibold uppercase tracking-wide text-muted">
              Notifications
            </p>
            {total === 0 ? (
              <p className="px-3.5 py-3 text-sm text-muted">Nothing new.</p>
            ) : (
              <div className="flex flex-col">
                {counts.contactUnread > 0 && (
                  <Link
                    href="/contact_submissions"
                    onClick={() => setIsOpen(false)}
                    className="flex items-center gap-2.5 px-3.5 py-2.5 text-sm hover:bg-gray-50 transition-colors"
                  >
                    <FaEnvelope className="h-4 w-4 text-accent shrink-0" />
                    <span>
                      <strong>{counts.contactUnread}</strong> unread contact submission
                      {counts.contactUnread === 1 ? "" : "s"}
                    </span>
                  </Link>
                )}
                {counts.leavePending > 0 && (
                  <Link
                    href="/leave"
                    onClick={() => setIsOpen(false)}
                    className="flex items-center gap-2.5 px-3.5 py-2.5 text-sm hover:bg-gray-50 transition-colors"
                  >
                    <FaCalendarAlt className="h-4 w-4 text-accent shrink-0" />
                    <span>
                      <strong>{counts.leavePending}</strong> pending leave request
                      {counts.leavePending === 1 ? "" : "s"}
                    </span>
                  </Link>
                )}
              </div>
            )}
          </div>,
          document.body
        )}
    </div>
  );
}
