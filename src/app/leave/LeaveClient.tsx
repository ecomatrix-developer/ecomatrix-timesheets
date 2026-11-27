"use client";

import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
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
  FaUmbrellaBeach,
  FaThermometerHalf,
  FaMoneyBillWave,
  FaEdit,
  FaUserShield,
  FaPlus,
  FaTrash,
  FaExclamationTriangle,
  FaFileMedical,
  FaUpload,
} from "react-icons/fa";
import Select from "@/components/Select";
import DatePicker from "@/components/DatePicker";
import Modal from "@/components/Modal";
import LeaveBalanceModal from "@/components/LeaveBalanceModal";
import LeaveCalendar from "@/components/LeaveCalendar";
import { toast } from "@/lib/toast";
import {
  createLeaveRequestAction,
  decideLeaveRequestAction,
  addLeaveRequestMessageAction,
  addLeaveForEmployeeAction,
  type LeaveRequestState,
} from "@/app/(actions)/leaveActions";
import { uploadMedicalCertificateAction, type UploadDocumentState } from "@/app/(actions)/documentActions";
import {
  enumerateDateRange,
  isWhollyHalfDayRow,
  calendarYearForDate,
  calendarYearLabelForPeriod,
  quarterRangeForDate,
  sumApprovedSickDaysInRange,
  countRecentApprovedRequests,
  DEFAULT_ANNUAL_LEAVE_DAYS,
  DEFAULT_SICK_LEAVE_DAYS,
  MEDICAL_CERT_SICK_DAY_THRESHOLD,
  ANNUAL_CARRY_FORWARD_CAP,
  FREQUENT_LEAVE_REQUEST_COUNT,
  FREQUENT_LEAVE_WINDOW_DAYS,
} from "@/lib/leavePolicy";
import type { LeaveRequest, LeaveRequestMessage, LeaveType, LeaveSummary, PublicUser, LeaveBalance } from "@/lib/types";

// Abeer, 2026-11-26: "remove the casual from the dropdown", then
// 2026-11-27: "remove the other option from the dropdown" — casual and
// other both stay valid historical/db leave_types (existing rows,
// LeaveCalendar colors) but neither is offered on the New Request form
// anymore.
const LEAVE_TYPE_OPTIONS: { value: LeaveType; label: string }[] = [
  { value: "annual", label: "Annual" },
  { value: "sick", label: "Sick" },
  { value: "unpaid", label: "Unpaid" },
];
const LEAVE_TYPE_LABEL: Record<string, string> = Object.fromEntries(
  LEAVE_TYPE_OPTIONS.map((o) => [o.value, o.label])
);

/** Local (not UTC) yyyy-MM-dd — used to stop the date pickers at "today"
 * in the user's own timezone, not wherever the server/UTC clock sits. */
function toLocalIsoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function MetricCard({
  icon,
  label,
  used,
  total,
  accent,
}: {
  icon: ReactNode;
  label: string;
  used: number;
  total?: number;
  accent: string;
}) {
  const remaining = total !== undefined ? Math.max(total - used, 0) : null;
  return (
    <div className="glass p-4 relative overflow-hidden">
      <div className={`absolute left-0 top-0 h-full w-1 ${accent}`} />
      <div className="flex items-center gap-2 mb-1.5">
        <span className={`text-sm ${accent.replace("bg-", "text-")}`}>{icon}</span>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
      </div>
      {remaining !== null ? (
        <>
          <p className="text-2xl font-bold leading-none">{remaining}</p>
          <p className="text-xs text-muted mt-1">
            remaining · {used} used of {total}
          </p>
        </>
      ) : (
        <>
          <p className="text-2xl font-bold leading-none">{used}</p>
          <p className="text-xs text-muted mt-1">days taken this year</p>
        </>
      )}
    </div>
  );
}

function MedicalCertUploadButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="btn-primary inline-flex items-center gap-1.5 px-3 py-1.5 text-xs shrink-0"
    >
      <FaUpload className="h-3 w-3" /> {pending ? "Uploading…" : "Upload"}
    </button>
  );
}

