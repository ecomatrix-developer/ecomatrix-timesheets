"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { AnimatePresence, motion } from "framer-motion";
import ReactMarkdown from "react-markdown";
import { FaRobot, FaTimes, FaPaperPlane, FaTrash } from "react-icons/fa";
import {
  sendChatMessageAction,
  getChatHistoryAction,
  clearChatHistoryAction,
} from "@/app/(actions)/aiAssistantActions";
import type { ChatMessage } from "@/lib/ai/chat";
import { toast } from "@/lib/toast";

// Compact overrides so the assistant's markdown (bold, bullet/numbered
// lists, headings) renders legibly inside a small chat bubble instead of
// at normal prose size/spacing.
const MARKDOWN_COMPONENTS = {
  p: ({ children }: { children?: React.ReactNode }) => <p className="mb-1.5 last:mb-0">{children}</p>,
  strong: ({ children }: { children?: React.ReactNode }) => <strong className="font-semibold">{children}</strong>,
  em: ({ children }: { children?: React.ReactNode }) => <em className="italic">{children}</em>,
  ul: ({ children }: { children?: React.ReactNode }) => <ul className="mb-1.5 list-disc space-y-0.5 pl-4 last:mb-0">{children}</ul>,
  ol: ({ children }: { children?: React.ReactNode }) => <ol className="mb-1.5 list-decimal space-y-0.5 pl-4 last:mb-0">{children}</ol>,
  li: ({ children }: { children?: React.ReactNode }) => <li className="leading-snug">{children}</li>,
  h1: ({ children }: { children?: React.ReactNode }) => <h4 className="mb-1 mt-1.5 font-semibold first:mt-0">{children}</h4>,
  h2: ({ children }: { children?: React.ReactNode }) => <h4 className="mb-1 mt-1.5 font-semibold first:mt-0">{children}</h4>,
  h3: ({ children }: { children?: React.ReactNode }) => <h4 className="mb-1 mt-1.5 font-semibold first:mt-0">{children}</h4>,
  code: ({ children }: { children?: React.ReactNode }) => (
    <code className="rounded bg-gray-100 px-1 py-0.5 font-mono text-[11px]">{children}</code>
  ),
  a: ({ children, href }: { children?: React.ReactNode; href?: string }) => (
    <a href={href} target="_blank" rel="noreferrer" className="text-accent underline">
      {children}
    </a>
  ),
};

const EXAMPLE_PROMPTS = [
  "How many hours has Durga logged this month?",
  "Give me an overview of the company this quarter.",
  "Which weekdays is Kaustubh missing a submitted timesheet this week?",
  "How does the PTO hour cap work?",
];

/**
 * Admin-only floating chat widget — mounted once in the root layout so it
 * persists across client-side navigation between admin pages instead of
 * resetting on every route. Talks to the Claude tool-use agent via
 * aiAssistantActions.ts; history is persisted in Supabase so a hard
 * refresh doesn't lose the conversation either.
 */
export default function AIAssistantWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [pending, startTransition] = useTransition();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || loadedOnce) return;
    setLoadedOnce(true);
    getChatHistoryAction()
      .then(setMessages)
      .catch(() => toast.error("Couldn't load chat history."));
  }, [open, loadedOnce]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, pending]);

  function send() {
    const text = input.trim();
    if (!text || pending) return;
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    startTransition(async () => {
      const result = await sendChatMessageAction(text);
      if (result.success && result.messages) {
        setMessages(result.messages);
      } else {
        toast.error(result.error ?? "The assistant couldn't answer that.");
        setMessages((prev) => prev.slice(0, -1));
        setInput(text);
      }
    });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  function handleClear() {
    startTransition(async () => {
      await clearChatHistoryAction();
      setMessages([]);
    });
  }

  return (
    <>
      <motion.button
        type="button"
        onClick={() => setOpen((o) => !o)}
        whileTap={{ scale: 0.92 }}
        aria-label={open ? "Close AI Assistant" : "Open AI Assistant"}
        className="fixed bottom-5 right-5 z-[200] flex h-14 w-14 items-center justify-center rounded-full text-white shadow-xl"
        style={{ background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)" }}
      >
        {open ? <FaTimes className="h-5 w-5" /> : <FaRobot className="h-6 w-6" />}
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 340, damping: 30 }}
            className="fixed bottom-24 right-5 z-[199] flex w-[min(380px,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl"
            style={{ height: "min(70vh, 600px)" }}
          >
            <div
              className="flex shrink-0 items-center justify-between gap-2 px-4 py-3 text-white"
              style={{ background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)" }}
            >
              <div className="flex items-center gap-2">
                <FaRobot className="h-4 w-4" />
                <h3 className="text-sm font-semibold">AI Assistant</h3>
              </div>
              <button
                type="button"
                onClick={handleClear}
                title="Clear conversation"
                className="rounded-md p-1.5 text-white/80 hover:bg-white/15 hover:text-white"
              >
                <FaTrash className="h-3 w-3" />
              </button>
            </div>

            <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto scrollbar-thin bg-gray-50 p-3">
              {messages.length === 0 && (
                <div className="space-y-2">
                  <p className="text-xs text-muted px-1">
                    Ask about hours, projects, employees, submissions, or how a feature works. Try:
                  </p>
                  {EXAMPLE_PROMPTS.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => setInput(prompt)}
                      className="block w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-left text-xs text-gray-600 transition-colors hover:border-accent/40 hover:bg-accent/5"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              )}
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[85%] rounded-2xl px-3 py-2 text-xs leading-relaxed ${
                      m.role === "user"
                        ? "whitespace-pre-wrap rounded-br-sm bg-accent text-white"
                        : "rounded-bl-sm border border-gray-200 bg-white text-gray-800"
                    }`}
                  >
                    {m.role === "user" ? (
                      m.content
                    ) : (
                      <ReactMarkdown components={MARKDOWN_COMPONENTS}>{m.content}</ReactMarkdown>
                    )}
                  </div>
                </div>
              ))}
              {pending && (
                <div className="flex justify-start">
                  <div className="flex items-center gap-1 rounded-2xl rounded-bl-sm border border-gray-200 bg-white px-3 py-2.5">
                    {[0, 1, 2].map((i) => (
                      <motion.span
                        key={i}
                        className="h-1.5 w-1.5 rounded-full bg-gray-400"
                        animate={{ opacity: [0.3, 1, 0.3] }}
                        transition={{ duration: 1, repeat: Infinity, delay: i * 0.15 }}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex shrink-0 items-end gap-2 border-t border-gray-100 p-2.5">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask anything about your timesheet data…"
                rows={1}
                className="glass-input max-h-24 min-h-[2.25rem] flex-1 resize-none px-3 py-2 text-xs"
              />
              <button
                type="button"
                onClick={send}
                disabled={pending || !input.trim()}
                className="btn-primary flex h-9 w-9 shrink-0 items-center justify-center p-0 disabled:opacity-50"
                aria-label="Send"
              >
                <FaPaperPlane className="h-3 w-3" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
