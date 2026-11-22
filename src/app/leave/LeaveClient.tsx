"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { useActionState } from "react";
import {
  FaCalendarAlt,
  FaPaperPlane,
  FaCheck,
  FaTimes,
  FaClock,
  FaUserCircle,
  FaHistory,
  FaChevronDown,
  FaCommentDots,
} from "react-icons/fa";
import Select from "@/components/Select";
import DatePicker from "@/components/DatePicker";
import Modal from "@/components/Modal";
import { toast } from "@/lib/toast";
import {
  createLeaveRequestAction,
  decideLeaveRequestAction,
  addLeaveRequestMessageAction,
  type LeaveRequestState,
} from "@/app/(actions)/leaveActions";
import type { LeaveRequest, LeaveRequestMessage, LeaveType } from "@/lib/types";

const LEAVE_TYPE_OPTIONS: { value: LeaveType; label: string }[] = [
  { value: "casual", label: "Casual" },
  { value: "sick", label: "Sick" },
  { value: "annual", label: "Annual" },
  { value: "unpaid", label: "Unpaid" },
  { value: "other", label: "Other" },
];

// Fixed "en-US" locale, not the runtime's default (undefined) — the
// server and the browser can have different default locales (e.g. the
// server runs en-GB-formatted dates, the browser is en-US), which
// produces a hydration mismatch since this is a Client Component whose
// initial render is still server-rendered HTML.
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

// Abeer, 2026-11-22: "the reply of super admin in the leave cant be
// visible properly in the users view" — the approve/reject decision note
// used to render as one easy-to-miss italic caption line. Now it's a
// proper, clearly-labeled card in the same visual language as the thread
// messages below it, so it actually reads as "the Super Admin's reply."
//
// "make it proper readable format for superadmin as well so that looks
// real chat" (2026-11-22) — it now also flips side/perspective like every
// other message: when the viewer IS the Super Admin who made this exact
// decision, it sits on the right labeled "You", same as their own thread
// messages; viewed by anyone else (the employee, or a different Super
// Admin) it sits on the left labeled "Super Admin". The
// approved/rejected color coding stays either way — that's status, not
// perspective.
function DecisionNoteCard({ r, viewerId }: { r: LeaveRequest; viewerId: string }) {
  if (!r.decision_note) return null;
  const approved = r.status === "approved";
  const isMe = r.decided_by === viewerId;
  return (
    <div
      className={`rounded-lg px-3 py-2 max-w-[90%] border ${isMe ? "ml-auto" : ""} ${
        approved ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200"
      }`}
    >
      <p className={`text-[10px] font-semibold uppercase tracking-wide mb-0.5 ${approved ? "text-emerald-700" : "text-red-700"}`}>
        {isMe ? "You" : "Super Admin"} {approved ? "approved" : "rejected"} this{r.decided_at ? ` · ${formatDateTime(r.decided_at)}` : ""}
      </p>
      <p className="text-sm text-gray-700 whitespace-pre-wrap break-words">{r.decision_note}</p>
    </div>
  );
}

function statusBadge(status: LeaveRequest["status"]) {
  const styles =
    status === "approved"
      ? "bg-emerald-100 text-emerald-700"
      : status === "rejected"
      ? "bg-red-100 text-red-700"
      : "bg-amber-100 text-amber-700";
  return (
    <span className={`shrink-0 text-xs font-medium px-2.5 py-1 rounded-full capitalize ${styles}`}>{status}</span>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary inline-flex items-center justify-center gap-2 py-2.5">
      <FaPaperPlane className="h-3.5 w-3.5" /> {pending ? "Submitting…" : "Submit Request"}
    </button>
  );
}

interface DecisionTarget {
  id: string;
  decision: "approved" | "rejected";
  employeeName: string;
}