// Abeer, 2026-11-27: "they need to upload the medical certificate from
// that time onwards" — a small self-contained upload form, shown inline
// in the banner below once an employee crosses the quarterly sick-day
// threshold. Lands in their own "Medical Certificates" folder
// (uploadMedicalCertificateAction auto-creates it) — Super Admin sees it
// through the existing /manage_documents/[userId] folder browser.
function MedicalCertUploadForm({ onUploaded }: { onUploaded: () => void }) {
  const initialState: UploadDocumentState = {};
  const [state, formAction] = useActionState(uploadMedicalCertificateAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const lastState = useRef<UploadDocumentState>(initialState);

  useEffect(() => {
    if (state === lastState.current) return;
    lastState.current = state;
    if (state?.error) toast.error(state.error);
    else if (state?.success) {
      toast.success("Medical certificate uploaded.");
      formRef.current?.reset();
      onUploaded();
    }
  }, [state, onUploaded]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-wrap items-center gap-2 mt-2">
      <input name="file" type="file" required className="glass-input min-w-0 flex-1 px-3 py-1.5 text-xs" />
      <MedicalCertUploadButton />
    </form>
  );
}

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

// Abeer, 2026-11-27: "on calender its not showing proper half day and
// full day" — the same fix as LeaveCalendar.tsx: day_type is always
// "full" now (half/full is decided per date instead, see buildSegments in
// leaveActions.ts), so these lists need to infer half-day from
// days_count, not day_type, same as the calendar does.
function isHalfDay(r: LeaveRequest): boolean {
  return isWhollyHalfDayRow(r.start_date, r.end_date, r.days_count);
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

// Abeer, 2026-11-27: "hard code a half day or full day leave for any
// employee for the ones formal request is not received" — these entries
// are pre-approved at creation, so the plain "approved" badge alone would
// look exactly like a normal employee-submitted, Super-Admin-decided
// request. This extra badge is what makes the difference visible
// everywhere a request shows up.
function requestBadges(r: LeaveRequest) {
  return (
    <div className="flex flex-col items-end gap-1 shrink-0">
      {statusBadge(r.status)}
      {r.added_by_admin && (
        <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-violet-100 text-violet-700">
          <FaUserShield className="h-2.5 w-2.5" /> Added by Admin
        </span>
      )}
    </div>
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
  mySummary,
  allUsers,
  leaveBalances,
  medicalCertStatusByEmployee,
  myCertOnFile,
}: {
  myRequests: LeaveRequest[];
  allRequests: LeaveRequest[];
  canDecide: boolean;
  threads: Record<string, LeaveRequestMessage[]>;
  viewerId: string;
  mySummary: LeaveSummary | null;
  allUsers: PublicUser[];
  leaveBalances: Record<string, LeaveBalance>;
  medicalCertStatusByEmployee: Record<string, boolean>;
  myCertOnFile: boolean;
}) {
  const router = useRouter();
  const initialState: LeaveRequestState = {};
  const [state, formAction] = useActionState(createLeaveRequestAction, initialState);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  // Abeer, 2026-11-27: "when we choose the date range... it should ask us
  // the options for each range like half day or full day" (2026-11-27),
  // then "along with the type add that sick annual unpaid so that they can
  // select on which day they need to take which leave" — each date in the
  // picked range gets its own leave type AND its own half/full toggle,
  // keyed by "yyyy-MM-dd".
  const [dayPlans, setDayPlans] = useState<Record<string, { leaveType: LeaveType; half: boolean }>>({});
  const todayIso = toLocalIsoDate(new Date());
  const [balanceTarget, setBalanceTarget] = useState<PublicUser | null>(null);
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

  // Abeer, 2026-11-27: "figure out a way to hard code a half day or full
  // day leave for any employee for the ones formal request is not
  // received. Ex - late coming for 3 days in a month" — Super-Admin-only
  // modal: pick an employee, add however many individual dates (each with
  // its own leave type + half/full), submit. Each date is independent, on
  // purpose — "3 days in a month" are rarely consecutive.
  interface AdminLeaveEntry {
    date: string;
    leaveType: LeaveType;
    half: boolean;
  }
  const [addLeaveOpen, setAddLeaveOpen] = useState(false);
  const [addLeaveEmployeeId, setAddLeaveEmployeeId] = useState("");
  const [addLeaveEntries, setAddLeaveEntries] = useState<AdminLeaveEntry[]>([
    { date: "", leaveType: "annual", half: false },
  ]);
  const [addLeaveReason, setAddLeaveReason] = useState("");
  const [addLeavePending, startAddLeaveTransition] = useTransition();

  function openAddLeaveModal() {
    setAddLeaveEmployeeId("");
    setAddLeaveEntries([{ date: "", leaveType: "annual", half: false }]);
    setAddLeaveReason("");
    setAddLeaveOpen(true);
  }
  function addEntryRow() {
    setAddLeaveEntries((prev) => [...prev, { date: "", leaveType: "annual", half: false }]);
  }
  function updateEntryRow(index: number, patch: Partial<AdminLeaveEntry>) {
    setAddLeaveEntries((prev) => prev.map((e, i) => (i === index ? { ...e, ...patch } : e)));
  }
  function removeEntryRow(index: number) {
    setAddLeaveEntries((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));
  }
  function submitAddLeave() {
    if (!addLeaveEmployeeId) {
      toast.error("Pick an employee.");
      return;
    }
    const validEntries = addLeaveEntries.filter((e) => e.date);
    if (validEntries.length === 0) {
      toast.error("Add at least one date.");
      return;
    }
    startAddLeaveTransition(async () => {
      const formData = new FormData();
      formData.set("reason", addLeaveReason.trim());
      formData.set(
        "entries",
        JSON.stringify(validEntries.map((e) => ({ date: e.date, leave_type: e.leaveType, half: e.half })))
      );
      const result = await addLeaveForEmployeeAction(addLeaveEmployeeId, {}, formData);
      if (result.success) {
        toast.success("Leave added.");
        setAddLeaveOpen(false);
        router.refresh();
      } else {
        toast.error(result.error ?? "Could not add leave.");
      }
    });
  }

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const pendingRequests = allRequests.filter((r) => r.status === "pending");

  // Abeer, 2026-11-26: "instead show the real count 8/13 ... so that we
  // can see the complete quick insight there" — the balances table used
  // to show only the assigned totals with no sense of how much each
  // employee had actually used. Same used/total math as the employee's
  // own metric cards (getLeaveSummaryForEmployee in data.ts: approved
  // requests whose start_date falls inside that employee's current
  // balance period), just computed client-side from allRequests so this
  // table doesn't need its own per-employee round trip.
  const usageByEmployee = useMemo(() => {
    const defaultPeriod = calendarYearForDate();
    const result: Record<string, { annualUsed: number; sickUsed: number }> = {};
    for (const u of allUsers) {
      const bal = leaveBalances[u.id];
      const periodStart = bal ? bal.period_start : defaultPeriod.start;
      const periodEnd = bal ? bal.period_end : defaultPeriod.end;
      let annualUsed = 0;
      let sickUsed = 0;
      for (const r of allRequests) {
        if (r.employee_id !== u.id || r.status !== "approved") continue;
        if (r.start_date < periodStart || r.start_date > periodEnd) continue;
        if (r.leave_type === "annual") annualUsed += r.days_count;
        else if (r.leave_type === "sick") sickUsed += r.days_count;
      }
      result[u.id] = { annualUsed, sickUsed };
    }
    return result;
  }, [allUsers, allRequests, leaveBalances]);

  // Abeer, 2026-11-27: three separate warning signals, all computed the
  // same way usageByEmployee is (client-side from allRequests, no extra
  // round trip):
  //  - "medical certificate after 3 single sick days in a quarter"
  //  - "warning for too many too frequent leaves"
  //  - "only 5 earned leaves gets carried forwarded" (unused above that
  //    lapse at year-end — a warning only, nothing here changes a stored
  //    balance number)
  const employeeWarnings = useMemo(() => {
    const quarter = quarterRangeForDate();
    const result: Record<
      string,
      { sickDaysThisQuarter: number; needsMedicalCert: boolean; recentRequestCount: number; isFrequent: boolean; carryForwardExcess: number }
    > = {};
    for (const u of allUsers) {
      const sickDaysThisQuarter = sumApprovedSickDaysInRange(allRequests, u.id, quarter.start, quarter.end);
      const recentRequestCount = countRecentApprovedRequests(allRequests, u.id);
      const usage = usageByEmployee[u.id] ?? { annualUsed: 0, sickUsed: 0 };
      const bal = leaveBalances[u.id];
      const annualTotal = bal ? bal.annual_total : DEFAULT_ANNUAL_LEAVE_DAYS;
      const annualRemaining = Math.max(annualTotal - usage.annualUsed, 0);
      result[u.id] = {
        sickDaysThisQuarter,
        needsMedicalCert: sickDaysThisQuarter >= MEDICAL_CERT_SICK_DAY_THRESHOLD,
        recentRequestCount,
        isFrequent: recentRequestCount >= FREQUENT_LEAVE_REQUEST_COUNT,
        carryForwardExcess: Math.max(annualRemaining - ANNUAL_CARRY_FORWARD_CAP, 0),
      };
    }
    return result;
  }, [allUsers, allRequests, leaveBalances, usageByEmployee]);

  // employeeWarnings above only ever has entries when canDecide (allUsers/
  // leaveBalances are both empty arrays for a regular employee — see
  // page.tsx) — this is the same three signals, computed from data every
  // viewer always has regardless of role (their OWN mySummary/myRequests),
  // so the banners below work for everyone, not just what Super Admin sees
  // in the Employee Leave Balances table.
  const myWarnings = useMemo(() => {
    if (!mySummary) return null;
    const quarter = quarterRangeForDate();
    const sickDaysThisQuarter = sumApprovedSickDaysInRange(myRequests, viewerId, quarter.start, quarter.end);
    const recentRequestCount = countRecentApprovedRequests(myRequests, viewerId);
    const annualRemaining = Math.max(mySummary.annual_total - mySummary.annual_used, 0);
    return {
      sickDaysThisQuarter,
      needsMedicalCert: sickDaysThisQuarter >= MEDICAL_CERT_SICK_DAY_THRESHOLD,
      isFrequent: recentRequestCount >= FREQUENT_LEAVE_REQUEST_COUNT,
      carryForwardExcess: Math.max(annualRemaining - ANNUAL_CARRY_FORWARD_CAP, 0),
    };
  }, [mySummary, myRequests, viewerId]);

  // Abeer, 2026-11-27: "remove this day type because anyways we are
  // selecting them from below" — the separate Full/Half Day dropdown is
  // gone; every request (single date or a range) is submitted as "full"
  // day_type, and the per-day Day-by-Day list below (shown even for a
  // single-date range, i.e. start === end) is the only place half vs full
  // — and now leave type too — gets picked, for every date including a
  // lone one.
  const rangeDates = startDate && endDate && endDate >= startDate ? enumerateDateRange(startDate, endDate) : [];

  // Keeps dayPlans in sync with the (possibly just-changed) range: drops
  // any entry no longer in range, and seeds a default ("annual", full day)
  // for any new date — instead of silently carrying stale selections the
  // user can no longer see or un-toggle, or rendering a blank row.
  useEffect(() => {
    if (rangeDates.length === 0) {
      if (Object.keys(dayPlans).length > 0) setDayPlans({});
      return;
    }
    setDayPlans((prev) => {
      let changed = Object.keys(prev).length !== rangeDates.length;
      const next: typeof prev = {};
      for (const d of rangeDates) {
        if (prev[d]) {
          next[d] = prev[d];
        } else {
          next[d] = { leaveType: "annual", half: false };
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate]);

  function setDayLeaveType(date: string, lt: LeaveType) {
    setDayPlans((prev) => ({ ...prev, [date]: { leaveType: lt, half: prev[date]?.half ?? false } }));
  }

  function toggleDayHalf(date: string) {
    setDayPlans((prev) => ({
      ...prev,
      [date]: { leaveType: prev[date]?.leaveType ?? "annual", half: !(prev[date]?.half ?? false) },
    }));
  }

  // Per-leave-type day totals across the whole range — replaces the old
  // single "this counts as N days" line, since different dates can now
  // count against different balances (Annual vs Sick vs Unpaid) in the
  // same submission.
  const typeSummary: Partial<Record<LeaveType, number>> = {};
  for (const d of rangeDates) {
    const plan = dayPlans[d];
    if (!plan) continue;
    const amount = plan.half ? 0.5 : 1;
    typeSummary[plan.leaveType] = (typeSummary[plan.leaveType] ?? 0) + amount;
  }

  useEffect(() => {
    if (state === lastState.current) return;
    lastState.current = state;
    if (state?.error) toast.error(state.error);
    else if (state?.success) {
      toast.success("Leave request submitted.");
      formRef.current?.reset();
      setStartDate("");
      setEndDate("");
      setDayPlans({});
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
      <p className="text-sm text-muted mb-4">
        Submit a leave request below.{" "}
        {canDecide && "Pending requests from everyone are waiting below for your decision, with the complete history underneath."}
      </p>

      {mySummary && (
        <div className="mb-6">
          {/* Abeer, 2026-11-27: "remove that metric card option... of
              casual and others because its showing there" — Other/Casual
              dropped since neither is offered on the form anymore (see
              LEAVE_TYPE_OPTIONS above); mySummary.other_used can still be
              nonzero from old historical rows, it just isn't surfaced
              here. */}
          <div className="grid grid-cols-3 gap-3">
            <MetricCard
              icon={<FaUmbrellaBeach />}
              label="Annual / Earned"
              used={mySummary.annual_used}
              total={mySummary.annual_total}
              accent="bg-blue-500"
            />
            <MetricCard
              icon={<FaThermometerHalf />}
              label="Sick"
              used={mySummary.sick_used}
              total={mySummary.sick_total}
              accent="bg-rose-500"
            />
            <MetricCard icon={<FaMoneyBillWave />} label="Unpaid" used={mySummary.unpaid_used} accent="bg-gray-500" />
          </div>
          {/* Abeer, 2026-11-27: "Instead of financial year - we should
              call it calendar year 2026 or date range based on whats
              applied to each employees calendar" — a custom-assigned
              period keeps whatever date range was allotted (no forced
              "Calendar Year" label unless it genuinely is one). */}
          <p className="text-xs text-muted mt-2">
            {calendarYearLabelForPeriod(mySummary.period_start, mySummary.period_end) ??
              `${mySummary.period_start} – ${mySummary.period_end}`}
            {mySummary.isDefaultBalance ? " · default allocation — ask your Super Admin to assign your real balance." : ""}
          </p>
          {myWarnings && myWarnings.carryForwardExcess > 0 && (
            <p className="text-xs text-amber-700 mt-1 flex items-center gap-1.5">
              <FaExclamationTriangle className="h-3 w-3 shrink-0" />
              {myWarnings.carryForwardExcess} unused Annual/Earned day
              {myWarnings.carryForwardExcess === 1 ? "" : "s"} will lapse at year-end — only {ANNUAL_CARRY_FORWARD_CAP} days carry
              forward.
            </p>
          )}
          {myWarnings && myWarnings.needsMedicalCert && (
            <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
              <p className="text-xs text-amber-800 flex items-center gap-1.5">
                <FaFileMedical className="h-3 w-3 shrink-0" />
                You&apos;ve taken {myWarnings.sickDaysThisQuarter} sick day
                {myWarnings.sickDaysThisQuarter === 1 ? "" : "s"} this quarter.
                {myCertOnFile
                  ? " Your medical certificate is on file."
                  : " Please upload a medical certificate."}
              </p>
              {!myCertOnFile && <MedicalCertUploadForm onUploaded={() => router.refresh()} />}
            </div>
          )}
        </div>
      )}

      {canDecide && (
        <div className="mb-4 flex justify-end">
          <button
            type="button"
            onClick={openAddLeaveModal}
            className="btn-ghost inline-flex items-center gap-2 px-4 py-2 text-sm"
          >
            <FaUserShield className="h-3.5 w-3.5" /> Add Leave for Employee
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[22rem_1fr] gap-6 items-start">
        <form ref={formRef} action={formAction} className="glass-strong p-6 flex flex-col gap-4">
          <h2 className="text-lg font-semibold">New Request</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm text-muted mb-1 block">Start Date</label>
              <DatePicker value={startDate} onChange={setStartDate} name="start_date" required placeholder="Start date" minDate={todayIso} />
            </div>
            <div>
              <label className="text-sm text-muted mb-1 block">End Date</label>
              <DatePicker value={endDate} onChange={setEndDate} name="end_date" required placeholder="End date" minDate={startDate || todayIso} />
            </div>
          </div>
          {/* Abeer, 2026-11-27: "along with the type add that sick annual
              unpaid so that they can select on which day they need to take
              which leave... remove that from below and add it there
              itself so now redesign that box properly" — the single
              whole-request Leave Type dropdown is gone; every date gets
              its own leave type AND its own half/full toggle. A range that
              mixes types (e.g. 2 annual days then 1 sick day) becomes one
              request per contiguous same-type run — see
              createLeaveRequestAction. */}
          {rangeDates.length > 0 && (
            <div>
              <label className="text-sm text-muted mb-1 block">
                Day-by-Day <span className="text-gray-400">(leave type + half/full, per date)</span>
              </label>
              <div className="rounded-lg border border-gray-200 divide-y divide-gray-100 max-h-56 overflow-y-auto scrollbar-y-thin">
                {rangeDates.map((d) => {
                  const plan = dayPlans[d] ?? { leaveType: "annual" as LeaveType, half: false };
                  return (
                    <div key={d} className="flex items-center gap-2 px-3 py-2">
                      <span className="text-xs text-muted w-[4.5rem] shrink-0">{formatDate(d)}</span>
                      <Select
                        value={plan.leaveType}
                        onChange={(v) => setDayLeaveType(d, v as LeaveType)}
                        options={LEAVE_TYPE_OPTIONS}
                        className="min-w-0 flex-1"
                      />
                      <button
                        type="button"
                        onClick={() => toggleDayHalf(d)}
                        className={`shrink-0 px-2 py-1 rounded-md text-[11px] font-medium border transition-colors ${
                          plan.half
                            ? "border-amber-300 bg-amber-50 text-amber-700"
                            : "border-gray-200 text-muted hover:bg-gray-50"
                        }`}
                      >
                        {plan.half ? "½ day" : "Full day"}
                      </button>
                    </div>
                  );
                })}
              </div>
              <input
                type="hidden"
                name="day_plans"
                value={JSON.stringify(
                  rangeDates.map((d) => ({
                    date: d,
                    leave_type: dayPlans[d]?.leaveType ?? "annual",
                    half: !!dayPlans[d]?.half,
                  }))
                )}
              />
            </div>
          )}
          <div>
            <label className="text-sm text-muted mb-1 block">Reason</label>
            <textarea name="reason" rows={3} className="glass-input w-full px-3 py-2.5 text-sm" placeholder="Optional" />
          </div>
          {Object.keys(typeSummary).length > 0 && (
            <p className="text-xs text-accent font-medium -mt-1">
              {Object.entries(typeSummary)
                .map(([t, n]) => `${LEAVE_TYPE_LABEL[t] ?? t}: ${n} day${n === 1 ? "" : "s"}`)
                .join(" · ")}
            </p>
          )}
          <SubmitButton />
        </form>

        {/* Abeer, 2026-11-27: "taking the complete page for the leave msg
            ... make it normal screen so that we can see the data properly
            in a single screen not to scroll horizontally" — the real bug:
            this is a CSS Grid column (the "1fr" track above), which
            defaults to a content-based minimum width, not 0. A long
            one-line reason/history string has a huge "don't-wrap" min
            width, so the grid track (and the whole page) was stretching to
            fit it instead of the text ever actually truncating. min-w-0
            here overrides that default and lets every truncate/min-w-0
            child below finally do its job. */}
        <div className="min-w-0 flex flex-col gap-6">
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
                          {isHalfDay(r) ? " (half day)" : ""}
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
                            {isHalfDay(r) ? " (half day)" : ""}
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
                        {requestBadges(r)}
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
                        {isHalfDay(r) ? " (half day)" : ""}
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
                    {requestBadges(r)}
                  </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Abeer, 2026-11-27: "make it below only at top there will be that
          form like how it was earlier then calender then insights so the
          format would be earlier one" — back to the original order (form
          + approval queues first, calendar + balances insight below). The
          real fix for "where is the calendar" was the min-w-0 bug above,
          not the ordering. */}
      {canDecide && (
        <div className="mt-6 flex flex-col gap-6">
          <LeaveCalendar requests={allRequests} />

          <div className="glass !p-0 overflow-hidden flex flex-col">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="font-semibold flex items-center gap-2">
                <FaCalendarAlt className="text-accent h-4 w-4" /> Employee Leave Balances
              </h2>
              <p className="text-xs text-muted mt-0.5">
                Assign each employee&apos;s annual/earned and sick totals for a period — defaults to
                the calendar year unless you&apos;ve allotted a custom one. Same thing as the leave
                icon on Employees &amp; Roles.
              </p>
            </div>
            <div className="overflow-x-auto scrollbar-x-thin">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-4 py-2.5">Employee</th>
                    <th className="px-4 py-2.5">Period</th>
                    <th className="px-4 py-2.5">Annual / Earned (used/total)</th>
                    <th className="px-4 py-2.5">Sick (used/total)</th>
                    <th className="px-4 py-2.5">Flags</th>
                    <th className="px-4 py-2.5"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {allUsers.map((u) => {
                    const bal = leaveBalances[u.id];
                    const annualTotal = bal ? bal.annual_total : DEFAULT_ANNUAL_LEAVE_DAYS;
                    const sickTotal = bal ? bal.sick_total : DEFAULT_SICK_LEAVE_DAYS;
                    const usage = usageByEmployee[u.id] ?? { annualUsed: 0, sickUsed: 0 };
                    const periodStart = bal ? bal.period_start : calendarYearForDate().start;
                    const periodEnd = bal ? bal.period_end : calendarYearForDate().end;
                    const periodLabel = calendarYearLabelForPeriod(periodStart, periodEnd) ?? `${periodStart} – ${periodEnd}`;
                    const warn = employeeWarnings[u.id];
                    const hasCert = medicalCertStatusByEmployee[u.id] ?? false;
                    return (
                      <tr key={u.id}>
                        <td className="px-4 py-2.5 font-medium">{u.name}</td>
                        <td className="px-4 py-2.5 text-muted whitespace-nowrap">
                          {periodLabel}
                          {!bal && <span className="italic"> (default)</span>}
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={usage.annualUsed > annualTotal ? "font-semibold text-red-600" : ""}>
                            {usage.annualUsed}
                          </span>
                          <span className="text-muted">/{annualTotal}</span>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={usage.sickUsed > sickTotal ? "font-semibold text-red-600" : ""}>
                            {usage.sickUsed}
                          </span>
                          <span className="text-muted">/{sickTotal}</span>
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex flex-wrap gap-1">
                            {warn?.needsMedicalCert && (
                              <span
                                title={`${warn.sickDaysThisQuarter} sick days this quarter`}
                                className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full ${
                                  hasCert ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
                                }`}
                              >
                                <FaFileMedical className="h-2.5 w-2.5" /> {hasCert ? "Cert on file" : "Cert needed"}
                              </span>
                            )}
                            {warn?.isFrequent && (
                              <span
                                title={`${warn.recentRequestCount} approved requests in the last ${FREQUENT_LEAVE_WINDOW_DAYS} days`}
                                className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700"
                              >
                                <FaExclamationTriangle className="h-2.5 w-2.5" /> Frequent
                              </span>
                            )}
                            {warn && warn.carryForwardExcess > 0 && (
                              <span
                                title={`${warn.carryForwardExcess} unused day(s) will lapse at year-end — only ${ANNUAL_CARRY_FORWARD_CAP} carry forward`}
                                className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-sky-100 text-sky-700"
                              >
                                <FaExclamationTriangle className="h-2.5 w-2.5" /> {warn.carryForwardExcess}d lapsing
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <button
                            onClick={() => setBalanceTarget(u)}
                            title="Edit leave balance"
                            className="p-1.5 rounded-lg text-accent hover:bg-accent/10 transition-colors"
                          >
                            <FaEdit className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      <Modal open={addLeaveOpen} onClose={() => setAddLeaveOpen(false)} title="Add Leave for Employee">
        <div className="flex flex-col gap-4">
          <p className="text-xs text-muted -mt-1">
            For leave with no formal request on file (e.g. late coming) — saved already approved,
            labeled &quot;Added by Admin&quot; everywhere it shows up.
          </p>
          <div>
            <label className="text-sm text-muted mb-1 block">Employee</label>
            <Select
              value={addLeaveEmployeeId}
              onChange={setAddLeaveEmployeeId}
              placeholder="-- Select Employee --"
              options={allUsers.map((u) => ({ value: u.id, label: u.name }))}
            />
          </div>
          <div>
            <label className="text-sm text-muted mb-1 block">
              Dates <span className="text-gray-400">(each one independent — don&apos;t need to be consecutive)</span>
            </label>
            <div className="flex flex-col gap-2">
              {addLeaveEntries.map((entry, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2">
                  <div className="w-36">
                    <DatePicker value={entry.date} onChange={(v) => updateEntryRow(i, { date: v })} placeholder="Date" />
                  </div>
                  <Select
                    value={entry.leaveType}
                    onChange={(v) => updateEntryRow(i, { leaveType: v as LeaveType })}
                    options={LEAVE_TYPE_OPTIONS}
                    className="w-28"
                  />
                  <button
                    type="button"
                    onClick={() => updateEntryRow(i, { half: !entry.half })}
                    className={`shrink-0 px-2.5 py-2 rounded-lg text-xs font-medium border transition-colors ${
                      entry.half ? "border-amber-300 bg-amber-50 text-amber-700" : "border-gray-200 text-muted hover:bg-gray-50"
                    }`}
                  >
                    {entry.half ? "½ day" : "Full day"}
                  </button>
                  {addLeaveEntries.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeEntryRow(i)}
                      className="shrink-0 p-2 rounded-lg text-red-600 hover:bg-red-50 transition-colors"
                      title="Remove this date"
                    >
                      <FaTrash className="h-3 w-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addEntryRow}
              className="btn-ghost mt-2 inline-flex items-center gap-2 px-3 py-1.5 text-xs"
            >
              <FaPlus className="h-3 w-3" /> Add Date
            </button>
          </div>
          <div>
            <label className="text-sm text-muted mb-1 block">Reason</label>
            <textarea
              value={addLeaveReason}
              onChange={(e) => setAddLeaveReason(e.target.value)}
              rows={2}
              placeholder="e.g. Late coming — 3 occurrences this month"
              className="glass-input w-full px-3 py-2 text-sm"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setAddLeaveOpen(false)} className="btn-ghost px-4 py-2 text-sm">
              Cancel
            </button>
            <button
              type="button"
              onClick={submitAddLeave}
              disabled={addLeavePending}
              className="btn-primary inline-flex items-center gap-2 px-4 py-2 text-sm"
            >
              <FaCheck className="h-3.5 w-3.5" /> {addLeavePending ? "Adding…" : "Add Leave"}
            </button>
          </div>
        </div>
      </Modal>

      <LeaveBalanceModal
        open={!!balanceTarget}
        onClose={() => setBalanceTarget(null)}
        employee={balanceTarget ? { id: balanceTarget.id, name: balanceTarget.name } : null}
        initialBalance={balanceTarget ? leaveBalances[balanceTarget.id] ?? null : null}
      />

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
