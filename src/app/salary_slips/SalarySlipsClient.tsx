"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  FaFileInvoiceDollar,
  FaPaperPlane,
  FaDownload,
  FaHistory,
  FaUserTie,
  FaLock,
  FaTrash,
} from "react-icons/fa";
import type { PublicUser } from "@/lib/types";
import {
  defaultSalarySlipFormData,
  monthLabel,
  monthYearLabel,
  formatLongDate,
  formatIndianNumber,
  amountInWords,
  totalEarnings,
  totalDeductions,
  totalPayout,
  formatIstTimestamp,
  lastDayOfMonth,
  type SalarySlipFormData,
  type RecentSalarySlip,
} from "@/lib/salarySlip";
import { generateSalarySlipAction } from "@/app/(actions)/salarySlipActions";
import { getDocumentDownloadUrlAction, deleteDocumentAction } from "@/app/(actions)/documentActions";
import Select from "@/components/Select";
import DatePicker from "@/components/DatePicker";
import Modal from "@/components/Modal";
import { triggerFileDownload, triggerBase64Download } from "@/lib/downloadFile";
import { toast } from "@/lib/toast";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}
function formatSize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs text-muted mb-1 block">{label}</label>
      {children}
    </div>
  );
}

// "stepper counter" (native up/down spin buttons) removed from every
// number input on this page — Chrome/Edge/Safari via the arbitrary
// variants, Firefox via the plain `appearance` property.
const inputCls = "glass-input w-full px-3 py-2 text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none";

const MONTH_OPTIONS = [
  { value: "01", label: "January" },
  { value: "02", label: "February" },
  { value: "03", label: "March" },
  { value: "04", label: "April" },
  { value: "05", label: "May" },
  { value: "06", label: "June" },
  { value: "07", label: "July" },
  { value: "08", label: "August" },
  { value: "09", label: "September" },
  { value: "10", label: "October" },
  { value: "11", label: "November" },
  { value: "12", label: "December" },
];

