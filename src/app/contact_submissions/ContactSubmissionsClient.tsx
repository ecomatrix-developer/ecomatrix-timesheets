"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { ContactSubmission } from "@/lib/types";
import { markContactSubmissionReadAction } from "@/app/(actions)/contactActions";
import Pagination from "@/components/Pagination";
import { PAGE_SIZE } from "@/lib/constants";
import { FaInbox, FaEnvelope, FaEnvelopeOpen, FaKey } from "react-icons/fa";

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function ContactSubmissionsClient({
  items,
  page,
  totalPages,
  totalItems,
}: {
  items: ContactSubmission[];
  page: number;
  totalPages: number;
  totalItems: number;
}) {
  const router = useRouter();
  const [localItems, setLocalItems] = useState(items);
  const [pending, startTransition] = useTransition();

  function goToPage(nextPage: number) {
    router.push(`/contact_submissions?page=${nextPage}`, { scroll: false });
    router.refresh();
  }

  function toggleRead(item: ContactSubmission) {
    const nextRead = !item.read_at;
    setLocalItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, read_at: nextRead ? new Date().toISOString() : null } : i))
    );
    startTransition(async () => {
      const result = await markContactSubmissionReadAction(item.id, nextRead);
      if (!result.success) {
        // Revert on failure
        setLocalItems((prev) => prev.map((i) => (i.id === item.id ? item : i)));
      } else {
        router.refresh();
      }
    });
  }

  return (
    <div className="w-full">
      <h1 className="text-2xl font-semibold mb-1 flex items-center gap-2">
        <FaInbox className="text-accent" /> Contact Submissions
      </h1>
      <p className="text-sm text-muted mb-6 max-w-2xl">
        Every Contact Us message and password reset request, newest first — these are also
        emailed as they come in, but this is the permanent record. Click an item to mark it
        read/unread.
      </p>

      <div className="flex flex-col gap-3">
        {localItems.length === 0 && (
          <div className="glass p-10 text-center text-muted">
            <FaInbox className="mx-auto mb-3 h-8 w-8 text-gray-300" />
            No submissions yet.
          </div>
        )}
        <AnimatePresence initial={false}>
          {localItems.map((item) => {
            const unread = !item.read_at;
            return (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                className={`glass p-4 cursor-pointer transition-colors ${
                  unread ? "border-l-4 border-accent" : "opacity-80"
                }`}
                onClick={() => toggleRead(item)}
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      {item.source === "password_reset" ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                          <FaKey className="h-2.5 w-2.5" /> Password Reset
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-sky-700 bg-sky-50 border border-sky-200 px-2 py-0.5 rounded-full">
                          <FaEnvelope className="h-2.5 w-2.5" /> Contact Form
                        </span>
                      )}
                      <h3 className={`text-sm ${unread ? "font-semibold" : "font-medium"}`}>
                        {item.subject}
                      </h3>
                    </div>
                    <p className="text-xs text-muted mb-2">
                      {item.name} ({item.username}) &middot; {formatDateTime(item.created_at)}
                    </p>
                    <p className="text-sm whitespace-pre-wrap break-words">{item.message}</p>
                  </div>
                  <button
                    disabled={pending}
                    title={unread ? "Mark as read" : "Mark as unread"}
                    className="shrink-0 p-2 rounded-lg text-muted hover:bg-gray-100 transition-colors"
                  >
                    {unread ? (
                      <FaEnvelope className="h-4 w-4 text-accent" />
                    ) : (
                      <FaEnvelopeOpen className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      <div className="mt-4">
        <Pagination
          page={page}
          totalPages={totalPages}
          totalItems={totalItems}
          pageSize={PAGE_SIZE}
          onPageChange={goToPage}
        />
      </div>
    </div>
  );
}
