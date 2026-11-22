"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { ContactSubmission, ContactSubmissionMessage } from "@/lib/types";
import { markContactSubmissionReadAction, addContactSubmissionMessageAction } from "@/app/(actions)/contactActions";
import { toast } from "@/lib/toast";
import { FaInbox, FaEnvelope, FaEnvelopeOpen, FaKey, FaPaperPlane, FaChevronDown, FaCommentDots } from "react-icons/fa";

// Fixed "en-US" locale, not the runtime's default — avoids a hydration
// mismatch between the server's and browser's default locale.
function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function ContactSubmissionsClient({
  items,
  messages,
  viewerId,
}: {
  items: ContactSubmission[];
  messages: Record<string, ContactSubmissionMessage[]>;
  viewerId: string;
}) {
  const router = useRouter();
  const [localItems, setLocalItems] = useState(items);
  const [threads, setThreads] = useState(messages);
  const [draftByItem, setDraftByItem] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const [sendingId, setSendingId] = useState<string | null>(null);
  // Abeer, 2026-11-22: "make the same UI as per the leaves for the
  // contact US form page" — each conversation starts collapsed behind a
  // one-line preview, and only opens into the full thread + reply box
  // when clicked, same as the Leave page.
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function setRead(item: ContactSubmission, nextRead: boolean) {
    if (!!item.read_at === nextRead) return; // already in that state, nothing to do
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

  function sendMessage(item: ContactSubmission) {
    const text = (draftByItem[item.id] ?? "").trim();
    if (!text) {
      toast.error("Write a message first.");
      return;
    }
    setSendingId(item.id);
    startTransition(async () => {
      const result = await addContactSubmissionMessageAction(item.id, text);
      setSendingId(null);
      if (result.success) {
        setThreads((prev) => ({
          ...prev,
          [item.id]: [
            ...(prev[item.id] ?? []),
            {
              id: `local-${Date.now()}`,
              submission_id: item.id,
              sender_id: viewerId,
              sender_name: "You",
              message: text,
              created_at: new Date().toISOString(),
            },
          ],
        }));
        setLocalItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, read_at: new Date().toISOString() } : i)));
        setDraftByItem((prev) => ({ ...prev, [item.id]: "" }));
        router.refresh();
      } else {
        toast.error(result.error ?? "Couldn't send that message.");
      }
    });
  }

  function renderPreviewLine(item: ContactSubmission, thread: ContactSubmissionMessage[]) {
    if (thread.length === 0) {
      return <span className="text-xs text-muted italic truncate">No replies yet — click to reply.</span>;
    }
    const last = thread[thread.length - 1];
    const who = last.sender_id === viewerId ? "You" : last.sender_name;
    return (
      <span className="text-xs text-muted truncate">
        <span className="font-medium text-foreground">{who}:</span> {last.message}
      </span>
    );
  }

  return (
    <div className="w-full">
      <h1 className="text-2xl font-semibold mb-1 flex items-center gap-2">
        <FaInbox className="text-accent" /> Contact Submissions
      </h1>
      <p className="text-sm text-muted mb-6 max-w-2xl">
        Every Contact Us message and password reset request, newest first — this is the
        permanent record. Click an unread item to mark it seen. Click the reply preview to open
        the full thread — it&apos;s a real back-and-forth conversation, and the sender can write
        back to you too from their own Contact Us page.
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
            const thread = threads[item.id] ?? [];
            const expanded = expandedIds.has(item.id);
            return (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                className={`glass p-4 transition-colors ${
                  unread ? "border-l-4 border-accent cursor-pointer" : "opacity-80"
                }`}
                onClick={() => setRead(item, true)}
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

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleExpand(item.id);
                      }}
                      className="w-full flex items-center justify-between gap-2 mt-2 text-left"
                    >
                      <span className="flex items-center gap-1.5 min-w-0">
                        <FaCommentDots className="h-3 w-3 shrink-0 text-accent" />
                        <span className="min-w-0">{renderPreviewLine(item, thread)}</span>
                      </span>
                      <FaChevronDown className={`h-3 w-3 shrink-0 text-muted transition-transform ${expanded ? "rotate-180" : ""}`} />
                    </button>

                    {expanded && (
                      <div onClick={(e) => e.stopPropagation()}>
                        {thread.length > 0 && (
                          <div className="mt-2 flex flex-col gap-2">
                            {thread.map((m) => {
                              const isMe = m.sender_id === viewerId;
                              return (
                                <div
                                  key={m.id}
                                  className={`rounded-lg px-3 py-2 max-w-[90%] ${
                                    isMe
                                      ? "bg-accent/10 border border-accent/20 ml-auto"
                                      : "bg-gray-50 border border-gray-200"
                                  }`}
                                >
                                  <p
                                    className={`text-[10px] font-semibold uppercase tracking-wide mb-0.5 ${
                                      isMe ? "text-accent" : "text-gray-500"
                                    }`}
                                  >
                                    {isMe ? "You" : m.sender_name} · {formatDateTime(m.created_at)}
                                  </p>
                                  <p className="text-sm text-gray-700 whitespace-pre-wrap break-words">{m.message}</p>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        <div className="mt-2 flex flex-col gap-2">
                          <textarea
                            value={draftByItem[item.id] ?? ""}
                            onChange={(e) => setDraftByItem((prev) => ({ ...prev, [item.id]: e.target.value }))}
                            rows={2}
                            placeholder="Write a reply…"
                            className="glass-input w-full px-3 py-2 text-sm"
                          />
                          <button
                            type="button"
                            disabled={sendingId === item.id}
                            onClick={() => sendMessage(item)}
                            className="btn-primary self-start inline-flex items-center gap-2 px-3 py-1.5 text-xs"
                          >
                            <FaPaperPlane className="h-3 w-3" /> {sendingId === item.id ? "Sending…" : "Send Reply"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setRead(item, unread);
                    }}
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
    </div>
  );
}