export default function SalarySlipsClient({
  users,
  recentSlips,
}: {
  users: PublicUser[];
  recentSlips: RecentSalarySlip[];
}) {
  const router = useRouter();
  const [form, setForm] = useState<SalarySlipFormData>(() => defaultSalarySlipFormData());
  const [pending, startTransition] = useTransition();
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<RecentSalarySlip | null>(null);
  const [deleting, startDeleteTransition] = useTransition();

  const employeeOptions = useMemo(
    () => users.map((u) => ({ value: u.id, label: `${u.name} (${u.username})` })),
    [users]
  );
  const usersById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);

  const earn = totalEarnings(form.earnings);
  const ded = totalDeductions(form.deductions);
  const payout = totalPayout(form.earnings, form.deductions);

  function update<K extends keyof SalarySlipFormData>(key: K, value: SalarySlipFormData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function selectEmployee(employeeId: string) {
    const u = usersById.get(employeeId);
    setForm((prev) => ({
      ...prev,
      employeeId,
      employeeName: u?.name ?? "",
      roleTitle: u?.job_title ?? prev.roleTitle,
    }));
  }

  function selectMonth(month: string) {
    setForm((prev) => ({ ...prev, month, leaveBalanceAsOn: lastDayOfMonth(month) }));
  }

  const [monthYear, monthNum] = form.month.split("-");
  function selectMonthNum(nextMonthNum: string) {
    selectMonth(`${monthYear || new Date().getFullYear()}-${nextMonthNum}`);
  }
  function selectYear(nextYear: string) {
    selectMonth(`${nextYear}-${monthNum || "01"}`);
  }
  const yearOptions = useMemo(() => {
    const current = new Date().getFullYear();
    const years: { value: string; label: string }[] = [];
    for (let y = current - 6; y <= current + 1; y++) years.push({ value: String(y), label: String(y) });
    return years;
  }, []);

  function updateLeaveRow(index: number, field: "opening" | "availed" | "balance", value: string) {
    setForm((prev) => {
      const rows = prev.leaveRows.slice();
      rows[index] = { ...rows[index], [field]: value };
      return { ...prev, leaveRows: rows };
    });
  }

  function numInput(value: number, onChange: (n: number) => void) {
    return (
      <input
        type="number"
        step="0.01"
        value={value === 0 ? "" : value}
        placeholder="0"
        onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))}
        className={inputCls}
      />
    );
  }

  function validate(): boolean {
    if (!form.employeeId) {
      toast.error("Choose an employee first.");
      return false;
    }
    if (!form.location.trim() || !form.roleTitle.trim() || !form.dateOfJoining) {
      toast.error("Fill in Location, Role, and Date of Joining.");
      return false;
    }
    return true;
  }

  // Abeer, 2026-11-28: "give there an option to automatically send that to
  // emps folders and one to just download that. so that its on user what
  // he wants to do" — "send" mode (unchanged) files the PDF straight into
  // the chosen employee's own Salary Slips folder, visible only to them,
  // Super Admin, and Accountant — never anywhere else. "download" mode
  // never touches storage/the documents tables at all; the PDF comes back
  // as base64 and is saved locally only, nothing is sent to anyone.
  function handleGenerate(mode: "send" | "download") {
    if (!validate()) return;
    startTransition(async () => {
      const result = await generateSalarySlipAction(form, mode);
      if (!result.success) {
        toast.error(result.message);
        return;
      }
      if (mode === "download" && result.pdfBase64 && result.fileName) {
        triggerBase64Download(result.pdfBase64, result.fileName);
        toast.success("Salary slip downloaded.");
        return;
      }
      toast.success(result.message);
      setForm(defaultSalarySlipFormData());
      router.refresh();
    });
  }

  async function handleDownload(doc: RecentSalarySlip) {
    setDownloadingId(doc.documentId);
    const result = await getDocumentDownloadUrlAction(doc.documentId);
    setDownloadingId(null);
    if (result.error || !result.url) {
      toast.error(result.error ?? "Could not get download link.");
      return;
    }
    triggerFileDownload(result.url, doc.fileName);
  }

  // Abeer, 2026-11-28: "give an option here itself to delete that salary
  // slips from here so if by chance they generate wrong one can be
  // deleted" — reuses the same deleteDocumentAction every other document
  // view uses; a generated slip is just an employee_documents row, so
  // this removes both the storage file and the row, pulling it out of the
  // employee's My Documents too.
  function confirmDelete() {
    if (!toDelete) return;
    const target = toDelete;
    startDeleteTransition(async () => {
      const result = await deleteDocumentAction(target.documentId);
      if (result.success) toast.success(result.message);
      else toast.error(result.message);
      setToDelete(null);
      router.refresh();
    });
  }

  // Abeer, 2026-11-28: hydration-mismatch fix — `new Date()` evaluated
  // directly during render produces a different instant on the server
  // (SSR pass) than on the client's first render, so React flags every
  // subsequent digit of the timestamp as a mismatch. Starting blank on
  // both passes and filling it in only after mount means the two renders
  // that actually get diffed are identical; the real, per-generation
  // timestamp that ends up on the PDF/employee's document always comes
  // from the server action, never from this preview value.
  const [previewTimestamp, setPreviewTimestamp] = useState("");
  useEffect(() => {
    setPreviewTimestamp(formatIstTimestamp(new Date()));
  }, []);

  return (
    <div className="w-full">
      <h1 className="text-2xl font-semibold mb-1 flex items-center gap-2">
        <FaFileInvoiceDollar className="text-accent" /> Salary Slip Generation
      </h1>
      <p className="text-sm text-muted mb-6">
        Fill in the details — the preview on the right updates as you type. Generate to send a signed PDF
        straight to the employee&apos;s My Documents.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* ---------------- FORM ---------------- */}
        <div className="glass p-5 flex flex-col gap-5">
          <div>
            <h2 className="text-sm font-semibold mb-3">Employee &amp; Period</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Employee">
                <Select
                  value={form.employeeId}
                  onChange={selectEmployee}
                  options={employeeOptions}
                  placeholder="Select employee…"
                />
              </Field>
              <Field label="Month">
                <div className="grid grid-cols-2 gap-2">
                  <Select value={monthNum} onChange={selectMonthNum} options={MONTH_OPTIONS} placeholder="Month" />
                  <Select value={monthYear} onChange={selectYear} options={yearOptions} placeholder="Year" />
                </div>
              </Field>
              <Field label="Date of Joining">
                <DatePicker
                  value={form.dateOfJoining}
                  onChange={(v) => update("dateOfJoining", v)}
                  placeholder="Select date"
                  captionLayout="dropdown"
                />
              </Field>
              <Field label="Location">
                <input
                  value={form.location}
                  onChange={(e) => update("location", e.target.value)}
                  placeholder="e.g. Nagpur"
                  className={inputCls}
                />
              </Field>
              <Field label="Role / Designation">
                <input
                  value={form.roleTitle}
                  onChange={(e) => update("roleTitle", e.target.value)}
                  placeholder="e.g. BIM Lead Mechanical"
                  className={inputCls}
                />
              </Field>
            </div>
          </div>

          <div>
            <h2 className="text-sm font-semibold mb-3">Earnings (INR)</h2>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Basic">{numInput(form.earnings.basic, (n) => update("earnings", { ...form.earnings, basic: n }))}</Field>
              <Field label="HRA">{numInput(form.earnings.hra, (n) => update("earnings", { ...form.earnings, hra: n }))}</Field>
              <Field label="Shift Allowance">
                {numInput(form.earnings.shiftAllowance, (n) => update("earnings", { ...form.earnings, shiftAllowance: n }))}
              </Field>
              <Field label="Leave Encashment">
                {numInput(form.earnings.leaveEncashment, (n) => update("earnings", { ...form.earnings, leaveEncashment: n }))}
              </Field>
            </div>
          </div>

          <div>
            <h2 className="text-sm font-semibold mb-3">Deductions (INR)</h2>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Leave without Pay">
                {numInput(form.deductions.leaveWithoutPay, (n) => update("deductions", { ...form.deductions, leaveWithoutPay: n }))}
              </Field>
              <Field label="TDS">{numInput(form.deductions.tds, (n) => update("deductions", { ...form.deductions, tds: n }))}</Field>
              <Field label="Profession Tax">
                {numInput(form.deductions.professionTax, (n) => update("deductions", { ...form.deductions, professionTax: n }))}
              </Field>
            </div>
          </div>

          <div>
            <h2 className="text-sm font-semibold mb-3">Leave Details</h2>
            <div className="flex flex-col gap-3">
              {form.leaveRows.map((row, i) => (
                <div key={row.category} className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-end">
                  <p className="text-xs font-semibold sm:col-span-1">{row.category}</p>
                  <input
                    value={row.opening}
                    onChange={(e) => updateLeaveRow(i, "opening", e.target.value)}
                    placeholder="Opening balance"
                    className={inputCls}
                  />
                  <input
                    value={row.availed}
                    onChange={(e) => updateLeaveRow(i, "availed", e.target.value)}
                    placeholder="Availed leave"
                    className={inputCls}
                  />
                  <input
                    value={row.balance}
                    onChange={(e) => updateLeaveRow(i, "balance", e.target.value)}
                    placeholder="Balance"
                    className={inputCls}
                  />
                </div>
              ))}
              <Field label="Leave Balance as on">
                <DatePicker
                  value={form.leaveBalanceAsOn}
                  onChange={(v) => update("leaveBalanceAsOn", v)}
                  placeholder="Select date"
                />
              </Field>
            </div>
          </div>

          <div>
            <h2 className="text-sm font-semibold mb-3">Authorized By</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field label="Name">
                <input value={form.authorizedName} onChange={(e) => update("authorizedName", e.target.value)} className={inputCls} />
              </Field>
              <Field label="Title">
                <input value={form.authorizedTitle} onChange={(e) => update("authorizedTitle", e.target.value)} className={inputCls} />
              </Field>
              <Field label="Acknowledgement Place">
                <input value={form.ackPlace} onChange={(e) => update("ackPlace", e.target.value)} className={inputCls} />
              </Field>
            </div>
          </div>

          <div className="flex flex-col gap-2 mt-1">
            <button
              onClick={() => handleGenerate("send")}
              disabled={pending}
              className="btn-primary w-full min-w-0 inline-flex items-center justify-center gap-2 py-3 text-sm px-3"
            >
              <FaPaperPlane className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">
                {pending
                  ? "Working…"
                  : form.employeeName
                  ? `Generate & Send to ${form.employeeName}'s Documents`
                  : "Generate & Send to Employee's Documents"}
              </span>
            </button>
            <button
              onClick={() => handleGenerate("download")}
              disabled={pending}
              className="btn-ghost w-full min-w-0 inline-flex items-center justify-center gap-2 py-3 text-sm px-3"
            >
              <FaDownload className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{pending ? "Working…" : "Generate & Download Only"}</span>
            </button>
            <p className="text-xs text-muted flex items-center gap-1.5 justify-center text-center">
              <FaLock className="h-3 w-3 shrink-0" />
              {form.employeeName
                ? `"Send" saves this only to ${form.employeeName}'s Documents — visible to them, Super Admin & Accountant, nowhere else.`
                : "\"Send\" saves the PDF only to the selected employee's own Documents — nowhere else."}
            </p>
          </div>
        </div>

        {/* ---------------- LIVE PREVIEW ---------------- */}
        <div className="lg:sticky lg:top-6">
          <div className="glass !p-0 overflow-hidden">
            <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50/60">
              <p className="text-xs font-semibold text-muted">Live Preview</p>
            </div>
            <div className="bg-white p-6 text-[11px] text-gray-800 max-h-[75vh] overflow-y-auto scrollbar-thin">
              <div className="flex items-start justify-between">
                <div className="relative h-10 w-40">
                  <Image
                    src="/salary-slip-logo.png"
                    alt="Eco Matrix"
                    fill
                    className="object-contain object-left"
                  />
                </div>
                <div className="text-right">
                  <p className="font-bold text-[13px]" style={{ color: "#4c3a8f" }}>
                    ECO Matrix Solutions
                  </p>
                  <p className="text-[9px] text-gray-500">101, Plot # 89, Himalaya Classic, Shivaji Nagar, Nagpur - 440010</p>
                  <p className="text-[9px] text-gray-500">+919322737166 · anup@ecomatrix.io · ecomatrix.io</p>
                </div>
              </div>
              <div className="border-b-2 mt-3 mb-3" style={{ borderColor: "#667eea" }} />

              <div
                className="flex items-center justify-between rounded-md px-3 py-2 mb-4"
                style={{ backgroundColor: "#f0f1fd" }}
              >
                <div>
                  <p className="text-[9px] text-gray-500">Salary Slip for the month of</p>
                  <p className="font-bold text-[14px]" style={{ color: "#4c3a8f" }}>
                    {form.month ? monthLabel(form.month) : "—"}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[9px] text-gray-500">Type</p>
                  <p className="font-bold text-[14px]" style={{ color: "#4c3a8f" }}>
                    {form.slipType}
                  </p>
                </div>
              </div>

              <p className="font-bold uppercase tracking-wide text-[10px] mb-2" style={{ color: "#4c3a8f" }}>
                Employee Information
              </p>
              <div className="grid grid-cols-2 gap-y-2 mb-4">
                <div>
                  <p className="text-[9px] text-gray-500">Employee Name</p>
                  <p className="font-bold">{form.employeeName || "—"}</p>
                </div>
                <div>
                  <p className="text-[9px] text-gray-500">Role</p>
                  <p className="font-bold">{form.roleTitle || "—"}</p>
                </div>
                <div>
                  <p className="text-[9px] text-gray-500">Location</p>
                  <p className="font-bold">{form.location || "—"}</p>
                </div>
                <div>
                  <p className="text-[9px] text-gray-500">Date of Joining</p>
                  <p className="font-bold">{form.dateOfJoining ? formatLongDate(form.dateOfJoining) : "—"}</p>
                </div>
              </div>

              <div className="flex gap-3 mb-1">
                <div className="flex-1 rounded-md overflow-hidden border border-gray-200">
                  <div className="flex justify-between px-2.5 py-1.5 text-white font-bold" style={{ backgroundColor: "#667eea" }}>
                    <span>Earnings</span>
                    <span>INR</span>
                  </div>
                  {[
                    ["Basic", form.earnings.basic],
                    ["HRA", form.earnings.hra],
                    ["Shift Allowance", form.earnings.shiftAllowance],
                    ["Leave Encashment", form.earnings.leaveEncashment],
                  ].map(([label, val]) => (
                    <div key={label as string} className="flex justify-between px-2.5 py-1.5 border-b border-gray-100">
                      <span>{label}</span>
                      <span>{formatIndianNumber(val as number)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between px-2.5 py-1.5 font-bold" style={{ backgroundColor: "#f7f7fb" }}>
                    <span>Total Earnings</span>
                    <span>{formatIndianNumber(earn)}</span>
                  </div>
                </div>
                <div className="flex-1 rounded-md overflow-hidden border border-gray-200">
                  <div className="flex justify-between px-2.5 py-1.5 text-white font-bold" style={{ backgroundColor: "#667eea" }}>
                    <span>Deductions</span>
                    <span>INR</span>
                  </div>
                  {[
                    ["Leave without Pay", form.deductions.leaveWithoutPay],
                    ["TDS", form.deductions.tds],
                    ["Profession Tax", form.deductions.professionTax],
                  ].map(([label, val]) => (
                    <div key={label as string} className="flex justify-between px-2.5 py-1.5 border-b border-gray-100">
                      <span>{label}</span>
                      <span>{formatIndianNumber(val as number)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between px-2.5 py-1.5 font-bold" style={{ backgroundColor: "#f7f7fb" }}>
                    <span>Total Deductions</span>
                    <span>{formatIndianNumber(ded)}</span>
                  </div>
                </div>
              </div>

              <div
                className="flex justify-between items-center rounded-md px-3.5 py-2.5 mt-3 mb-1 text-white"
                style={{ backgroundColor: "#4c3a8f" }}
              >
                <span className="font-bold text-[12px]">Total Payout</span>
                <span className="font-bold text-[15px]">INR {formatIndianNumber(payout)}</span>
              </div>
              <p className="text-right text-gray-500 text-[9px] mb-4">{amountInWords(payout)}</p>

              <p className="font-bold uppercase tracking-wide text-[10px] mb-2" style={{ color: "#4c3a8f" }}>
                Leave Details
              </p>
              <div className="rounded-md overflow-hidden border border-gray-200 mb-4">
                <div className="flex px-2.5 py-1.5 text-[9px] font-bold text-gray-500" style={{ backgroundColor: "#f0f1fd" }}>
                  <span className="w-1/4">Leave Category</span>
                  <span className="w-1/4">Opening Balance</span>
                  <span className="w-1/4">Availed Leave</span>
                  <span className="w-1/4">
                    Leave Balance as on {form.leaveBalanceAsOn ? formatLongDate(form.leaveBalanceAsOn) : ""}
                  </span>
                </div>
                {form.leaveRows.map((row) => (
                  <div key={row.category} className="flex px-2.5 py-1.5 border-b border-gray-100">
                    <span className="w-1/4 font-bold">{row.category}</span>
                    <span className="w-1/4">{row.opening || "-"}</span>
                    <span className="w-1/4">{row.availed || "-"}</span>
                    <span className="w-1/4">{row.balance || "-"}</span>
                  </div>
                ))}
              </div>

              <div className="flex justify-between mb-4">
                <div>
                  <p className="text-[9px] text-gray-500 mb-2">Authorized by:</p>
                  <p className="italic font-bold text-[13px]" style={{ color: "#4c3a8f" }}>
                    {form.authorizedName}
                  </p>
                  <p className="text-[8px] text-gray-500 mt-1 leading-snug">
                    Digitally signed by {form.authorizedName.replace(/^Mr\.?\s*|^Ms\.?\s*|^Mrs\.?\s*/i, "").toUpperCase()}
                    <br />
                    Date: {previewTimestamp}
                  </p>
                  <p className="text-[9.5px] mt-2">{form.authorizedName}</p>
                  <p className="text-[9px] text-gray-500">{form.authorizedTitle}</p>
                </div>
              </div>

              <div className="border-t border-gray-200 my-3" />

              <p className="font-bold text-[11px] mb-2" style={{ color: "#4c3a8f" }}>
                Acknowledgement
              </p>
              <p className="text-gray-700 leading-relaxed mb-3">
                I hereby acknowledge that I have fully received the {form.slipType} for{" "}
                {form.month ? monthLabel(form.month) : "—"} (as calculated above) of INR {formatIndianNumber(payout)} (
                {amountInWords(payout)}) on {form.leaveBalanceAsOn ? formatLongDate(form.leaveBalanceAsOn) : "—"}.
              </p>
              <div className="flex justify-between items-end">
                <p className="font-bold text-[10.5px]">{form.employeeName || "—"}</p>
                <p className="text-right text-gray-500">
                  Place: {form.ackPlace}
                  <br />
                  Date: {form.month ? monthYearLabel(form.month) : "—"}.
                </p>
              </div>

              <p className="text-center text-gray-400 text-[8px] mt-5 pt-2 border-t border-gray-200">
                ECO Matrix Solutions - Confidential &amp; for Internal Use Only
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ---------------- HISTORY ---------------- */}
      <div className="glass !p-0 overflow-hidden mt-6">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
          <FaHistory className="text-accent h-4 w-4" />
          <h2 className="font-semibold text-sm">Recently Generated Salary Slips</h2>
        </div>
        <div className="divide-y divide-gray-100">
          {recentSlips.length === 0 ? (
            <p className="text-sm text-muted text-center py-10">No salary slips generated yet.</p>
          ) : (
            recentSlips.map((doc) => {
              const emp = usersById.get(doc.employeeId);
              return (
                <div key={doc.documentId} className="flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 transition-colors">
                  <div className="h-9 w-9 shrink-0 rounded-full bg-accent/10 text-accent flex items-center justify-center">
                    <FaUserTie className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm truncate">{emp?.name ?? "Unknown employee"}</p>
                    <p className="text-xs text-muted truncate">
                      {doc.fileName} · {formatDate(doc.createdAt)}
                      {doc.fileSize ? ` · ${formatSize(doc.fileSize)}` : ""}
                    </p>
                  </div>
                  <button
                    onClick={() => handleDownload(doc)}
                    disabled={downloadingId === doc.documentId}
                    title="Download"
                    className="shrink-0 p-2 rounded-lg text-accent hover:bg-accent/10 transition-colors"
                  >
                    <FaDownload className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => setToDelete(doc)}
                    title="Delete"
                    className="shrink-0 p-2 rounded-lg text-red-600 hover:bg-red-50 transition-colors"
                  >
                    <FaTrash className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>

      <Modal open={!!toDelete} onClose={() => setToDelete(null)} title="Delete salary slip?">
        <p className="text-sm text-muted mb-4">
          This permanently deletes <strong>{toDelete?.fileName}</strong>
          {toDelete ? ` for ${usersById.get(toDelete.employeeId)?.name ?? "this employee"}` : ""} — it disappears
          from their My Documents too. This cannot be undone.
        </p>
        <div className="flex justify-end gap-2">
          <button className="btn-ghost px-4 py-2 text-sm" onClick={() => setToDelete(null)}>
            Cancel
          </button>
          <button className="btn-danger px-4 py-2 text-sm" disabled={deleting} onClick={confirmDelete}>
            {deleting ? "Deleting…" : "Delete"}
          </button>
        </div>
      </Modal>
    </div>
  );
}
