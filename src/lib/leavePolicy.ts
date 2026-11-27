// Plain date math + default policy numbers for the leave portal — no DB
// access, so this is safe to import from both server code (data.ts,
// leaveBalanceActions.ts) and client components (LeaveBalanceModal).

// Abeer, 2026-11-26: "the annual/earned are 13 in total and 8 sick leaves"
// — used whenever a Super Admin hasn't assigned a real leave_balances row
// covering the employee's current financial year yet.
export const DEFAULT_ANNUAL_LEAVE_DAYS = 13;
export const DEFAULT_SICK_LEAVE_DAYS = 8;

/**
 * India's standard financial year: April 1 – March 31. Given any date,
 * returns the FY period that contains it, as ISO date strings, plus a
 * display label like "2026-27".
 */
export function financialYearForDate(onDate: Date = new Date()): {
  start: string;
  end: string;
  label: string;
} {
  const year = onDate.getUTCFullYear();
  const month = onDate.getUTCMonth(); // 0-11; April = 3
  const startYear = month >= 3 ? year : year - 1;
  return {
    start: `${startYear}-04-01`,
    end: `${startYear + 1}-03-31`,
    label: financialYearLabel(startYear),
  };
}

export function financialYearLabel(startYear: number): string {
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}

/** Derives the same "2026-27"-style label from a period_start date string. */
export function financialYearLabelForPeriodStart(periodStartIso: string): string {
  return financialYearLabel(parseInt(periodStartIso.slice(0, 4), 10));
}

/**
 * Abeer, 2026-11-27: "Instead of financial year - we should call it
 * calendar year 2026... overall it should be jan to dec" — the DEFAULT
 * leave period (whenever a Super Admin hasn't explicitly assigned one —
 * see defaultLeaveBalancePeriod in data.ts) is now a plain Jan 1 – Dec 31
 * calendar year instead of India's Apr–Mar financial year. An employee
 * with a custom-assigned period (via LeaveBalanceModal) keeps exactly
 * whatever period_start/period_end was explicitly allotted to them —
 * "it will be from the users time period coz we have an option to allot
 * leaves so it will be like that for them."
 */
export function calendarYearForDate(onDate: Date = new Date()): {
  start: string;
  end: string;
  label: string;
} {
  const year = onDate.getUTCFullYear();
  return {
    start: `${year}-01-01`,
    end: `${year}-12-31`,
    label: `Calendar Year ${year}`,
  };
}

/**
 * True when [periodStart, periodEnd] is exactly one Jan 1 – Dec 31 span —
 * lets display code say "Calendar Year 2026" only when that's actually
 * true, and fall back to the plain date range for any other (e.g.
 * custom-assigned) period.
 */
export function calendarYearLabelForPeriod(periodStart: string, periodEnd: string): string | null {
  const startYear = periodStart.slice(0, 4);
  const endYear = periodEnd.slice(0, 4);
  if (periodStart.slice(5) === "01-01" && periodEnd.slice(5) === "12-31" && startYear === endYear) {
    return `Calendar Year ${startYear}`;
  }
  return null;
}

/**
 * Inclusive calendar-day count between two "yyyy-MM-dd" strings (a single
 * day counts as 1, not 0). Shared by createLeaveRequestAction (the actual
 * days_count stored) and the New Request form's live preview, so the
 * number shown while filling the form always matches what gets saved.
 */
export function countCalendarDays(startDate: string, endDate: string): number {
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  return Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
}

/**
 * Every "yyyy-MM-dd" date from startDate to endDate, inclusive. Shared by
 * the New Request form's per-day half/full picker (2026-11-27: "when we
 * choose the date range then it should ask us the options for each range
 * ... so that it will add proper 1 and 0.5 for the respective days") and
 * createLeaveRequestAction's server-side recount of the same list.
 */
export function enumerateDateRange(startDate: string, endDate: string): string[] {
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  const dates: string[] = [];
  for (let t = start.getTime(); t <= end.getTime(); t += 86400000) {
    dates.push(new Date(t).toISOString().slice(0, 10));
  }
  return dates;
}

/**
 * Days count for a multi-day request where some individual dates within
 * the range are marked half-day. Only dates that are actually inside
 * [startDate, endDate] count — anything else sent from the client is
 * ignored rather than trusted, since this also runs server-side on
 * attacker-controlled form data.
 */
export function countDaysWithHalfDays(startDate: string, endDate: string, halfDates: string[]): number {
  const range = enumerateDateRange(startDate, endDate);
  const halfSet = new Set(halfDates);
  let total = 0;
  for (const d of range) total += halfSet.has(d) ? 0.5 : 1;
  return total;
}

