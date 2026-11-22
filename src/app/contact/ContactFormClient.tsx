"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { motion } from "framer-motion";
import { submitContactFormAction, addContactSubmissionMessageAction, type ContactFormState } from "@/app/(actions)/contactActions";
import { toast } from "@/lib/toast";
import { FaEnvelope, FaPaperPlane, FaKey, FaHistory, FaChevronDown, FaCommentDots } from "react-icons/fa";
import type { ContactSubmission, ContactSubmissionMessage } from "@/lib/types";

const initialState: ContactFormState = {};

// Fixed "en-US" locale, not the runtime's default — avoids a hydration
// mismatch between the server's and browser's default locale.
function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      type="submit"
      disabled={pending}
      className="btn-primary inline-flex items-center justify-center gap-2 py-2.5"
    >
      <FaPaperPlane className="h-3.5 w-3.5" /> {pending ? "Sending…" : "Send Message"}
    </motion.button>
  );
}

// Abeer, 2026-11-22: "make it look like leave page, box in the left and
// all recent chat on the right side as collapsible" — same two-column
// layout as the Leave page: the form on the left, every past
// conversation on the right, each one collapsed behind a one-line
// preview until clicked.
export default function ContactFormClient({
  name,
  pastMessages = [],
  threads = {},
  viewerId,
}: {
  name: string;
  pastMessages?: ContactSubmission[];
  threads?: Record<string, ContactSubmissionMessage[]>;
  viewerId: string;
}) {
  const [state, formAction] = useActionState(submitContactFormAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const [localThreads, setLocalThreads] = useState(threads);
  const [draftByItem, setDraftByItem] = useState<Record<string, string>>({});
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [, startTransition] = useTransition();

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  useEffect(() => {
    if (state.success) {
      toast.success("Your message has been sent.");
      formRef.current?.reset();
    } else if (state.error) {
      toast.error(state.error);
    }
  }, [state]);

  const repliedCount = pastMessages.filter((m) =>
    (localThreads[m.id] ?? []).some((msg) => msg.sender_id !== viewerId)
  ).length;

  function sendFollowUp(item: ContactSubmission) {
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
        setLocalThreads((prev) => ({
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
        setDraftByItem((prev) => ({ ...prev, [item.id]: "" }));
      } else {
        toast.error(result.error ?? "Couldn't send that message.");
      }
    });
  }

  function renderPreviewLine(thread: ContactSubmissionMessage[]) {
    if (thread.length === 0) {
      return <span className="text-xs text-muted italic truncate">No replies yet — click to send a follow-up.</span>;
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
      <h1 className="text-xl font-semibold mb-1 flex items-center gap-2">
        <FaEnvelope className="text-accent" /> Contact Us
      </h1>
      <p className="text-sm text-muted mb-6">
        Send a message directly to Eco Matrix Engineering&apos;s management team below.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-[22rem_1fr] gap-6 items-start">
        <motion.form
          ref={formRef}
          action={formAction}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-strong p-6 flex flex-col gap-4"
        >
          <h2 className="text-lg font-semibold">New Message</h2>
          <div>
            <label className="text-sm text-muted mb-1 block">From</label>
            <input
              value={name}
              disabled
              className="glass-input w-full px-3 py-2 bg-gray-50 text-muted"
            />
          </div>
          <div>
            <label className="text-sm text-muted mb-1 block">Subject *</label>
            <input
              name="subject"
              required
              placeholder="What's this about?"
              className="glass-input w-full px-3 py-2"
            />
          </div>
          <div>
            <label className="text-sm text-muted mb-1 block">Message *</label>
            <textarea
              name="message"
              required
              rows={6}
              placeholder="Write your message here…"
              className="glass-input w-full px-3 py-2"
            />
          </div>

          <SubmitButton />
        </motion.form>

        <div className="glass !p-0 overflow-hidden flex flex-col">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold flex items-center gap-2">
              <FaHistory className="text-accent h-4 w-4" /> Your Past Messages ({pastMessages.length})
              {repliedCount > 0 && (
                <span className="text-xs font-normal text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                  {repliedCount} replied
                </span>
              )}
            </h2>
            <p className="text-xs text-muted mt-0.5">Click any message below to open the full conversation and reply.</p>
          </div>
          <div className="flex flex-col gap-3 p-3 max-h-[32rem] overflow-y-auto scrollbar-thin">
            {pastMessages.length === 0 ? (
              <p className="text-sm text-muted text-center py-8">No messages yet.</p>
            ) : (
              pastMessages.map((m) => {
                const thread = localThreads[m.id] ?? [];
                const expanded = expandedIds.has(m.id);
                return (
                  <div key={m.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      {m.source === "password_reset" && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                          <FaKey className="h-2.5 w-2.5" /> Password Reset
                        </span>
                      )}
                      <h3 className="text-sm font-medium">{m.subject}</h3>
                    </div>
                    <p className="text-xs text-muted mb-2">{formatDateTime(m.created_at)}</p>
                    <p className="text-sm whitespace-pre-wrap break-words">{m.message}</p>

                    <button
                      type="button"
                      onClick={() => toggleExpand(m.id)}
                      className="w-full flex items-center justify-between gap-2 mt-2 text-left"
                    >
                      <span className="flex items-center gap-1.5 min-w-0">
                        <FaCommentDots className="h-3 w-3 shrink-0 text-accent" />
                        <span className="min-w-0">{renderPreviewLine(thread)}</span>
                      </span>
                      <FaChevronDown className={`h-3 w-3 shrink-0 text-muted transition-transform ${expanded ? "rotate-180" : ""}`} />
                    </button>

                    {expanded && (
                      <>
                        {thread.length > 0 && (
                          <div className="mt-2 flex flex-col gap-2">
                            {thread.map((msg) => {
                              const isMe = msg.sender_id === viewerId;
                              return (
                                <div
                                  key={msg.id}
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
                                    {isMe ? "You" : msg.sender_name} · {formatDateTime(msg.created_at)}
                                  </p>
                                  <p className="text-sm text-gray-700 whitespace-pre-wrap break-words">{msg.message}</p>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        <div className="mt-2 flex flex-col gap-2">
                          <textarea
                            value={draftByItem[m.id] ?? ""}
                            onChange={(e) => setDraftByItem((prev) => ({ ...prev, [m.id]: e.target.value }))}
                            rows={2}
                            placeholder="Write a follow-up…"
                            className="glass-input w-full px-3 py-2 text-sm"
                          />
                          <button
                            type="button"
                            disabled={sendingId === m.id}
                            onClick={() => sendFollowUp(m)}
                            className="btn-primary self-start inline-flex items-center gap-2 px-3 py-1.5 text-xs"
                          >
                            <FaPaperPlane className="h-3 w-3" /> {sendingId === m.id ? "Sending…" : "Send"}
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