export default function LeaveClient({
  myRequests,
  allRequests,
  canDecide,
  threads,
  viewerId,
}: {
  myRequests: LeaveRequest[];
  allRequests: LeaveRequest[];
  canDecide: boolean;
  threads: Record<string, LeaveRequestMessage[]>;
  viewerId: string;
}) {
  const router = useRouter();
  const initialState: LeaveRequestState = {};
  const [state, formAction] = useActionState(createLeaveRequestAction, initialState);
  const [leaveType, setLeaveType] = useState<LeaveType>("casual");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const lastState = useRef<LeaveRequestState>(initialState);
  const [deciding, setDeciding] = useState<string | null>(null);
  const [decisionTarget, setDecisionTarget] = useState<DecisionTarget | null>(null);
  const [decisionNote, setDecisionNote] = useState("");
  const [localThreads, setLocalThreads] = useState(threads);
  const [draftByRequest, setDraftByRequest] = useState<Record<string, string>>({});
  const [sendingId, setSendingId] = useState<string | null>(null);
  // Abeer, 2026-11-22: "make it by default show all requests... not like
  // open up chat every time" — every request's full conversation used to
  // render expanded at once. Now each one starts collapsed (just a
  // one-line preview of the latest message/decision) and only opens into
  // the full thread when you click it.
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

  const pendingRequests = allRequests.filter((r) => r.status === "pending");

  useEffect(() => {
    if (state === lastState.current) return;
    lastState.current = state;
    if (state?.error) toast.error(state.error);
    else if (state?.success) {
      toast.success("Leave request submitted.");
      formRef.current?.reset();
      setLeaveType("casual");
      setStartDate("");
      setEndDate("");
      router.refresh();
    }
  }, [state, router]);

  function openDecision(r: LeaveRequest, decision: "approved" | "rejected") {
    setDecisionNote("");
    setDecisionTarget({ id: r.id, decision, employeeName: r.employee_name ?? "this employee" });
  }

  function confirmDecision() {
    if (!decisionTarget) return;
    const { id, decision } = decisionTarget;
    setDeciding(id);
    setDecisionTarget(null);
    startTransition(async () => {
      const result = await decideLeaveRequestAction(id, decision, decisionNote.trim() || undefined);
      setDeciding(null);
      if (result.success) toast.success(result.message);
      else toast.error(result.message);
      router.refresh();
    });
  }

  function sendMessage(r: LeaveRequest) {
    const text = (draftByRequest[r.id] ?? "").trim();
    if (!text) {
      toast.error("Write a message first.");
      return;
    }
    setSendingId(r.id);
    startTransition(async () => {
      const result = await addLeaveRequestMessageAction(r.id, text);
      setSendingId(null);
      if (result.success) {
        setLocalThreads((prev) => ({
          ...prev,
          [r.id]: [
            ...(prev[r.id] ?? []),
            {
              id: `local-${Date.now()}`,
              request_id: r.id,
              sender_id: viewerId,
              sender_name: "You",
              message: text,
              created_at: new Date().toISOString(),
            },
          ],
        }));
        setDraftByRequest((prev) => ({ ...prev, [r.id]: "" }));
      } else {
        toast.error(result.message);
      }
    });
  }

  // Abeer, 2026-11-22: "its not proper ordering, fix that for the
  // replies, mis match" — the decision note was always rendered ABOVE the
  // thread regardless of when it actually happened, so an earlier
  // approval could appear after a later message (or vice versa). Now the
  // decision and every thread message are merged into one list and sorted
  // by actual timestamp, so the conversation always reads in the real
  // order it happened.
  function getTimelineItems(r: LeaveRequest) {
    const thread = localThreads[r.id] ?? [];
    return [
      ...(r.decision_note && r.decided_at
        ? [{ type: "decision" as const, at: r.decided_at }]
        : []),
      ...thread.map((m) => ({ type: "message" as const, at: m.created_at, m })),
    ].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  }

  // One-line summary of the latest activity, shown while a request is
  // collapsed — a real "preview" instead of either nothing or the full
  // conversation every time.
  function renderPreviewLine(r: LeaveRequest) {
    const timeline = getTimelineItems(r);
    if (timeline.length === 0) {
      return <span className="italic">No messages yet — click to start a conversation.</span>;
    }
    const last = timeline[timeline.length - 1];
    const who =
      last.type === "decision"
        ? r.decided_by === viewerId
          ? "You"
          : "Super Admin"
        : last.m.sender_id === viewerId
        ? "You"
        : last.m.sender_name;
    const text = last.type === "decision" ? r.decision_note : last.m.message;
    return (
      <>
        <span className="font-medium text-foreground">{who}:</span> {text}
      </>
    );
  }

  function renderTimeline(r: LeaveRequest) {
    const timeline = getTimelineItems(r);

    return (
      <>
        {timeline.length > 0 && (
          <div className="mt-2 flex flex-col gap-2">
            {timeline.map((item, i) =>
              item.type === "decision" ? (
                <DecisionNoteCard key={`decision-${r.id}`} r={r} viewerId={viewerId} />
              ) : (
                (() => {
                  const m = item.m;
                  const isMe = m.sender_id === viewerId;
                  return (
                    <div
                      key={m.id ?? i}
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
                })()
              )
            )}
          </div>
        )}
        <div className="mt-2 flex flex-col gap-2">
          <textarea
            value={draftByRequest[r.id] ?? ""}
            onChange={(e) => setDraftByRequest((prev) => ({ ...prev, [r.id]: e.target.value }))}
            rows={2}
            placeholder="Write a message…"
            className="glass-input w-full px-3 py-2 text-sm"
          />
          <button
            type="button"
            disabled={sendingId === r.id}
            onClick={() => sendMessage(r)}
            className="btn-primary self-start inline-flex items-center gap-2 px-3 py-1.5 text-xs"
          >
            <FaPaperPlane className="h-3 w-3" /> {sendingId === r.id ? "Sending…" : "Send"}
          </button>
        </div>
      </>
    );
  }

  return (
    <div className="w-full">
      <h1 className="text-xl font-semibold mb-1 flex items-center gap-2">
        <FaCalendarAlt className="text-accent" /> Leave
      </h1>
      <p className="text-sm text-muted mb-6">
        Submit a leave request below.{" "}
        {canDecide && "Pending requests from everyone are waiting below for your decision, with the complete history underneath."}
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-[22rem_1fr] gap-6 items-start">
        <form ref={formRef} action={formAction} className="glass-strong p-6 flex flex-col gap-4">
          <h2 className="text-lg font-semibold">New Request</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm text-muted mb-1 block">Start Date</label>
              <DatePicker value={startDate} onChange={setStartDate} name="start_date" required placeholder="Start date" />
            </div>
            <div>
              <label className="text-sm text-muted mb-1 block">End Date</label>
              <DatePicker value={endDate} onChange={setEndDate} name="end_date" required placeholder="End date" minDate={startDate || undefined} />
            </div>
          </div>
          <div>
            <label className="text-sm text-muted mb-1 block">Leave Type</label>
            <Select value={leaveType} onChange={(v) => setLeaveType(v as LeaveType)} options={LEAVE_TYPE_OPTIONS} />
            <input type="hidden" name="leave_type" value={leaveType} />
          </div>
          <div>
            <label className="text-sm text-muted mb-1 block">Reason</label>
            <textarea name="reason" rows={3} className="glass-input w-full px-3 py-2.5 text-sm" placeholder="Optional" />
          </div>
          <SubmitButton />
        </form>

        <div className="flex flex-col gap-6">
          {canDecide && (
            <div className="glass !p-0 overflow-hidden flex flex-col">
              <div className="px-5 py-4 border-b border-gray-100">
                <h2 className="font-semibold flex items-center gap-2">
                  <FaClock className="text-accent h-4 w-4" /> Pending Approvals ({pendingRequests.length})
                </h2>
              </div>
              <div className="divide-y divide-gray-100 max-h-[20rem] overflow-y-auto scrollbar-thin">
                {pendingRequests.length === 0 ? (
                  <p className="text-sm text-muted text-center py-8">No pending requests.</p>
                ) : (
                  pendingRequests.map((r) => (
                    <div key={r.id} className="flex items-center gap-3 px-5 py-3.5">
                      <div className="h-9 w-9 shrink-0 rounded-full bg-accent/10 text-accent flex items-center justify-center">
                        <FaUserCircle className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm truncate">{r.employee_name}</p>
                        <p className="text-xs text-muted truncate">
                          {formatDate(r.start_date)} – {formatDate(r.end_date)} · {r.leave_type}
                          {r.reason ? ` · ${r.reason}` : ""}
                        </p>
                      </div>
                      <button
                        onClick={() => openDecision(r, "approved")}
                        disabled={deciding === r.id}
                        title="Approve"
                        className="shrink-0 p-2 rounded-lg text-emerald-600 hover:bg-emerald-50 transition-colors"
                      >
                        <FaCheck className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => openDecision(r, "rejected")}
                        disabled={deciding === r.id}
                        title="Reject"
                        className="shrink-0 p-2 rounded-lg text-red-600 hover:bg-red-50 transition-colors"
                      >
                        <FaTimes className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {canDecide && (
            <div className="glass !p-0 overflow-hidden flex flex-col">
              <div className="px-5 py-4 border-b border-gray-100">
                <h2 className="font-semibold flex items-center gap-2">
                  <FaHistory className="text-accent h-4 w-4" /> All Requests — Full History ({allRequests.length})
                </h2>
                <p className="text-xs text-muted mt-0.5">
                  Every leave request ever submitted, org-wide — not limited by date. Reply below any request — it&apos;s a
                  real thread, and the employee can write back from their own Leave page.
                </p>
              </div>
              <div className="flex flex-col gap-3 p-3 max-h-[32rem] overflow-y-auto scrollbar-thin">
                {allRequests.length === 0 ? (
                  <p className="text-sm text-muted text-center py-8">No leave requests yet.</p>
                ) : (
                  allRequests.map((r) => {
                    const expanded = expandedIds.has(r.id);
                    return (
                      <div key={r.id} className="flex items-start gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-sm truncate">{r.employee_name}</p>
                          <p className="text-xs text-muted truncate">
                            {formatDate(r.start_date)} – {formatDate(r.end_date)} · {r.leave_type}
                            {r.reason ? ` · ${r.reason}` : ""}
                          </p>
                          <button
                            type="button"
                            onClick={() => toggleExpand(r.id)}
                            className="w-full min-w-0 flex items-center gap-2 mt-1 text-left"
                          >
                            <FaCommentDots className="h-3 w-3 shrink-0 text-accent" />
                            {/* A plain <span> can't be truncated by CSS
                                (overflow doesn't apply to inline boxes) —
                                needs to be a block-level, width-constrained
                                flex child. */}
                            <div className="min-w-0 flex-1 truncate text-xs text-muted">
                              {renderPreviewLine(r)}
                            </div>
                            <FaChevronDown className={`h-3 w-3 shrink-0 text-muted transition-transform ${expanded ? "rotate-180" : ""}`} />
                          </button>
                          {expanded && renderTimeline(r)}
                        </div>
                        {statusBadge(r.status)}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          <div className="glass !p-0 overflow-hidden flex flex-col">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="font-semibold">My Requests</h2>
            </div>
            <div className="flex flex-col gap-3 p-3 max-h-[28rem] overflow-y-auto scrollbar-thin">
              {myRequests.length === 0 ? (
                <p className="text-sm text-muted text-center py-10">No leave requests yet.</p>
              ) : (
                myRequests.map((r) => {
                  const expanded = expandedIds.has(r.id);
                  return (
                  <div key={r.id} className="flex items-start gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm truncate">
                        {formatDate(r.start_date)} – {formatDate(r.end_date)}
                      </p>
                      <p className="text-xs text-muted truncate capitalize">
                        {r.leave_type}
                        {r.reason ? ` · ${r.reason}` : ""}
                      </p>
                      <button
                        type="button"
                        onClick={() => toggleExpand(r.id)}
                        className="w-full flex items-center justify-between gap-2 mt-1 text-left"
                      >
                        <span className="flex items-center gap-1.5 min-w-0">
                          <FaCommentDots className="h-3 w-3 shrink-0 text-accent" />
                          <span className="min-w-0">{renderPreviewLine(r)}</span>
                        </span>
                        <FaChevronDown className={`h-3 w-3 shrink-0 text-muted transition-transform ${expanded ? "rotate-180" : ""}`} />
                      </button>
                      {expanded && renderTimeline(r)}
                    </div>
                    {statusBadge(r.status)}
                  </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      <Modal
        open={!!decisionTarget}
        onClose={() => setDecisionTarget(null)}
        title={decisionTarget?.decision === "approved" ? "Approve leave request" : "Reject leave request"}
      >
        {decisionTarget && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-muted">
              {decisionTarget.decision === "approved" ? "Approving" : "Rejecting"} {decisionTarget.employeeName}&apos;s
              request. Add a reason below — it will be visible to them on their Leave page.
            </p>
            <div>
              <label className="text-sm text-muted mb-1 block">Reason (optional)</label>
              <textarea
                value={decisionNote}
                onChange={(e) => setDecisionNote(e.target.value)}
                rows={3}
                className="glass-input w-full px-3 py-2.5 text-sm"
                placeholder="e.g. Approved, enjoy your time off / Rejected — short-staffed that week"
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setDecisionTarget(null)} className="btn-ghost px-4 py-2 text-sm">
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDecision}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors ${
                  decisionTarget.decision === "approved"
                    ? "bg-emerald-600 hover:bg-emerald-700"
                    : "bg-red-600 hover:bg-red-700"
                }`}
              >
                {decisionTarget.decision === "approved" ? <FaCheck className="h-3.5 w-3.5" /> : <FaTimes className="h-3.5 w-3.5" />}
                Confirm {decisionTarget.decision === "approved" ? "Approve" : "Reject"}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
