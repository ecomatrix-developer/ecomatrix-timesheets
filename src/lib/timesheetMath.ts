import { STANDARD_DAILY_HOURS, WEEK_GATE_ROLLOUT_DATE } from "./constants";
import { isWeekend, getPrecedingWeekdays } from "./dateUtils";

/**
 * Overtime rule (mirrors app.py exactly):
 *  - Weekend: ALL hours count as overtime.
 *  - Weekday: hours above STANDARD_DAILY_HOURS (7.75) count as overtime.
 */
export function computeDailyOvertime(dateStr: string, totalHours: number): number {
  if (isWeekend(dateStr)) return totalHours;
  return Math.max(0, totalHours - STANDARD_DAILY_HOURS);
}

/** "Regular" (non-overtime) portion of a day's hours, used in PDF grids. */
export function computeDailyRegular(dateStr: string, totalHours: number): number {
  if (isWeekend(dateStr)) return 0;
  return Math.min(totalHours, STANDARD_DAILY_HOURS);
}

/**
 * PTO total = sum('PTO') + sum('PTO BANKING') across the entries, exactly
 * as v1 computes it (categories only, not 'Special Vacation Banking' etc.
 * which are distinct categories kept separate per the migration decision).
 */
export function computePtoTotal(
  entriesByCategory: Record<string, number>
): number {
  return (entriesByCategory["PTO"] ?? 0) + (entriesByCategory["PTO BANKING"] ?? 0);
}

/**
 * A saved comment "counts" for the submit-button gate unless it's empty or
 * an emptied structured breakdown ('[]') — matches v1's exact check in
 * both updateSubmitButtons() (client) and the /timesheet/submit_day route
 * (server).
 */
export function hasRequiredComment(comment: string | null | undefined): boolean {
  const trimmed = (comment ?? "").trim();
  return trimmed !== "" && trimmed !== "[]";
}

/**
 * New gating rule: a weekday (Mon-Fri) is only editable once every weekday
 * of the IMMEDIATELY PRECEDING Mon-Fri week has been submitted — i.e. an
 * employee can't move on to a new week before fully submitting the last
 * one. Weekends are exempt (always editable).
 *
 * Deliberately NOT retroactive: the gate only applies once the preceding
 * week itself starts on or after WEEK_GATE_ROLLOUT_DATE. Without this
 * anchor, every week already in progress when this feature ships (and any
 * brand-new employee's very first week, which has no prior week at all)
 * would be wrongly locked the instant this code runs.
 */
export function isWeekUnlocked(
  dateStr: string,
  submittedDates: ReadonlySet<string>
): boolean {
  if (isWeekend(dateStr)) return true;
  const priorWeekdays = getPrecedingWeekdays(dateStr);
  if (priorWeekdays[0] < WEEK_GATE_ROLLOUT_DATE) return true;
  return priorWeekdays.every((d) => submittedDates.has(d));
}

export function canSubmitDay(
  dateStr: string,
  totalHoursExcludingOvertimeLogged: number
): { ok: boolean; reason?: string } {
  if (isWeekend(dateStr)) {
    return { ok: true };
  }
  if (totalHoursExcludingOvertimeLogged < STANDARD_DAILY_HOURS) {
    return {
      ok: false,
      reason: `Standard hours for a weekday must be at least ${STANDARD_DAILY_HOURS}. Current total: ${totalHoursExcludingOvertimeLogged}`,
    };
  }
  return { ok: true };
}
