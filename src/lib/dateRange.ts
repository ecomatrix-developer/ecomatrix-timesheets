export const DATE_RANGE_PRESETS = ["7d", "14d", "30d", "3m", "6m", "custom"] as const;
export type DateRangePreset = (typeof DATE_RANGE_PRESETS)[number];

export interface DateRange {
  from: string;
  to: string;
  preset: DateRangePreset;
}

export interface DateRangeParams {
  dateFrom?: string;
  dateTo?: string;
  datePreset?: string;
}

function isValidDate(value: string | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDays(date: string, days: number): string {
  const result = new Date(`${date}T00:00:00.000Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

function addMonths(date: string, months: number): string {
  const result = new Date(`${date}T00:00:00.000Z`);
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result.toISOString().slice(0, 10);
}

export function getPresetDateRange(preset: Exclude<DateRangePreset, "custom">, to = todayUTC()): DateRange {
  const from = preset === "7d"
    ? addDays(to, -6)
    : preset === "14d"
    ? addDays(to, -13)
    : preset === "30d"
    ? addDays(to, -29)
    : preset === "3m"
    ? addMonths(to, -3)
    : addMonths(to, -6);
  return { from, to, preset };
}

export function resolveDateRange(params: DateRangeParams): DateRange {
  const isPreset = DATE_RANGE_PRESETS.includes(params.datePreset as DateRangePreset);
  const preset = isPreset ? params.datePreset as DateRangePreset : "7d";
  if (isValidDate(params.dateFrom) && isValidDate(params.dateTo)) {
    const from = params.dateFrom <= params.dateTo ? params.dateFrom : params.dateTo;
    const to = params.dateFrom <= params.dateTo ? params.dateTo : params.dateFrom;
    return { from, to, preset: preset === "custom" ? "custom" : preset };
  }
  if (preset === "custom") return getPresetDateRange("7d");
  return getPresetDateRange(preset);
}

export function getDateStrings(from: string, to: string): string[] {
  const dates: string[] = [];
  for (let date = from; date <= to; date = addDays(date, 1)) dates.push(date);
  return dates;
}

export function getDateBuckets(from: string, to: string): { label: string; from: string; to: string }[] {
  const dates = getDateStrings(from, to);
  const bucketSize = dates.length <= 31 ? 1 : 7;
  const buckets: { label: string; from: string; to: string }[] = [];
  for (let i = 0; i < dates.length; i += bucketSize) {
    const start = dates[i];
    const end = dates[Math.min(i + bucketSize - 1, dates.length - 1)];
    buckets.push({
      label: bucketSize === 1 ? start.slice(5) : `${start.slice(5)}-${end.slice(5)}`,
      from: start,
      to: end,
    });
  }
  return buckets;
}