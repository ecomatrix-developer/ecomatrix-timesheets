// Shared salary-slip types/helpers — used by both the client-side live
// preview (SalarySlipsClient.tsx) and the server-side PDF renderer
// (SalarySlipDocument.tsx), so this file must stay free of "server-only"
// and any Node-only imports.

// Abeer, 2026-11-28: salary slip generation module for the Accountant
// panel, modeled exactly on "EcoMatrix - Umesh Anade- August Salary Slip.pdf"
// (extracted field-by-field via pdftotext — see that layout for the
// original). Documents generated here are uploaded into the SAME
// employee_documents/document_folders tables the rest of the Documents
// portal already uses (supabase_patch_8/24), inside each employee's own
// "Salary Slips" folder — no new table or migration needed.
export const SALARY_SLIP_FOLDER_NAME = "Salary Slips";

export interface SalarySlipEarnings {
  basic: number;
  hra: number;
  shiftAllowance: number;
  leaveEncashment: number;
}

export interface SalarySlipDeductions {
  leaveWithoutPay: number;
  tds: number;
  professionTax: number;
}

export interface SalarySlipLeaveRow {
  category: string;
  opening: string;
  availed: string;
  balance: string;
}

export interface SalarySlipFormData {
  employeeId: string;
  employeeName: string;
  location: string;
  roleTitle: string;
  dateOfJoining: string; // yyyy-mm-dd
  month: string; // yyyy-mm, from <input type="month">
  slipType: string;
  earnings: SalarySlipEarnings;
  deductions: SalarySlipDeductions;
  leaveRows: SalarySlipLeaveRow[];
  leaveBalanceAsOn: string; // yyyy-mm-dd
  authorizedName: string;
  authorizedTitle: string;
  ackPlace: string;
}

export function currentYyyyMm(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function defaultSalarySlipFormData(): SalarySlipFormData {
  return {
    employeeId: "",
    employeeName: "",
    location: "",
    roleTitle: "",
    dateOfJoining: "",
    month: currentYyyyMm(),
    slipType: "Salary",
    earnings: { basic: 0, hra: 0, shiftAllowance: 0, leaveEncashment: 0 },
    deductions: { leaveWithoutPay: 0, tds: 0, professionTax: 0 },
    leaveRows: [
      { category: "Earned Leave", opening: "", availed: "", balance: "" },
      { category: "Sick Leave", opening: "", availed: "", balance: "" },
    ],
    leaveBalanceAsOn: lastDayOfMonth(currentYyyyMm()),
    authorizedName: "Mr. Anup Rathi",
    authorizedTitle: "Partner",
    ackPlace: "Nagpur",
  };
}

export function lastDayOfMonth(yyyyMm: string): string {
  const [y, m] = yyyyMm.split("-").map(Number);
  if (!y || !m) return "";
  const d = new Date(y, m, 0); // day 0 of next month = last day of this month
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function monthLabel(yyyyMm: string): string {
  const [y, m] = yyyyMm.split("-").map(Number);
  if (!y || !m) return "";
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export function monthYearLabel(yyyyMm: string): string {
  const [y, m] = yyyyMm.split("-").map(Number);
  if (!y || !m) return "";
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long" }) + ", " + y;
}

export function formatLongDate(isoDate: string): string {
  if (!isoDate) return "";
  const [y, m, d] = isoDate.split("-").map(Number);
  if (!y || !m || !d) return "";
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "long", day: "2-digit", year: "numeric" });
}

/** Indian digit grouping: 1,23,456 rather than 123,456. */
export function formatIndianNumber(value: number): string {
  const sign = value < 0 ? "-" : "";
  const abs = Math.round(Math.abs(value));
  const s = String(abs);
  if (s.length <= 3) return sign + s;
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3);
  const grouped = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  return `${sign}${grouped},${last3}`;
}

const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
  "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function twoDigitWords(n: number): string {
  if (n === 0) return "";
  if (n < 20) return ONES[n];
  const tens = Math.floor(n / 10);
  const ones = n % 10;
  return ones === 0 ? TENS[tens] : `${TENS[tens]}-${ONES[ones]}`;
}

function threeDigitWords(n: number): string {
  const hundred = Math.floor(n / 100);
  const rest = n % 100;
  const parts: string[] = [];
  if (hundred) parts.push(`${ONES[hundred]} Hundred`);
  if (rest) parts.push(twoDigitWords(rest));
  return parts.join(" ");
}

/** Indian-grouped number-to-words (lakh/crore), e.g. "Sixty-Four Thousand Two Hundred Three". */
export function numberToWordsIndian(value: number): string {
  const n = Math.round(Math.abs(value));
  if (n === 0) return "Zero";
  const crore = Math.floor(n / 1_00_00_000);
  const lakh = Math.floor((n % 1_00_00_000) / 1_00_000);
  const thousand = Math.floor((n % 1_00_000) / 1000);
  const hundred = n % 1000;
  const parts: string[] = [];
  if (crore) parts.push(`${threeDigitWords(crore)} Crore`);
  if (lakh) parts.push(`${threeDigitWords(lakh)} Lakh`);
  if (thousand) parts.push(`${threeDigitWords(thousand)} Thousand`);
  if (hundred) parts.push(threeDigitWords(hundred));
  return parts.join(" ");
}

export function amountInWords(value: number): string {
  return `INR ${numberToWordsIndian(value)} Only`;
}

export function totalEarnings(e: SalarySlipEarnings): number {
  return e.basic + e.hra + e.shiftAllowance + e.leaveEncashment;
}

export function totalDeductions(d: SalarySlipDeductions): number {
  return d.leaveWithoutPay + d.tds + d.professionTax;
}

export function totalPayout(e: SalarySlipEarnings, d: SalarySlipDeductions): number {
  return totalEarnings(e) - totalDeductions(d);
}

/**
 * Formats a digital-signature timestamp in IST regardless of the server's
 * own timezone — the company (Nagpur) always signs in IST, and the
 * template's own signature block shows "+05'30'" explicitly, so this
 * computes the IST wall-clock time from the UTC instant rather than
 * trusting `new Date()`'s local getters on whatever machine renders it.
 */
export function formatIstTimestamp(date: Date): string {
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  const ist = new Date(date.getTime() + IST_OFFSET_MS);
  const y = ist.getUTCFullYear();
  const m = String(ist.getUTCMonth() + 1).padStart(2, "0");
  const d = String(ist.getUTCDate()).padStart(2, "0");
  const hh = String(ist.getUTCHours()).padStart(2, "0");
  const mm = String(ist.getUTCMinutes()).padStart(2, "0");
  const ss = String(ist.getUTCSeconds()).padStart(2, "0");
  return `${y}.${m}.${d} ${hh}:${mm}:${ss} +05'30'`;
}

// A row in the /salary_slips history list — plain data read back out of
// employee_documents, not the full EmployeeDocument shape, so this file
// (shared with the client) doesn't need to import that type.
export interface RecentSalarySlip {
  documentId: string;
  employeeId: string;
  fileName: string;
  fileSize: number | null;
  createdAt: string;
}

export function salarySlipFileName(employeeName: string, month: string): string {
  const safe = employeeName.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return `Salary_Slip_${safe}_${monthLabel(month).replace(" ", "_")}.pdf`;
}