/**
 * Abeer, 2026-11-27: "on calender its not showing proper half day and
 * full day" — createLeaveRequestAction now always stores day_type as
 * "full" (the Full/Half Day dropdown is gone; half/full is decided per
 * date instead — see buildSegments in leaveActions.ts), so day_type alone
 * can no longer tell a half-day request apart from a full one. A request
 * row is wholly half-day when its days_count is exactly half its calendar
 * span (0.5 for one day, 1 for two half-days back to back, etc.) — the
 * grouping in buildSegments only ever merges consecutive dates that share
 * the same half/full flag, so this is never a false positive from a mix
 * of half and full days landing in the same row.
 */
export function isWhollyHalfDayRow(startDate: string, endDate: string, daysCount: number): boolean {
  return daysCount === 0.5 * countCalendarDays(startDate, endDate);
}

/**
 * Sum of days_count for one employee's APPROVED requests of one leave
 * type whose start_date falls inside [periodStart, periodEnd] — the same
 * "used" math as getLeaveSummaryForEmployee in data.ts, generalized so
 * both the Leave page's quick-insight table and the Accountant's Leave
 * Overview (year-by-month matrix, supabase_patch_24-era feature) compute
 * it identically instead of two separate copies drifting apart.
 */
export function sumApprovedDaysInRange(
  requests: { employee_id: string; leave_type: string; status: string; start_date: string; days_count: number }[],
  employeeId: string,
  leaveType: string,
  periodStart: string,
  periodEnd: string
): number {
  let total = 0;
  for (const r of requests) {
    if (r.employee_id !== employeeId || r.status !== "approved" || r.leave_type !== leaveType) continue;
    if (r.start_date < periodStart || r.start_date > periodEnd) continue;
    total += r.days_count;
  }
  return total;
}

// Abeer, 2026-11-27: "medical certificate after 3 single sick days in a
// quarter" and "only 5 earned leaves gets carried forwarded." Reuses the
// existing Documents feature (supabase_patch_24's folders) rather than a
// new table — a well-known folder name per employee, auto-created the
// first time uploadMedicalCertificateAction runs for them.
export const MEDICAL_CERT_FOLDER_NAME = "Medical Certificates";
export const MEDICAL_CERT_SICK_DAY_THRESHOLD = 3;
export const ANNUAL_CARRY_FORWARD_CAP = 5;
// "warning for too many too frequent leaves" — no number was given for
// this one; this is my own working definition (documented here so it's
// easy to tune): 4 or more SEPARATE approved leave requests inside any
// trailing 30-day window counts as "too frequent." Flagged in the UI as
// an explicit, named threshold rather than a buried magic number.
export const FREQUENT_LEAVE_REQUEST_COUNT = 4;
export const FREQUENT_LEAVE_WINDOW_DAYS = 30;

/** "yyyy-MM-dd" -> which quarter it falls in, as ISO bounds + a "2026-Q3" label. */
export function quarterRangeForDate(onDate: Date = new Date()): {
  start: string;
  end: string;
  label: string;
} {
  const year = onDate.getUTCFullYear();
  const q = Math.floor(onDate.getUTCMonth() / 3); // 0-3
  const startMonth = q * 3 + 1;
  const endMonth = startMonth + 2;
  const lastDay = new Date(Date.UTC(year, endMonth, 0)).getUTCDate();
  return {
    start: `${year}-${String(startMonth).padStart(2, "0")}-01`,
    end: `${year}-${String(endMonth).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`,
    label: `${year}-Q${q + 1}`,
  };
}

/**
 * Sum of APPROVED sick days for one employee whose start_date falls
 * inside [periodStart, periodEnd] — same shape as sumApprovedDaysInRange,
 * just pre-filtered to "sick" so call sites (the quarterly medical-cert
 * check) don't repeat the leave_type literal.
 */
export function sumApprovedSickDaysInRange(
  requests: { employee_id: string; leave_type: string; status: string; start_date: string; days_count: number }[],
  employeeId: string,
  periodStart: string,
  periodEnd: string
): number {
  return sumApprovedDaysInRange(requests, employeeId, "sick", periodStart, periodEnd);
}

/**
 * Number of separate approved leave requests for one employee whose
 * start_date falls in the trailing FREQUENT_LEAVE_WINDOW_DAYS days
 * (inclusive) from `onDate` — the "too frequent" signal. Counts REQUESTS
 * (rows), not days, since 5 one-day requests in a month reads as more
 * disruptive than one 5-day request, even though both total 5 days.
 */
export function countRecentApprovedRequests(
  requests: { employee_id: string; status: string; start_date: string }[],
  employeeId: string,
  onDate: Date = new Date()
): number {
  const end = onDate.toISOString().slice(0, 10);
  const start = new Date(onDate.getTime() - FREQUENT_LEAVE_WINDOW_DAYS * 86400000).toISOString().slice(0, 10);
  let count = 0;
  for (const r of requests) {
    if (r.employee_id !== employeeId || r.status !== "approved") continue;
    if (r.start_date < start || r.start_date > end) continue;
    count++;
  }
  return count;
}
