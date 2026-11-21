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
} from "react-icons/fa";
import Select from "@/components/Select";
import { toast } from "@/lib/toast";
import {
  createLeaveRequestAction,
  decideLeaveRequestAction,
  type LeaveRequestState,
} from "@/app/(actions)/leaveActions";
import type { LeaveRequest, LeaveType } from "@/lib/types";

const LEAVE_TYPE_OPTIONS: { value: LeaveType; label: string }[] = [
  { value: "casual", label: "Casual" },
  { value: "sick", label: "Sick" },
  { value: "annual", label: "Annual" },
  { value: "unpaid", label: "Unpaid" },
  { value: "other", label: "Other" },
];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function statusBadge(status: LeaveRequest["status"]) {
  const styles =
    status === "approved"
      ? "bg-emerald-100 text-emerald-700"
      : status === "rejected"
      ? "bg-red-100 text-red-700"
      : "bg-amber-100 text-amber-700";
  return (
    <span className={`text-xs font-medium px-2.5 py-1 rounded-full capitalize ${styles}`}>{status}</span>
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

export default function LeaveClient({
  myRequests,
  pendingRequests,
  canApprove,
}: {
  myRequests: LeaveRequest[];
  pendingRequests: LeaveRequest[];
  canApprove: boolean;
}) {
  const router = useRouter();
  const initialState: LeaveRequestState = {};
  const [state, formAction] = useActionState(createLeaveRequestAction, initialState);
  const [leaveType, setLeaveType] = useState<LeaveType>("casual");
  const formRef = useRef<HTMLFormElement>(null);
  const lastState = useRef<LeaveRequestState>(initialState);
  const [deciding, setDeciding] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (state === lastState.current) return;
    lastState.current = state;
    if (state?.error) toast.error(state.error);
    else if (state?.success) {
      toast.success("Leave request submitted.");
      formRef.current?.reset();
      setLeaveType("casual");
      router.refresh();
    }
  }, [state, router]);

  function decide(requestId: string, decision: "approved" | "rejected") {
    setDeciding(requestId);
    startTransition(async () => {
      const result = await decideLeaveRequestAction(requestId, decision);
      setDeciding(null);
      if (result.success) toast.success(result.message);
      else toast.error(result.message);
      router.refresh();
    });
  }

  return (
    <div className="w-full">
      <h1 className="text-xl font-semibold mb-1 flex items-center gap-2">
        <FaCalendarAlt className="text-accent" /> Leave
      </h1>
      <p className="text-sm text-muted mb-6">
        Submit a leave request below. {canApprove && "Pending requests from everyone are waiting below for your decision."}
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-[22rem_1fr] gap-6 items-start">
        <form ref={formRef} action={formAction} className="glass-strong p-6 flex flex-col gap-4">
          <h2 className="text-lg font-semibold">New Request</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm text-muted mb-1 block">Start Date</label>
              <input type="date" name="start_date" required className="glass-input w-full px-3 py-2.5 text-sm" />
            </div>
            <div>
              <label className="text-sm text-muted mb-1 block">End Date</label>
              <input type="date" name="end_date" required className="glass-input w-full px-3 py-2.5 text-sm" />
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
          {canApprove && (
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
                        onClick={() => decide(r.id, "approved")}
                        disabled={deciding === r.id}
                        title="Approve"
                        className="shrink-0 p-2 rounded-lg text-emerald-600 hover:bg-emerald-50 transition-colors"
                      >
                        <FaCheck className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => decide(r.id, "rejected")}
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

          <div className="glass !p-0 overflow-hidden flex flex-col">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="font-semibold">My Requests</h2>
            </div>
            <div className="divide-y divide-gray-100 max-h-[24rem] overflow-y-auto scrollbar-thin">
              {myRequests.length === 0 ? (
                <p className="text-sm text-muted text-center py-10">No leave requests yet.</p>
              ) : (
                myRequests.map((r) => (
                  <div key={r.id} className="flex items-center gap-3 px-5 py-3.5">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm truncate">
                        {formatDate(r.start_date)} – {formatDate(r.end_date)}
                      </p>
                      <p className="text-xs text-muted truncate capitalize">
                        {r.leave_type}
                        {r.reason ? ` · ${r.reason}` : ""}
                      </p>
                    </div>
                    {statusBadge(r.status)}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
