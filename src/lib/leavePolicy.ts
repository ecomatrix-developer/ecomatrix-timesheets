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
