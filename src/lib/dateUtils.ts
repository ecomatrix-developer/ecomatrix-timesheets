// Mirrors v1's month-grid date math (app.py timesheet()/reports()/admin_timesheet_view()):
//   start_of_month = date(year, month, 1)
//   next_month = start_of_month.replace(day=28) + timedelta(days=4)
//   end_of_month = next_month - timedelta(days=next_month.day)
//   dates = [start_of_month ... end_of_month] as 'YYYY-MM-DD' strings

export interface DateInfo {
  date: string; // YYYY-MM-DD
  dayName: string; // 'Mon', 'Tue', ...
  dayNumber: number;
  weekday: number; // 0=Mon ... 6=Sun (Python's datetime.weekday())
}

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

export function toDateStr(y: number, m: number, d: number): string {
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

/** Days in `year`-`month` (month is 1-indexed), replicating the Flask month math. */
export function daysInMonth(year: number, month: number): number {
  // next month, day 1, minus 1 day = last day of `month`
  const firstOfNext = new Date(Date.UTC(year, month, 1)); // JS month is 0-indexed; month here = next month index
  firstOfNext.setUTCDate(firstOfNext.getUTCDate() - 1);
  return firstOfNext.getUTCDate();
}

/** Python-style weekday: Monday=0 ... Sunday=6 */
function pyWeekday(y: number, m: number, d: number): number {
  const jsDay = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Sun..6=Sat
  return (jsDay + 6) % 7; // shift so Mon=0..Sun=6
}

export function getDatesInMonth(year: number, month: number): string[] {
  const count = daysInMonth(year, month);
  const dates: string[] = [];
  for (let d = 1; d <= count; d++) {
    dates.push(toDateStr(year, month, d));
  }
  return dates;
}

export function getDateInfoForMonth(year: number, month: number): DateInfo[] {
  return getDatesInMonth(year, month).map((dateStr) => {
    const d = parseInt(dateStr.slice(8, 10), 10);
    const weekday = pyWeekday(year, month, d);
    return {
      date: dateStr,
      dayName: DAY_NAMES[weekday],
      dayNumber: d,
      weekday,
    };
  });
}

export function isWeekend(dateStr: string): boolean {
  const [y, m, d] = dateStr.split("-").map(Number);
  const wd = pyWeekday(y, m, d);
  return wd >= 5; // Sat=5, Sun=6
}

function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return toDateStr(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

/**
 * The Monday..Friday dates of the calendar week (Mon=0..Sun=6) containing
 * `dateStr`, as 5 'YYYY-MM-DD' strings — independent of month boundaries,
 * since a week can straddle two months.
 */
export function getWeekdaysOfWeek(dateStr: string): string[] {
  const [y, m, d] = dateStr.split("-").map(Number);
  const wd = pyWeekday(y, m, d);
  const monday = addDays(dateStr, -wd);
  return Array.from({ length: 5 }, (_, i) => addDays(monday, i));
}

/**
 * The Monday..Friday dates of the week immediately BEFORE the week
 * containing `dateStr`. Used to gate a new week open only once the prior
 * week's 5 weekdays are all submitted.
 */
export function getPrecedingWeekdays(dateStr: string): string[] {
  const thisWeekMonday = getWeekdaysOfWeek(dateStr)[0];
  const priorMonday = addDays(thisWeekMonday, -7);
  return getWeekdaysOfWeek(priorMonday);
}

export function todayYearMonth(): { year: number; month: number } {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

export const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
