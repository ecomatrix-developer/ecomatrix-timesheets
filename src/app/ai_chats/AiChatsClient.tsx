"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import { FaRobot, FaChevronDown, FaCommentDots, FaUser } from "react-icons/fa";
import { MARKDOWN_COMPONENTS } from "@/components/markdownComponents";

export interface AiChatMessage {
  id: string;
  admin_user_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

export interface AiChatConversation {
  adminUserId: string;
  adminName: string;
  messages: AiChatMessage[];
}

// Fixed "en-US" locale, not the runtime's default — avoids a hydration
// mismatch between the server's and browser's default locale (same
// convention as every other report/timestamp in the app).
function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

// The one-line preview shouldn't show raw markdown syntax (**bold**,
// bullet dashes, headings) — strip the common markers and collapse to a
// single line; the full transcript below still renders it properly via
// ReactMarkdown.
function stripMarkdown(text: string): string {
  return text
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^[-*]\s+/gm, "")
    .replace(/\n+/g, " ")
    .replace(/[*_`]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export default function AiChatsClient({ conversations }: { conversations: AiChatConversation[] }) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function renderPreviewLine(messages: AiChatMessage[]) {
    const last = messages[messages.length - 1];
    if (!last) return <span className="italic">No messages yet.</span>;
    const who = last.role === "user" ? "They asked" : "AI replied";
    return (
      <>
        <span className="font-medium text-foreground">{who}:</span> {stripMarkdown(last.content)}
      </>
    );
  }

  return (
    <div className="w-full">
      <h1 className="text-2xl font-semibold mb-1 flex items-center gap-2">
        <FaRobot className="text-accent" /> AI Chats
      </h1>
      <p className="text-sm text-muted mb-6 max-w-2xl">
        Every admin&apos;s conversation with the AI assistant, newest activity first — a
        Super-Admin-only audit view. Click a conversation to open the full transcript.
      </p>

      <div className="flex flex-col gap-3">
        {conversations.length === 0 && (
          <div className="glass p-10 text-center text-muted">
            <FaRobot className="mx-auto mb-3 h-8 w-8 text-gray-300" />
            No AI conversations yet.
          </div>
        )}
        <AnimatePresence initial={false}>
          {conversations.map((conv) => {
            const expanded = expandedIds.has(conv.adminUserId);
            const lastActivity = conv.messages[conv.messages.length - 1]?.created_at;
            return (
              <motion.div
                key={conv.adminUserId}
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <h3 className="text-sm font-semibold">{conv.adminName}</h3>
                      <span className="text-[10px] text-muted">
                        {conv.messages.length} message{conv.messages.length === 1 ? "" : "s"}
                      </span>
                    </div>
                    {lastActivity && (
                      <p className="text-xs text-muted mb-2">Last active {formatDateTime(lastActivity)}</p>
                    )}

                    <button
                      type="button"
                      onClick={() => toggleExpand(conv.adminUserId)}
                      className="w-full min-w-0 flex items-center gap-2 text-left"
                    >
                      <FaCommentDots className="h-3 w-3 shrink-0 text-accent" />
                      {/* A plain <span> can't be truncated by CSS (overflow
                          doesn't apply to inline boxes) — this has to be a
                          block-level, width-constrained flex child for
                          `truncate` to actually clip a long AI reply
                          instead of overflowing the whole page sideways. */}
                      <div className="min-w-0 flex-1 truncate text-xs text-muted">
                        {renderPreviewLine(conv.messages)}
                      </div>
                      <FaChevronDown
                        className={`h-3 w-3 shrink-0 text-muted transition-transform ${
                          expanded ? "rotate-180" : ""
                        }`}
                      />
                    </button>

                    {expanded && (
                      <div className="mt-3 flex flex-col gap-2">
                        {conv.messages.map((m) => {
                          const isUser = m.role === "user";
                          return (
                            <div
                              key={m.id}
                              className={`rounded-lg px-3 py-2 max-w-[90%] ${
                                isUser
                                  ? "bg-accent/10 border border-accent/20 ml-auto"
                                  : "bg-gray-50 border border-gray-200"
                              }`}
                            >
                              <p
                                className={`text-[10px] font-semibold uppercase tracking-wide mb-0.5 flex items-center gap-1 ${
                                  isUser ? "text-accent justify-end" : "text-gray-500"
                                }`}
                              >
                                {isUser ? (
                                  <>
                                    {conv.adminName} · {formatDateTime(m.created_at)}
                                    <FaUser className="h-2.5 w-2.5" />
                                  </>
                                ) : (
                                  <>
                                    <FaRobot className="h-2.5 w-2.5" />
                                    AI · {formatDateTime(m.created_at)}
                                  </>
                                )}
                              </p>
                              <div className="text-sm text-gray-700 break-words">
                                <ReactMarkdown components={MARKDOWN_COMPONENTS}>{m.content}</ReactMarkdown>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
